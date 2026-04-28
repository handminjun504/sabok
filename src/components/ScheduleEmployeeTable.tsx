"use client";

import Link from "next/link";
import { Fragment, useState, useTransition, type ReactNode } from "react";
import type { ScheduleCapBlock, ScheduleWelfareLine } from "@/components/ScheduleEmployeeCards";
import {
  ScheduleEmployeeEditModal,
  type ScheduleEditAvailableEvent,
  type ScheduleEditMonthEvent,
} from "@/components/ScheduleEmployeeEditModal";
import type { setMonthPaidConfirmedAction } from "@/app/actions/quarterly";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const LINE_KIND_BADGE: Record<NonNullable<ScheduleWelfareLine["kind"]>, { label: string; cls: string }> = {
  regular: {
    label: "정기",
    cls: "border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)]",
  },
  quarterly: {
    label: "분기",
    cls: "border-[color:color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]",
  },
  note: {
    label: "선택",
    cls: "border-[color:color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[var(--warn-soft)] text-[var(--warn)]",
  },
};

export type ScheduleTableEmploymentStatus =
  | { kind: "ACTIVE_FULL_YEAR" }
  | { kind: "ACTIVE_PARTIAL"; fromMonth: number; toMonth: number }
  | { kind: "AFTER_RESIGN"; resignYear: number; resignMonth: number | null };

export type ScheduleTableRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  level: number;
  /** 활성 연도 기준 직원 상태 — 퇴사자 취소선/비활성 월 셀 처리에 사용 */
  status: ScheduleTableEmploymentStatus;
  welfareByMonth: Record<number, number>;
  linesByMonth: Record<number, ScheduleWelfareLine[]>;
  yearlyWelfare: number;
  salaryMonth: number;
  flagRepReturn: boolean;
  discretionaryAmount: number | null;
  capBlocks: ScheduleCapBlock[];
  showCapOver: boolean;
  showCapUnder: boolean;
  /** 월별 개별 수정 모달 prefill 데이터 */
  editableEventsByMonth?: Record<number, ScheduleEditMonthEvent[]>;
  /** 모달의 "＋ 항목 추가" 후보(정기/커스텀/분기) */
  availableEvents?: ScheduleEditAvailableEvent[];
  /** 직원 활성 월 범위(부분 재직자) */
  activeRange?: { fromMonth: number; toMonth: number } | null;
  /** 이벤트별 수정된 월 — 셀 배경 강조용 */
  modifiedMonths?: number[];
};

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function statusBadge(status: ScheduleTableEmploymentStatus): ReactNode {
  /** 좁은 셀에서도 “1~6월 / 재직” 처럼 두 줄로 끊기지 않도록 whitespace-nowrap. */
  if (status.kind === "ACTIVE_FULL_YEAR") {
    return <span className="badge badge-success whitespace-nowrap">재직</span>;
  }
  if (status.kind === "ACTIVE_PARTIAL") {
    const { fromMonth, toMonth } = status;
    const label =
      fromMonth === 1
        ? `~${toMonth}월 재직`
        : toMonth === 12
          ? `${fromMonth}월~ 재직`
          : `${fromMonth}~${toMonth}월 재직`;
    return <span className="badge badge-warn whitespace-nowrap">{label}</span>;
  }
  return (
    <span className="badge badge-neutral whitespace-nowrap">
      {status.resignYear}년{status.resignMonth ? ` ${status.resignMonth}월` : ""} 퇴사
    </span>
  );
}

function monthIsActiveForStatus(status: ScheduleTableEmploymentStatus, month: number): boolean {
  if (status.kind === "ACTIVE_FULL_YEAR") return true;
  if (status.kind === "ACTIVE_PARTIAL") return month >= status.fromMonth && month <= status.toMonth;
  return false;
}

/**
 * 월별 지급 스케줄 — 직원 디렉터리와 동일한 행/펼침 표 패턴.
 *
 * - 행: 직원(코드 ASC). 퇴사자는 이름 취소선 + 행 dim.
 * - 1~12월 셀: 금액만. 비활성 월은 “—”. 해당 달이 지급완료로 표시되면 셀 배경에 success 톤.
 * - 표 위 별도의 “지급완료 진행” 바: 1~12월 각각 한 개씩 체크박스. 클릭 시 그 달 전체가 지급완료로 표시된다.
 * - 펼침 행: 라인 내역(정기/분기/노트) + 급여포함신고 cap blocks.
 */
export function ScheduleEmployeeTable({
  year,
  rows,
  canEdit,
  paidByMonth,
  setMonthPaidConfirmed,
  defaultEffectiveMonth,
}: {
  year: number;
  rows: ScheduleTableRow[];
  /** 체크박스 토글 권한. false 면 체크박스는 disabled(읽기 전용). */
  canEdit: boolean;
  /** 1~12 → 해당 월 ‘지급완료’ 여부 */
  paidByMonth: Record<number, boolean>;
  setMonthPaidConfirmed: typeof setMonthPaidConfirmedAction;
  /** 월별 개별 수정 모달 기본 적용 월 */
  defaultEffectiveMonth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [optimistic, setOptimistic] = useState<Map<number, boolean>>(() => new Map());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingMonths, setPendingMonths] = useState<Set<number>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = editingId ? rows.find((r) => r.employeeId === editingId) : null;
  const today = new Date();
  const inferredDefaultEffective =
    defaultEffectiveMonth != null
      ? defaultEffectiveMonth
      : today.getFullYear() === year
        ? today.getMonth() + 1
        : 1;
  const [, startTransition] = useTransition();

  const allExpanded = rows.length > 0 && rows.every((r) => expanded.has(r.employeeId));
  /** 이름·상태를 한 셀에 가로로 묶어, 좁은 화면에서 위/아래로 쪼개지지 않도록 한다. */
  const totalCols = 1 /* 펼침 */ + 1 /* 코드 */ + 1 /* 이름+상태 */ + 1 /* Lv */ + 12 /* 1~12월 */ + 1 /* 연간 */ + 1 /* 편집 */;

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAll(open: boolean) {
    setExpanded(open ? new Set(rows.map((r) => r.employeeId)) : new Set());
  }

  function isMonthPaid(month: number): boolean {
    if (optimistic.has(month)) return optimistic.get(month) === true;
    return paidByMonth[month] === true;
  }

  function onToggleMonthPaid(month: number) {
    if (!canEdit) return;
    const current = isMonthPaid(month);
    const next = !current;
    setOptimistic((prev) => {
      const m = new Map(prev);
      m.set(month, next);
      return m;
    });
    setPendingMonths((prev) => {
      const s = new Set(prev);
      s.add(month);
      return s;
    });
    setErrorMsg(null);
    startTransition(async () => {
      const res = await setMonthPaidConfirmed(year, month, next);
      setPendingMonths((prev) => {
        const s = new Set(prev);
        s.delete(month);
        return s;
      });
      if (!res.ok) {
        /** 실패 시 즉시 롤백 — 사용자가 본 체크 상태와 서버 상태가 어긋나지 않게. */
        setOptimistic((prev) => {
          const m = new Map(prev);
          m.set(month, current);
          return m;
        });
        setErrorMsg(res.오류);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          한 줄에 12달 금액. 왼쪽 ▶ 를 누르면 월별 내역과 급여포함신고가 펼쳐집니다. 위쪽 “지급완료” 행은 한 달 전체에 대한 확인 체크입니다.
        </p>
        <button type="button" onClick={() => setAll(!allExpanded)} className="btn btn-outline text-xs">
          {allExpanded ? "모두 접기" : "모두 펼치기"}
        </button>
      </div>

      {/* 월별 ‘지급완료’ 진행 바 — 한 달 전체에 대한 확인 토글 */}
      <div className="surface flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="dash-eyebrow shrink-0">지급완료</span>
        <div className="flex flex-wrap gap-1.5">
          {MONTHS.map((m) => {
            const paid = isMonthPaid(m);
            const pending = pendingMonths.has(m);
            return (
              <label
                key={m}
                className={
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors " +
                  (paid
                    ? "border-[var(--success)]/50 bg-[color:color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]") +
                  (canEdit ? " cursor-pointer hover:border-[var(--border-strong)]" : " cursor-default")
                }
                title={paid ? `${m}월 지급완료 — 다시 누르면 해제` : `${m}월 전체를 지급완료로 표시`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--success)] disabled:cursor-default"
                  checked={paid}
                  disabled={!canEdit || pending}
                  onChange={() => onToggleMonthPaid(m)}
                />
                <span className={"font-semibold tabular-nums " + (paid ? "" : "text-[var(--text)]")}>
                  {m}월
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {errorMsg ? (
        <p className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger-soft)]/40 px-3 py-2 text-xs text-[var(--danger)]" role="alert">
          {errorMsg}
        </p>
      ) : null}

      <div className="surface overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)] bg-[var(--surface-hover)]/40">
              <th className="dash-table-th-md w-10 text-center" aria-label="세부 펼침" />
              <th className="dash-table-th-md text-left">코드</th>
              <th className="dash-table-th-md text-left">이름 · 상태</th>
              <th className="dash-table-th-md text-center">Lv</th>
              {MONTHS.map((m) => {
                const paid = isMonthPaid(m);
                return (
                  <th
                    key={m}
                    className={
                      "dash-table-th-md min-w-[5.5rem] text-right " +
                      (paid ? "bg-[color:color-mix(in_srgb,var(--success)_10%,transparent)]" : "")
                    }
                  >
                    <span className={paid ? "text-[var(--success)]" : ""}>{m}월</span>
                  </th>
                );
              })}
              <th className="dash-table-th-md text-right">{year}년 합계</th>
              <th className="dash-table-th-md w-20 text-center">편집</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                  직원 데이터가 없습니다. 직원을 등록하면 표가 채워집니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isOpen = expanded.has(r.employeeId);
                const dimmed = r.status.kind === "AFTER_RESIGN";
                const modifiedSet = new Set<number>(r.modifiedMonths ?? []);
                const hasEditableData =
                  r.editableEventsByMonth != null && Object.keys(r.editableEventsByMonth).length > 0;
                return (
                  <Fragment key={r.employeeId}>
                    <tr
                      className={
                        "border-b border-[var(--border)] dash-table-row " + (dimmed ? "opacity-60" : "")
                      }
                    >
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(r.employeeId)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "세부 접기" : "세부 펼치기"}
                          className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                        >
                          {isOpen ? "▼" : "▶"}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs tabular-nums text-[var(--muted)]">
                        {r.employeeCode}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={
                              "text-sm font-bold whitespace-nowrap " +
                              (dimmed ? "text-[var(--muted)] line-through" : "text-[var(--text)]")
                            }
                          >
                            {r.name}
                          </span>
                          {statusBadge(r.status)}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center text-xs font-semibold tabular-nums text-[var(--muted)]">
                        Lv.{r.level}
                      </td>
                      {MONTHS.map((m) => {
                        const v = r.welfareByMonth[m] ?? 0;
                        const active = monthIsActiveForStatus(r.status, m);
                        const paid = isMonthPaid(m);
                        const empty = v === 0;
                        const modified = modifiedSet.has(m);
                        return (
                          <td
                            key={m}
                            className={
                              "px-2 py-2.5 text-right tabular-nums " +
                              (!active
                                ? "bg-[var(--surface-hover)]/30 "
                                : modified
                                  ? "bg-[color:color-mix(in_srgb,var(--warn)_15%,transparent)] "
                                  : paid
                                    ? "bg-[color:color-mix(in_srgb,var(--success)_8%,transparent)] "
                                    : "")
                            }
                            title={modified ? `${m}월 — 개별 수정됨` : undefined}
                          >
                            <span
                              className={
                                "whitespace-nowrap text-sm font-semibold " +
                                (!active
                                  ? "text-[var(--muted)]/40"
                                  : empty
                                    ? "text-[var(--muted)]/60"
                                    : modified
                                      ? "text-[var(--warn)]"
                                      : "text-[var(--text)]")
                              }
                            >
                              {!active ? "—" : empty ? "—" : fmt(v)}
                              {active && modified ? " ✎" : ""}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2.5 text-right text-sm font-bold tabular-nums text-[var(--accent)]">
                        {fmt(r.yearlyWelfare)}
                      </td>
                      <td className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Link
                            href={`/dashboard/employees/${r.employeeId}`}
                            className="text-xs font-bold text-[var(--accent)] hover:underline"
                          >
                            직원 편집
                          </Link>
                          {hasEditableData ? (
                            <button
                              type="button"
                              onClick={() => setEditingId(r.employeeId)}
                              className="text-[0.6875rem] font-semibold text-[var(--muted)] hover:text-[var(--warn)] hover:underline"
                              title={canEdit ? "이 직원의 월별 이벤트 금액 개별 수정" : "미리보기만 가능 (권한 없음)"}
                            >
                              월별 수정
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {isOpen ? (
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]/30">
                        <td colSpan={totalCols} className="px-4 py-4">
                          <div className="grid gap-5 lg:grid-cols-2">
                            {/* 월별 내역(라인) */}
                            <div>
                              <p className="dash-eyebrow mb-2">월별 내역</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {MONTHS.map((m) => {
                                  const lines = r.linesByMonth[m] ?? [];
                                  const v = r.welfareByMonth[m] ?? 0;
                                  if (lines.length === 0 && v === 0) return null;
                                  const active = monthIsActiveForStatus(r.status, m);
                                  return (
                                    <div
                                      key={m}
                                      className={
                                        "rounded-md border px-2.5 py-2 text-xs " +
                                        (active
                                          ? "border-[var(--border)] bg-[var(--surface)]"
                                          : "border-dashed border-[var(--border)] bg-[var(--surface-hover)]/40 opacity-70")
                                      }
                                    >
                                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[var(--muted)]">
                                        <span className="font-semibold text-[var(--text)]">{m}월</span>
                                        <span className="font-bold tabular-nums text-[var(--text)]">{fmt(v)}원</span>
                                      </div>
                                      {lines.length > 0 ? (
                                        <ul className="space-y-0.5">
                                          {lines.map((line, i) => {
                                            const badge = line.kind ? LINE_KIND_BADGE[line.kind] : null;
                                            return (
                                              <li key={i} className="flex items-baseline justify-between gap-2">
                                                <span className="flex min-w-0 items-center gap-1 break-keep text-[var(--muted)]">
                                                  {badge ? (
                                                    <span
                                                      className={`shrink-0 rounded-sm border px-1 py-px text-[0.55rem] font-bold leading-none ${badge.cls}`}
                                                    >
                                                      {badge.label}
                                                    </span>
                                                  ) : null}
                                                  <span className="min-w-0">{line.label}</span>
                                                </span>
                                                <span className="whitespace-nowrap font-semibold tabular-nums text-[var(--text)]">
                                                  {fmt(line.amount)}
                                                </span>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 급여·기금 + 급여포함신고 */}
                            <div className="space-y-3">
                              <div>
                                <p className="dash-eyebrow mb-1.5">급여 · 기금</p>
                                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                                  <div>
                                    <span className="text-[var(--muted)]">급여(월) </span>
                                    <span className="font-bold tabular-nums text-[var(--text)]">
                                      {fmt(r.salaryMonth)}원
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[var(--muted)]">연간 기금 </span>
                                    <span className="font-bold tabular-nums text-[var(--accent)]">
                                      {fmt(r.yearlyWelfare)}원
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[var(--muted)]">급여+기금(월평) </span>
                                    <span className="font-bold tabular-nums text-[var(--text)]">
                                      {fmt(Math.round(r.salaryMonth + r.yearlyWelfare / 12))}원
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {r.capBlocks.length > 0 ? (
                                <div>
                                  <p className="dash-eyebrow mb-1.5">급여포함신고 (상한 대비)</p>
                                  <div className="space-y-1.5">
                                    {r.capBlocks.map((b) => {
                                      const hasOver = r.showCapOver && b.hasCap && b.overage > 0;
                                      const hasUnder = r.showCapUnder && b.hasCap && b.underForSalaryReport > 0;
                                      return (
                                        <div
                                          key={b.key}
                                          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                                        >
                                          <span className="font-semibold text-[var(--text)]">{b.title}</span>
                                          <span className="text-[var(--muted)]">
                                            상한{" "}
                                            {b.hasCap ? (
                                              <span className="font-semibold tabular-nums text-[var(--text)]">
                                                {fmt(b.cap)}원
                                              </span>
                                            ) : (
                                              "없음"
                                            )}
                                          </span>
                                          {r.showCapOver ? (
                                            <span className="text-[var(--muted)]">
                                              초과{" "}
                                              {hasOver ? (
                                                <span className="font-bold tabular-nums text-[var(--danger)]">
                                                  {fmt(b.overage)}원
                                                </span>
                                              ) : (
                                                <span>—</span>
                                              )}
                                            </span>
                                          ) : null}
                                          {r.showCapUnder ? (
                                            <span className="text-[var(--muted)]">
                                              미달{" "}
                                              {hasUnder ? (
                                                <span className="font-bold tabular-nums text-[var(--warn)]">
                                                  {fmt(b.underForSalaryReport)}원
                                                </span>
                                              ) : (
                                                <span>—</span>
                                              )}
                                            </span>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {editingRow && editingRow.editableEventsByMonth ? (
        <ScheduleEmployeeEditModal
          open={true}
          onClose={() => setEditingId(null)}
          year={year}
          employee={{
            id: editingRow.employeeId,
            code: editingRow.employeeCode,
            name: editingRow.name,
            level: editingRow.level,
          }}
          eventsByMonth={editingRow.editableEventsByMonth}
          availableEvents={editingRow.availableEvents ?? []}
          activeRange={editingRow.activeRange ?? undefined}
          defaultEffectiveMonth={inferredDefaultEffective}
          canEdit={canEdit}
        />
      ) : null}
    </div>
  );
}
