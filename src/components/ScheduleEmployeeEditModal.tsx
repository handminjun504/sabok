"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import {
  applyMidYearRebalanceAction,
  previewMidYearRebalanceAction,
  type MidYearChangeInput,
  type MidYearRebalanceActionResult,
} from "@/app/actions/midYearRebalance";
import { Alert } from "@/components/ui/Alert";
import { formatWon } from "@/lib/util/number";

/**
 * 모달 내 controlled 콤마 숫자 입력 — `CommaWonInput` 이 uncontrolled 라 모달 상태와 엮기 까다롭다.
 * 사용자가 입력 중에도 천 단위 구분이 표시되도록 `toLocaleString` 으로 포맷.
 */
function InlineWonInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const display = Number.isFinite(value) ? value.toLocaleString("ko-KR") : "";
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      value={display}
      disabled={disabled}
      onChange={(e) => {
        const d = e.target.value.replace(/[^\d]/g, "");
        const n = d ? Number(d) : 0;
        onChange(Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
      }}
    />
  );
}

/**
 * 해당 월(key)에 등장하는 이벤트/분기 목록.
 * - 정기·커스텀: accrualMonth 에 귀속
 * - 분기: paidMonth 에 귀속
 * `kind` 는 UI 에서 뱃지로 표시하는 용도.
 */
export type ScheduleEditMonthEvent = {
  eventKey: string;
  label: string;
  kind: "regular" | "quarterly";
  /** 현재 기본 금액 (규칙·override 종합한 "지금 보이는" 값) */
  currentAmount: number;
  /** 기저장된 per-event override 금액 (있으면 입력 prefill 용) */
  currentOverride?: number | null;
};

export type ScheduleEditEmployeeInfo = {
  id: string;
  code: string;
  name: string;
  level: number;
};

/**
 * 한 해 동안 "아무 달에도 쓰일 수 있는" 이벤트/분기 목록.
 * 모달의 "＋ 항목 추가" 드롭다운에서 월별로 덧붙일 수 있는 후보를 제공한다.
 */
export type ScheduleEditAvailableEvent = {
  eventKey: string;
  label: string;
  kind: "regular" | "quarterly";
  /**
   * 자연 발생이 아닌 월에 기본으로 제안할 금액(옵션). 예를 들어 현재 레벨 규칙 기준 금액.
   * 사용자는 선택 후 자유롭게 수정 가능. null 이면 0 으로 시작.
   */
  suggestedAmount?: number | null;
};

export type ScheduleEmployeeEditModalProps = {
  open: boolean;
  onClose: () => void;
  year: number;
  employee: ScheduleEditEmployeeInfo;
  /** 1~12월 각 월의 편집 가능한 이벤트 목록(자연 발생·기존 override 기반) */
  eventsByMonth: Record<number, ScheduleEditMonthEvent[]>;
  /** 추가 가능한 이벤트/분기 후보 — 직원 활성 범위를 공유 기준으로 사용 */
  availableEvents: ScheduleEditAvailableEvent[];
  /**
   * 직원 활성 월 범위(1~12). 제공되면 그 범위만 편집 영역으로 노출.
   * 미제공이면 1~12 전 구간을 노출한다.
   */
  activeRange?: { fromMonth: number; toMonth: number };
  /** 적용 시작 월 기본값 (현재 달 이후 가장 가까운 활성 월 등) */
  defaultEffectiveMonth: number;
  canEdit: boolean;
};

type PlanShape = NonNullable<Extract<MidYearRebalanceActionResult, { ok: true }>["plan"]>;

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * 월별 스케줄 개별 수정 모달.
 *
 * - 각 월 × 이벤트별 금액을 입력 (현재값과 다르면 "수정됨" 강조)
 * - effectiveMonth 이후만 실제 override 로 저장 (이전 월은 스냅샷 보호)
 * - baseSalary 불변 유지 — 잔여 월 조정급여 자동 보전
 */
export function ScheduleEmployeeEditModal(props: ScheduleEmployeeEditModalProps) {
  const {
    open,
    onClose,
    year,
    employee,
    eventsByMonth,
    availableEvents,
    activeRange,
    defaultEffectiveMonth,
    canEdit,
  } = props;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [effectiveMonth, setEffectiveMonth] = useState<number>(Math.min(12, Math.max(1, defaultEffectiveMonth)));

  /**
   * 입력 상태: { [month]: { [eventKey]: amount } }
   * - 초기값은 기존 per-event override 가 있으면 그 값, 없으면 현재 값(currentAmount) 으로 prefill.
   * - 원본과 동일하면 사용자가 "수정하지 않은" 것으로 간주해 최종 제출 시 제외.
   */
  const buildInitialInputs = useCallback((): Record<number, Record<string, number>> => {
    const out: Record<number, Record<string, number>> = {};
    for (const m of MONTHS) {
      const evs = eventsByMonth[m] ?? [];
      if (evs.length === 0) continue;
      const row: Record<string, number> = {};
      for (const ev of evs) {
        row[ev.eventKey] = ev.currentOverride != null ? ev.currentOverride : ev.currentAmount;
      }
      out[m] = row;
    }
    return out;
  }, [eventsByMonth]);

  const [inputs, setInputs] = useState<Record<number, Record<string, number>>>(buildInitialInputs);
  /**
   * "자연 발생하지 않는 월" 에 사용자가 새로 추가한 항목 목록.
   * `{ [month]: eventKey[] }`. 각 키의 금액은 `inputs[month][eventKey]` 에 담긴다.
   * 저장 시 inputs 에서 해당 값이 `> 0` 이면 override 로 보내고, 0 이면 제외한다.
   */
  const [addedByMonth, setAddedByMonth] = useState<Record<number, string[]>>({});

  /** 모달이 열리거나 대상이 바뀌면 입력 초기화 */
  useEffect(() => {
    if (!open) return;
    setInputs(buildInitialInputs());
    setAddedByMonth({});
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setApplySuccess(null);
    setEffectiveMonth(Math.min(12, Math.max(1, defaultEffectiveMonth)));
  }, [open, buildInitialInputs, defaultEffectiveMonth]);

  const [preview, setPreview] = useState<PlanShape | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isApplying, startApply] = useTransition();

  /** 추가 후보 빠른 조회용 맵 */
  const availableByKey = useMemo(() => {
    const m = new Map<string, ScheduleEditAvailableEvent>();
    for (const ev of availableEvents) m.set(ev.eventKey, ev);
    return m;
  }, [availableEvents]);

  /** "원래와 다른" 이벤트만 서버에 넘기는 최종 editsByMonth 구성 */
  const changedEditsByMonth = useMemo<Record<number, Record<string, number>>>(() => {
    const out: Record<number, Record<string, number>> = {};
    for (const m of MONTHS) {
      const evs = eventsByMonth[m] ?? [];
      const row = inputs[m] ?? {};
      const diffRow: Record<string, number> = {};
      for (const ev of evs) {
        const cur = Number(row[ev.eventKey] ?? ev.currentAmount);
        const baseline = ev.currentOverride != null ? ev.currentOverride : ev.currentAmount;
        if (Math.round(cur) !== Math.round(baseline)) {
          diffRow[ev.eventKey] = Math.max(0, Math.round(cur));
        } else if (ev.currentOverride != null) {
          /**
           * 기존에 override 가 있던 이벤트는 "원래 override 값 그대로" 로도 유지해야
           * 이후 재분배 2차 이후에도 snapshot 으로 남는다.
           */
          diffRow[ev.eventKey] = Math.max(0, Math.round(ev.currentOverride));
        }
      }
      /** 사용자가 새로 추가한 항목 — 0 초과일 때만 override 로 저장. */
      for (const addedKey of addedByMonth[m] ?? []) {
        if (evs.some((e) => e.eventKey === addedKey)) continue; // 기존에 이미 있으면 위에서 처리됨
        const v = Number(row[addedKey] ?? 0);
        if (!Number.isFinite(v) || v <= 0) continue;
        diffRow[addedKey] = Math.max(0, Math.round(v));
      }
      if (Object.keys(diffRow).length > 0) out[m] = diffRow;
    }
    return out;
  }, [inputs, eventsByMonth, addedByMonth]);

  /** 실제로 "다른" 이벤트가 하나라도 있는지 — 미리보기/적용 버튼 활성화 조건 */
  const hasDiff = useMemo(() => {
    for (const m of MONTHS) {
      const evs = eventsByMonth[m] ?? [];
      const row = inputs[m] ?? {};
      for (const ev of evs) {
        const cur = Number(row[ev.eventKey] ?? ev.currentAmount);
        const baseline = ev.currentOverride != null ? ev.currentOverride : ev.currentAmount;
        if (Math.round(cur) !== Math.round(baseline)) return true;
      }
      for (const addedKey of addedByMonth[m] ?? []) {
        if (evs.some((e) => e.eventKey === addedKey)) continue;
        const v = Number(row[addedKey] ?? 0);
        if (Number.isFinite(v) && v > 0) return true;
      }
    }
    return false;
  }, [inputs, eventsByMonth, addedByMonth]);

  const buildInput = useCallback((): MidYearChangeInput => ({
    kind: "EMPLOYEE_MONTHLY_EDIT",
    effectiveMonth,
    employeeId: employee.id,
    editsByMonth: changedEditsByMonth,
  }), [effectiveMonth, employee.id, changedEditsByMonth]);

  const handlePreview = useCallback(() => {
    setPreviewError(null);
    setApplyError(null);
    setApplySuccess(null);
    startPreview(async () => {
      const r = await previewMidYearRebalanceAction(buildInput());
      if (r.ok) setPreview(r.plan);
      else {
        setPreview(null);
        setPreviewError(r.오류);
      }
    });
  }, [buildInput]);

  const handleApply = useCallback(() => {
    setApplyError(null);
    setApplySuccess(null);
    startApply(async () => {
      const r = await applyMidYearRebalanceAction(buildInput());
      if (r.ok) {
        setPreview(r.plan);
        setApplySuccess("적용되었습니다. 스케줄 화면이 갱신됩니다.");
        setTimeout(() => onClose(), 900);
      } else {
        setApplyError(r.오류);
      }
    });
  }, [buildInput, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const busy = isPreviewing || isApplying;
  /**
   * 노출 월 범위 — `activeRange` 가 주어지면 그 범위만, 아니면 1~12 전부.
   * 자연 발생 이벤트가 없어도 "＋ 항목 추가" 로 쓸 수 있어야 하므로 이벤트 유무로 걸러내지 않는다.
   */
  const displayMonths = activeRange
    ? MONTHS.filter((m) => m >= activeRange.fromMonth && m <= activeRange.toMonth)
    : [...MONTHS];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="닫기"
        onClick={() => (busy ? null : onClose())}
      />
      <div
        ref={dialogRef}
        className="relative z-10 flex max-h-[min(92vh,56rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-[var(--text)]">
              [{employee.code}] {employee.name} · L{employee.level} — 월별 개별 금액 수정
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
              {year}년 스케줄의 월별 이벤트 금액을 개별 수정합니다. 자연 발생 이벤트가 없는 월에도 「＋ 항목 추가」 로
              지급 항목을 끼워 넣을 수 있어요. 적용 월 이전은 이미 지급된 값으로 고정, 이후는 새 금액이 저장되고
              연간 기본급여 합계는 불변으로 유지됩니다.
            </p>
          </div>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-lg text-xl leading-none text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            onClick={() => (busy ? null : onClose())}
            aria-label="닫기"
            disabled={busy}
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!canEdit ? (
            <Alert tone="warn" title="수정 권한이 없습니다">
              조회 전용으로 미리보기까지만 사용할 수 있습니다.
            </Alert>
          ) : null}

          <section className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5">
              적용 월
              <select
                className="input w-24 text-sm"
                value={effectiveMonth}
                onChange={(e) => setEffectiveMonth(Number(e.target.value))}
                disabled={busy}
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-[var(--muted)]">
              {effectiveMonth}월 이전(1~{effectiveMonth - 1}월) 의 입력은 무시되고, {effectiveMonth}월부터의 변경분만
              DB 에 저장됩니다.
            </span>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">월별 이벤트 금액</h3>
            {displayMonths.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">편집 가능한 월이 없습니다.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {displayMonths.map((m) => {
                  const evs = eventsByMonth[m] ?? [];
                  const addedKeys = addedByMonth[m] ?? [];
                  const addedOnly = addedKeys.filter((k) => !evs.some((e) => e.eventKey === k));
                  const isPre = m < effectiveMonth;
                  const hasAnything = evs.length > 0 || addedOnly.length > 0;
                  /** 드롭다운 후보 — 이미 월에 등장하는 키(자연 발생 + 추가된 것) 는 제외 */
                  const taken = new Set<string>([
                    ...evs.map((e) => e.eventKey),
                    ...addedOnly,
                  ]);
                  const candidates = availableEvents.filter((ev) => !taken.has(ev.eventKey));
                  return (
                    <div
                      key={m}
                      className={
                        "rounded-md border px-3 py-2 " +
                        (isPre
                          ? "border-[var(--border)] bg-[var(--surface-hover)]/60 opacity-70"
                          : "border-[var(--border)] bg-[var(--surface)]")
                      }
                      title={isPre ? "적용 월 이전 — 저장되지 않습니다" : undefined}
                    >
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-xs font-semibold text-[var(--text)]">{m}월</span>
                        {isPre ? <span className="text-[10px] text-[var(--muted)]">지급 완료</span> : null}
                      </div>
                      <ul className="space-y-1.5">
                        {evs.map((ev) => {
                          const row = inputs[m] ?? {};
                          const cur = Number(row[ev.eventKey] ?? ev.currentAmount);
                          const baseline = ev.currentOverride != null ? ev.currentOverride : ev.currentAmount;
                          const changed = Math.round(cur) !== Math.round(baseline);
                          return (
                            <li key={ev.eventKey} className="flex items-center gap-2">
                              <span
                                className={
                                  "shrink-0 rounded-sm border px-1 py-px text-[10px] font-bold leading-none " +
                                  (ev.kind === "quarterly"
                                    ? "border-[color:color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]"
                                    : "border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)]")
                                }
                              >
                                {ev.kind === "quarterly" ? "분기" : "정기"}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs text-[var(--text)]">{ev.label}</span>
                              <InlineWonInput
                                className={
                                  "input w-28 text-right text-xs tabular-nums " +
                                  (changed && !isPre
                                    ? "border-[var(--warn)] bg-[color:color-mix(in_srgb,var(--warn)_15%,var(--surface))]"
                                    : "")
                                }
                                value={cur}
                                onChange={(n) => {
                                  setInputs((prev) => {
                                    const nextRow = { ...(prev[m] ?? {}) };
                                    nextRow[ev.eventKey] = n;
                                    return { ...prev, [m]: nextRow };
                                  });
                                }}
                                disabled={busy || !canEdit || isPre}
                              />
                              {changed ? (
                                <button
                                  type="button"
                                  className="text-[10px] text-[var(--muted)] underline-offset-2 hover:underline"
                                  onClick={() => {
                                    setInputs((prev) => {
                                      const nextRow = { ...(prev[m] ?? {}) };
                                      nextRow[ev.eventKey] = baseline;
                                      return { ...prev, [m]: nextRow };
                                    });
                                  }}
                                  disabled={busy}
                                  title={`원래 ${formatWon(baseline)}원으로 되돌리기`}
                                >
                                  ↺
                                </button>
                              ) : (
                                <span className="w-4" />
                              )}
                            </li>
                          );
                        })}
                        {addedOnly.map((key) => {
                          const meta = availableByKey.get(key);
                          const row = inputs[m] ?? {};
                          const cur = Number(row[key] ?? 0);
                          const label = meta?.label ?? key;
                          const kind = meta?.kind ?? "regular";
                          return (
                            <li
                              key={`added-${key}`}
                              className="flex items-center gap-2 rounded-sm bg-[color:color-mix(in_srgb,var(--warn)_8%,transparent)] px-1.5 py-0.5"
                            >
                              <span
                                className={
                                  "shrink-0 rounded-sm border px-1 py-px text-[10px] font-bold leading-none " +
                                  (kind === "quarterly"
                                    ? "border-[color:color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]"
                                    : "border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)]")
                                }
                              >
                                {kind === "quarterly" ? "분기" : "정기"}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs text-[var(--text)]">
                                {label}
                                <span className="ml-1 rounded-sm bg-[var(--warn-soft)] px-1 py-px text-[9px] font-semibold text-[var(--warn)]">
                                  추가
                                </span>
                              </span>
                              <InlineWonInput
                                className={
                                  "input w-28 text-right text-xs tabular-nums " +
                                  (cur > 0 && !isPre
                                    ? "border-[var(--warn)] bg-[color:color-mix(in_srgb,var(--warn)_15%,var(--surface))]"
                                    : "")
                                }
                                value={cur}
                                onChange={(n) => {
                                  setInputs((prev) => {
                                    const nextRow = { ...(prev[m] ?? {}) };
                                    nextRow[key] = n;
                                    return { ...prev, [m]: nextRow };
                                  });
                                }}
                                disabled={busy || !canEdit || isPre}
                              />
                              <button
                                type="button"
                                className="text-[10px] text-[var(--danger)] underline-offset-2 hover:underline"
                                onClick={() => {
                                  setAddedByMonth((prev) => ({
                                    ...prev,
                                    [m]: (prev[m] ?? []).filter((k) => k !== key),
                                  }));
                                  setInputs((prev) => {
                                    const nextRow = { ...(prev[m] ?? {}) };
                                    delete nextRow[key];
                                    return { ...prev, [m]: nextRow };
                                  });
                                }}
                                disabled={busy}
                                title="추가 취소"
                              >
                                ×
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {!hasAnything ? (
                        <p className="mb-1 text-[10px] leading-snug text-[var(--muted)]">
                          이 달에는 자연 발생 이벤트가 없습니다. 아래에서 추가해 지급할 수 있어요.
                        </p>
                      ) : null}
                      {canEdit && !isPre && candidates.length > 0 ? (
                        <div className="mt-2">
                          <select
                            className="input w-full text-xs"
                            value=""
                            onChange={(e) => {
                              const key = e.target.value;
                              if (!key) return;
                              const meta = availableByKey.get(key);
                              setAddedByMonth((prev) => ({
                                ...prev,
                                [m]: [...(prev[m] ?? []), key],
                              }));
                              setInputs((prev) => {
                                const nextRow = { ...(prev[m] ?? {}) };
                                const seed =
                                  meta?.suggestedAmount != null && Number.isFinite(meta.suggestedAmount)
                                    ? Math.max(0, Math.round(Number(meta.suggestedAmount)))
                                    : 0;
                                nextRow[key] = seed;
                                return { ...prev, [m]: nextRow };
                              });
                              /** 한 번 선택 후 select 는 다시 placeholder 로 돌아가도록 */
                              e.currentTarget.value = "";
                            }}
                            disabled={busy}
                          >
                            <option value="">＋ 항목 추가…</option>
                            {candidates.map((c) => (
                              <option key={c.eventKey} value={c.eventKey}>
                                [{c.kind === "quarterly" ? "분기" : "정기"}] {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">미리보기 / 적용</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handlePreview}
                disabled={busy || !hasDiff}
              >
                {isPreviewing ? "계산 중…" : "미리보기"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApply}
                disabled={busy || !canEdit || !hasDiff}
                title={!hasDiff ? "변경된 항목이 없습니다" : undefined}
              >
                {isApplying ? "적용 중…" : "적용"}
              </button>
              {!hasDiff ? (
                <span className="text-xs text-[var(--muted)]">아직 변경된 항목이 없습니다.</span>
              ) : null}
            </div>
            {previewError ? (
              <Alert tone="danger" title="미리보기 실패" assertive>
                {previewError}
              </Alert>
            ) : null}
            {applyError ? (
              <Alert tone="danger" title="적용 실패" assertive>
                {applyError}
              </Alert>
            ) : null}
            {applySuccess ? (
              <Alert tone="success" title="완료">
                {applySuccess}
              </Alert>
            ) : null}
            {preview ? <PreviewTable plan={preview} /> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function PreviewTable({ plan }: { plan: PlanShape }) {
  const emp = plan.affectedEmployees;
  const totalDelta = emp.reduce((s, r) => s + r.deltaAnnualWelfare, 0);
  const effectiveMonth = plan.request.effectiveMonth;
  return (
    <div className="space-y-3">
      {plan.warnings.length > 0 ? (
        <Alert tone="warn" title="경고">
          <ul className="list-disc pl-5">
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <p className="text-xs text-[var(--muted)]">
        대상 <strong className="text-[var(--text)]">{emp.length}명</strong> · 연간 사복 합계 Δ{" "}
        <strong className="text-[var(--text)] tabular-nums">{formatWon(totalDelta)}원</strong>
        {totalDelta < 0 ? " (사복 증가 → 조정급여 감액)" : totalDelta > 0 ? " (사복 감소 → 조정급여 가산)" : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-[11px]">
          <thead className="text-[var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th className="sticky left-0 z-10 bg-[var(--panel)] px-2 py-1 text-left">직원 / 구분</th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  className={`px-1.5 py-1 text-right ${m < effectiveMonth ? "text-[var(--muted)]" : "font-semibold text-[var(--text)]"}`}
                >
                  {m}월
                </th>
              ))}
              <th className="px-2 py-1 text-right">합계</th>
              <th className="px-2 py-1 text-right">Δ</th>
              <th className="px-2 py-1 text-right">잔여월</th>
              <th className="px-2 py-1 text-right">월 가산</th>
              <th className="px-2 py-1 text-right">12월 정산</th>
              <th className="px-2 py-1 text-left">경고</th>
            </tr>
          </thead>
          <tbody>
            {emp.map((r) => {
              const beforeSum = Object.values(r.welfareBeforeByMonth).reduce((s, v) => s + v, 0);
              const afterSum = Object.values(r.welfareAfterByMonth).reduce((s, v) => s + v, 0);
              return (
                <Fragment key={r.employeeId}>
                  <tr className="border-b border-[var(--border)]/50 tabular-nums">
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-10 bg-[var(--panel)] px-2 py-1 text-left align-top font-normal"
                    >
                      [{r.employeeCode}] {r.name}
                      <br />
                      <span className="text-[var(--muted)]">L{r.currentLevel}</span>
                    </th>
                    {MONTHS.map((m) => {
                      const v = r.welfareBeforeByMonth[m] ?? 0;
                      const isPre = m < effectiveMonth;
                      return (
                        <td
                          key={m}
                          className={`px-1.5 py-0.5 text-right ${isPre ? "bg-[var(--border)]/30 text-[var(--muted)]" : "text-[var(--muted)]"}`}
                          title="변경 前 사복"
                        >
                          {v ? formatWon(v) : "-"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-0.5 text-right text-[var(--muted)]">{formatWon(beforeSum)}</td>
                    <td className="px-2 py-0.5 text-right" rowSpan={2}>
                      {formatWon(r.deltaAnnualWelfare)}
                    </td>
                    <td className="px-2 py-0.5 text-right" rowSpan={2}>
                      {r.remainingMonths}
                    </td>
                    <td className="px-2 py-0.5 text-right" rowSpan={2}>
                      {formatWon(r.addPerMonth)}
                    </td>
                    <td className="px-2 py-0.5 text-right" rowSpan={2}>
                      {formatWon(r.remainderAtDecember)}
                    </td>
                    <td className="px-2 py-0.5 text-left text-[var(--warn)]" rowSpan={2}>
                      {r.warnings.join(" · ")}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--border)] tabular-nums">
                    {MONTHS.map((m) => {
                      const before = r.welfareBeforeByMonth[m] ?? 0;
                      const after = r.welfareAfterByMonth[m] ?? 0;
                      const isPre = m < effectiveMonth;
                      const changed = !isPre && before !== after;
                      const frozenOk = isPre && before === after;
                      return (
                        <td
                          key={m}
                          className={`px-1.5 py-0.5 text-right ${
                            isPre
                              ? frozenOk
                                ? "bg-[var(--border)]/30 text-[var(--text)]"
                                : "bg-[var(--danger-bg,#fee2e2)] text-[var(--danger,#b91c1c)]"
                              : changed
                                ? "bg-[var(--warn-bg,#fef3c7)] font-semibold text-[var(--text)]"
                                : "text-[var(--text)]"
                          }`}
                          title={
                            isPre
                              ? frozenOk
                                ? "이미 지급된 월 · 변경 없음"
                                : "⚠ 이미 지급된 월인데 금액이 변동 (버그 가능)"
                              : changed
                                ? `${formatWon(before)} → ${formatWon(after)}`
                                : "변동 없음"
                          }
                        >
                          {after ? formatWon(after) : "-"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-0.5 text-right font-semibold">{formatWon(afterSum)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
