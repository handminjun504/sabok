"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import {
  applyMidYearRebalanceAction,
  previewMidYearRebalanceAction,
  type MidYearChangeInput,
  type MidYearRebalanceActionResult,
} from "@/app/actions/midYearRebalance";
import { CommaWonInput } from "@/components/CommaWonInput";
import { Alert } from "@/components/ui/Alert";
import { formatWon } from "@/lib/util/number";

type EmployeeOption = {
  id: string;
  code: string;
  name: string;
  level: number;
};

type RuleAmountByLevelEvent = Record<number, Record<string, number>>;

export type MidYearChangeModalProps = {
  open: boolean;
  onClose: () => void;
  year: number;
  /** 1~12 중 기본값으로 사용할 적용 월. 부모 페이지에서 activeMonth 등을 계산해 전달. */
  defaultEffectiveMonth: number;
  /** 현재 레벨 규칙 금액 `[level][eventKey] = amount` — L1 모드 prefill */
  amountsByLevelEvent: RuleAmountByLevelEvent;
  /** 이벤트 키 목록과 라벨 (부모에서 이미 계산한 값을 전달) */
  eventKeys: string[];
  eventLabels: string[];
  /** 직원 선택용 옵션 */
  employees: EmployeeOption[];
  /** 이 업체에서 L3 적용시 Level5Override 를 지원하는지 여부(UI 안내용) */
  canEdit: boolean;
};

type Kind = "LEVEL_RULE" | "EMPLOYEE_LEVEL" | "EMPLOYEE_AMOUNT";

const LEVELS = [1, 2, 3, 4, 5] as const;

/**
 * 월 1~12 중 선택 가능한 효력 발생 월. "effectiveMonth=1" 은 "단순 규칙 교체"로 축퇴되므로
 * UI 에서도 사용자가 1 을 선택하면 경고 배너를 노출한다.
 */
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

type PlanShape = NonNullable<Extract<MidYearRebalanceActionResult, { ok: true }>["plan"]>;

/**
 * 중도 재분배 모달.
 *
 * - 변경 유형·effectiveMonth·입력 → "미리보기" → "적용" 2-step UX.
 * - 미리보기 단계에서는 `previewMidYearRebalanceAction` 만 호출, DB 에는 쓰지 않는다.
 * - 적용 후 성공 시 `onClose()` + 부모는 RSC 재검증으로 스스로 새 데이터 반영.
 */
export function MidYearChangeModal(props: MidYearChangeModalProps) {
  const { open, onClose, year, defaultEffectiveMonth, amountsByLevelEvent, eventKeys, eventLabels, employees, canEdit } =
    props;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<Kind>("LEVEL_RULE");
  const [effectiveMonth, setEffectiveMonth] = useState<number>(
    defaultEffectiveMonth >= 1 && defaultEffectiveMonth <= 12 ? defaultEffectiveMonth : 1,
  );
  const [level, setLevel] = useState<number>(1);
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? "");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [newLevel, setNewLevel] = useState<number>(2);
  const [amountInputs, setAmountInputs] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<PlanShape | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isApplying, startApply] = useTransition();

  /** 모달 오픈 시 state 를 초기값으로 리셋. 재오픈마다 "깨끗한" 입력 폼을 보장. */
  useEffect(() => {
    if (!open) return;
    setKind("LEVEL_RULE");
    setEffectiveMonth(defaultEffectiveMonth >= 1 && defaultEffectiveMonth <= 12 ? defaultEffectiveMonth : 1);
    setLevel(1);
    setEmployeeId(employees[0]?.id ?? "");
    setEmployeeQuery("");
    setNewLevel(2);
    setAmountInputs({});
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setApplySuccess(null);
  }, [open, defaultEffectiveMonth, employees]);

  /**
   * L1·L3 모드에서 prefill 할 금액 맵 계산.
   * - L1: `amountsByLevelEvent[level]` 을 복사
   * - L3: 해당 직원 레벨 기준 금액을 복사 (L5 는 override 가 있을 수 있으나, 여기서는 서버에 맡기고 레벨 값만 prefill)
   */
  const prefillAmounts = useMemo<Record<string, number>>(() => {
    if (kind === "LEVEL_RULE") {
      return { ...(amountsByLevelEvent[level] ?? {}) };
    }
    if (kind === "EMPLOYEE_AMOUNT") {
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) return {};
      return { ...(amountsByLevelEvent[emp.level] ?? {}) };
    }
    return {};
  }, [kind, level, amountsByLevelEvent, employees, employeeId]);

  /** 모달 오픈 이후 kind·level·employee 변화 시 입력을 prefill 로 자동 세팅. 사용자가 타이핑한 값은 유지. */
  const prefillSignatureRef = useRef<string>("");
  useEffect(() => {
    const sig = `${kind}:${level}:${employeeId}`;
    if (prefillSignatureRef.current === sig) return;
    prefillSignatureRef.current = sig;
    if (kind === "LEVEL_RULE" || kind === "EMPLOYEE_AMOUNT") {
      setAmountInputs(prefillAmounts);
    } else {
      setAmountInputs({});
    }
    setPreview(null);
  }, [kind, level, employeeId, prefillAmounts]);

  const buildInput = useCallback((): MidYearChangeInput | null => {
    if (effectiveMonth < 1 || effectiveMonth > 12) return null;
    if (kind === "LEVEL_RULE") {
      return {
        kind,
        effectiveMonth,
        level,
        newAmountsByEventKey: amountInputs,
      };
    }
    if (kind === "EMPLOYEE_LEVEL") {
      if (!employeeId) return null;
      return { kind, effectiveMonth, employeeId, newLevel };
    }
    if (!employeeId) return null;
    return {
      kind,
      effectiveMonth,
      employeeId,
      newAmountsByEventKey: amountInputs,
    };
  }, [kind, effectiveMonth, level, employeeId, newLevel, amountInputs]);

  const handlePreview = useCallback(() => {
    setPreviewError(null);
    setApplyError(null);
    setApplySuccess(null);
    const input = buildInput();
    if (!input) {
      setPreviewError("필수 입력이 누락되었습니다.");
      return;
    }
    startPreview(async () => {
      const r = await previewMidYearRebalanceAction(input);
      if (r.ok) {
        setPreview(r.plan);
      } else {
        setPreview(null);
        setPreviewError(r.오류);
      }
    });
  }, [buildInput]);

  const handleApply = useCallback(() => {
    setApplyError(null);
    setApplySuccess(null);
    const input = buildInput();
    if (!input) {
      setApplyError("필수 입력이 누락되었습니다.");
      return;
    }
    startApply(async () => {
      const r = await applyMidYearRebalanceAction(input);
      if (r.ok) {
        setPreview(r.plan);
        setApplySuccess("변경이 적용되었습니다. 스케줄·레벨 화면이 자동으로 갱신됩니다.");
        setTimeout(() => onClose(), 900);
      } else {
        setApplyError(r.오류);
      }
    });
  }, [buildInput, onClose]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        String(e.level).includes(q),
    );
  }, [employees, employeeQuery]);

  /** ESC 로 닫기 & 배경 클릭 닫기 — SelectTenantClient 와 동일 패턴 */
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
        className="relative z-10 flex max-h-[min(92vh,54rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-[var(--text)]">
              {year}년 연중 사복·급여 중도 재분배
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
              이미 지급된 월은 실제값으로 고정되고, 선택한 월부터 새 규칙·금액이 적용됩니다. 연간 기본급여 합계는 불변을 유지합니다.
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

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">1. 변경 유형·시점</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="midyear-kind"
                  value="LEVEL_RULE"
                  checked={kind === "LEVEL_RULE"}
                  onChange={() => setKind("LEVEL_RULE")}
                  disabled={busy}
                />
                레벨 전체 금액
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="midyear-kind"
                  value="EMPLOYEE_LEVEL"
                  checked={kind === "EMPLOYEE_LEVEL"}
                  onChange={() => setKind("EMPLOYEE_LEVEL")}
                  disabled={busy}
                />
                직원 레벨 변경
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="midyear-kind"
                  value="EMPLOYEE_AMOUNT"
                  checked={kind === "EMPLOYEE_AMOUNT"}
                  onChange={() => setKind("EMPLOYEE_AMOUNT")}
                  disabled={busy}
                />
                직원 금액 개별
              </label>
              <label className="flex items-center gap-1.5">
                적용 월
                <select
                  className="input w-24 text-sm"
                  value={effectiveMonth}
                  onChange={(e) => setEffectiveMonth(Number(e.target.value))}
                  disabled={busy}
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {effectiveMonth === 1 ? (
              <Alert tone="info" title="1월부터 적용">
                재분배 없이 연 초부터 새 규칙을 그대로 적용합니다. 이미 지급된 월이 없기 때문에 스냅샷도 생기지 않습니다.
              </Alert>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">2. 세부 입력</h3>
            {kind === "LEVEL_RULE" ? (
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm">
                  대상 레벨
                  <select
                    className="input w-24 text-sm"
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value))}
                    disabled={busy}
                  >
                    {LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        레벨 {lv}
                      </option>
                    ))}
                  </select>
                </label>
                <EventAmountGrid
                  eventKeys={eventKeys}
                  eventLabels={eventLabels}
                  values={amountInputs}
                  onChange={setAmountInputs}
                  disabled={busy}
                />
              </div>
            ) : null}

            {kind === "EMPLOYEE_LEVEL" ? (
              <div className="space-y-2">
                <EmployeePicker
                  employees={filteredEmployees}
                  query={employeeQuery}
                  onQueryChange={setEmployeeQuery}
                  value={employeeId}
                  onChange={setEmployeeId}
                  disabled={busy}
                />
                <label className="flex items-center gap-1.5 text-sm">
                  새 레벨
                  <select
                    className="input w-24 text-sm"
                    value={newLevel}
                    onChange={(e) => setNewLevel(Number(e.target.value))}
                    disabled={busy}
                  >
                    {LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        레벨 {lv}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {kind === "EMPLOYEE_AMOUNT" ? (
              <div className="space-y-2">
                <EmployeePicker
                  employees={filteredEmployees}
                  query={employeeQuery}
                  onQueryChange={setEmployeeQuery}
                  value={employeeId}
                  onChange={setEmployeeId}
                  disabled={busy}
                />
                <p className="text-xs text-[var(--muted)]">
                  레벨 5 직원은 `Level5Override` 로, 그 외 직원은 월별 노트의 `welfareOverrideAmount` 로 저장됩니다.
                </p>
                <EventAmountGrid
                  eventKeys={eventKeys}
                  eventLabels={eventLabels}
                  values={amountInputs}
                  onChange={setAmountInputs}
                  disabled={busy}
                />
              </div>
            ) : null}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-outline px-3 py-2 text-sm"
                onClick={handlePreview}
                disabled={busy}
              >
                {isPreviewing ? "계산 중…" : "미리보기"}
              </button>
              <button
                type="button"
                className="btn px-3 py-2 text-sm"
                onClick={handleApply}
                disabled={busy || !canEdit}
                title={canEdit ? undefined : "수정 권한이 없습니다"}
              >
                {isApplying ? "적용 중…" : "적용"}
              </button>
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

function EmployeePicker(props: {
  employees: EmployeeOption[];
  query: string;
  onQueryChange: (q: string) => void;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const { employees, query, onQueryChange, value, onChange, disabled } = props;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1.5">
        직원 검색
        <input
          type="search"
          className="input w-48 text-sm"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="이름·사번·레벨"
          disabled={disabled}
        />
      </label>
      <label className="flex items-center gap-1.5">
        대상
        <select
          className="input w-64 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {employees.length === 0 ? <option value="">(없음)</option> : null}
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              [{e.code}] {e.name} · 레벨 {e.level}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function EventAmountGrid(props: {
  eventKeys: string[];
  eventLabels: string[];
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  disabled?: boolean;
}) {
  const { eventKeys, eventLabels, values, onChange, disabled } = props;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
            <th className="px-2 py-1 text-left">이벤트</th>
            <th className="px-2 py-1 text-right">새 금액 (원)</th>
          </tr>
        </thead>
        <tbody>
          {eventKeys.map((ev, i) => (
            <tr key={ev} className="border-b border-[var(--border)] last:border-0">
              <td className="px-2 py-1 text-[var(--text)]">{eventLabels[i] ?? ev}</td>
              <td className="px-2 py-1 text-right">
                <CommaWonInput
                  name={`midyear_amount_${ev}`}
                  defaultValue={values[ev] ?? 0}
                  className="input w-32 text-right text-sm tabular-nums"
                  disabled={disabled}
                  onUserChange={(v) => onChange({ ...values, [ev]: Math.max(0, Math.round(v)) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewTable({ plan }: { plan: PlanShape }) {
  const emp = plan.affectedEmployees;
  const totalDelta = emp.reduce((s, r) => s + r.deltaAnnualWelfare, 0);
  return (
    <div className="space-y-2">
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
        영향 직원 <strong className="text-[var(--text)]">{emp.length}명</strong> · 연간 사복 합계 Δ{" "}
        <strong className="text-[var(--text)] tabular-nums">{formatWon(totalDelta)}원</strong>
        {totalDelta < 0 ? " (사복 증가 → 조정급여 감액)" : totalDelta > 0 ? " (사복 감소 → 조정급여 가산)" : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-xs">
          <thead className="text-[var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th className="px-2 py-1 text-left">직원</th>
              <th className="px-2 py-1 text-right">변경 前 연사복</th>
              <th className="px-2 py-1 text-right">변경 後 연사복</th>
              <th className="px-2 py-1 text-right">Δ</th>
              <th className="px-2 py-1 text-right">잔여월</th>
              <th className="px-2 py-1 text-right">월 가산</th>
              <th className="px-2 py-1 text-right">12월 정산</th>
              <th className="px-2 py-1 text-left">경고</th>
            </tr>
          </thead>
          <tbody>
            {emp.map((r) => {
              const before = Object.values(r.welfareBeforeByMonth).reduce((s, v) => s + v, 0);
              const after = Object.values(r.welfareAfterByMonth).reduce((s, v) => s + v, 0);
              const overage =
                r.baseSalaryAnnual > 0 &&
                r.adjustedMonthlyAddedSalary * Math.max(0, r.remainingMonths - 1) +
                  r.adjustedDecemberSalary >
                  r.baseSalaryAnnual;
              return (
                <tr key={r.employeeId} className="border-b border-[var(--border)] last:border-0 tabular-nums">
                  <td className="px-2 py-1 text-left">
                    [{r.employeeCode}] {r.name} · L{r.currentLevel}
                    {r.newLevel != null && r.newLevel !== r.currentLevel ? ` → L${r.newLevel}` : ""}
                  </td>
                  <td className="px-2 py-1 text-right">{formatWon(before)}</td>
                  <td className="px-2 py-1 text-right">{formatWon(after)}</td>
                  <td className="px-2 py-1 text-right">{formatWon(r.deltaAnnualWelfare)}</td>
                  <td className="px-2 py-1 text-right">{r.remainingMonths}</td>
                  <td className="px-2 py-1 text-right">{formatWon(r.addPerMonth)}</td>
                  <td className="px-2 py-1 text-right">{formatWon(r.remainderAtDecember)}</td>
                  <td className="px-2 py-1 text-left text-[var(--warn)]">
                    {overage ? "연간 급여>baseSalary · " : ""}
                    {r.warnings.join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
