"use client";

import { useState } from "react";

export type ScheduleWelfareLine = {
  label: string;
  amount: number;
  /** 라인 출처 — 카드에서 색·뱃지로 구분(정기/분기/선택 복지) */
  kind?: "regular" | "quarterly" | "note";
};

const LINE_KIND_BADGE: Record<NonNullable<ScheduleWelfareLine["kind"]>, { label: string; cls: string }> = {
  regular: {
    label: "정기",
    cls: "border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)]",
  },
  quarterly: {
    label: "분기",
    cls:
      "border-[color:color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]",
  },
  note: {
    label: "선택",
    cls:
      "border-[color:color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[var(--warn-soft)] text-[var(--warn)]",
  },
};

export type ScheduleCapBlock = {
  key: string;
  title: string;
  actualLabel: string;
  hasCap: boolean;
  cap: number;
  actual: number;
  overage: number;
  underForSalaryReport: number;
};

export type ScheduleCardRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  level: number;
  welfareByMonth: Record<number, number>;
  linesByMonth: Record<number, ScheduleWelfareLine[]>;
  yearlyWelfare: number;
  salaryMonth: number;
  /** 조사표·안내 멘트용 */
  flagRepReturn: boolean;
  discretionaryAmount: number | null;
  capBlocks: ScheduleCapBlock[];
  showCapOver: boolean;
  showCapUnder: boolean;
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
// 3행 × 4열
const MONTH_ROWS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]] as const;

export function ScheduleEmployeeCards({
  year,
  rows,
}: {
  year: number;
  rows: ScheduleCardRow[];
}) {
  const [focusMonth, setFocusMonth] = useState<number | null>(null);

  const filterBtn = (m: number | null, label: string) => {
    const active = focusMonth === m;
    return (
      <button
        key={m}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setFocusMonth(m)}
        className={
          "rounded-md border px-2.5 py-1 text-xs font-semibold tabular-nums transition-all " +
          (active
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]")
        }
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* 월 필터 */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="지급월 보기">
        {filterBtn(null, "전체")}
        {MONTHS.map((m) => filterBtn(m, `${m}월`))}
      </div>

      {/* 카드 그리드 */}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] py-10 text-center text-sm text-[var(--muted)]">
          직원 데이터가 없습니다. 직원을 등록하면 카드와 멘트 목록이 채워집니다.
        </p>
      ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => {
          const focusAmt = focusMonth != null ? (r.welfareByMonth[focusMonth] ?? 0) : null;
          const focusLines = focusMonth != null ? (r.linesByMonth[focusMonth] ?? []) : [];

          return (
            <article
              key={r.employeeId}
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]"
            >
              {/* 카드 헤더 */}
              <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-hover)]/60 px-4 py-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-xs font-semibold tabular-nums text-[var(--muted)]">
                    {r.employeeCode}
                  </span>
                  <span className="text-base font-bold text-[var(--text)]">{r.name}</span>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[var(--muted)]">
                  Lv.{r.level}
                </span>
              </header>

              {/* 본문: 전체 or 특정 월 */}
              <div className="p-4">
                {focusMonth == null ? (
                  /* ── 전체 뷰: 3행 × 4열 테이블 ── */
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {MONTH_ROWS.map((rowMonths, ri) => (
                        <tr key={ri}>
                          {rowMonths.map((m) => {
                            const v = r.welfareByMonth[m] ?? 0;
                            const lines = r.linesByMonth[m] ?? [];
                            const empty = v === 0;
                            return (
                              <td
                                key={m}
                                className={
                                  "align-top border border-[var(--border)] p-0 " +
                                  (empty ? "bg-[var(--surface-hover)]/40" : "bg-[var(--surface)]")
                                }
                              >
                                {/* 월 레이블 */}
                                <div className="border-b border-[var(--border)] bg-[var(--surface-hover)]/70 px-2 py-1 text-center text-[0.6875rem] font-bold text-[var(--muted)]">
                                  {m}월
                                </div>
                                {/* 금액 + 내역 */}
                                <div className="px-2 pb-2 pt-1.5">
                                  <p
                                    className={
                                      "whitespace-nowrap text-right text-sm font-bold tabular-nums tracking-tight " +
                                      (empty ? "text-[var(--muted)]/50" : "text-[var(--text)]")
                                    }
                                  >
                                    {empty ? "—" : fmt(v)}
                                  </p>
                                  {!empty && lines.length > 0 && (
                                    <ul className="mt-1.5 space-y-1 border-t border-[var(--border)]/50 pt-1.5">
                                      {lines.map((line, i) => {
                                        const badge = line.kind ? LINE_KIND_BADGE[line.kind] : null;
                                        return (
                                          <li key={i} className="flex flex-col gap-0.5">
                                            <span className="flex items-center gap-1 break-keep text-[0.6rem] leading-tight text-[var(--muted)]">
                                              {badge ? (
                                                <span
                                                  className={`shrink-0 rounded-sm border px-1 py-px text-[0.55rem] font-bold leading-none ${badge.cls}`}
                                                >
                                                  {badge.label}
                                                </span>
                                              ) : null}
                                              <span className="min-w-0">{line.label}</span>
                                            </span>
                                            <span className="whitespace-nowrap text-right text-[0.6875rem] font-semibold tabular-nums text-[var(--text)]">
                                              {fmt(line.amount)}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  /* ── 특정 월 포커스 뷰 ── */
                  <div className="rounded-lg border border-[var(--accent-soft)] bg-[var(--accent-soft)]/20 px-5 py-6 text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent-dim)]">
                      {year}년 {focusMonth}월
                    </p>
                    <p className="mt-2 whitespace-nowrap text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">
                      {fmt(focusAmt ?? 0)}
                      <span className="ml-1 text-lg font-bold text-[var(--muted)]">원</span>
                    </p>
                    {focusLines.length > 0 && (
                      <ul className="mt-5 space-y-2 border-t border-[var(--border)] pt-4 text-left">
                        {focusLines.map((line, i) => {
                          const badge = line.kind ? LINE_KIND_BADGE[line.kind] : null;
                          return (
                            <li
                              key={i}
                              className="flex items-baseline justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                            >
                              <span className="flex min-w-0 items-center gap-2 break-keep text-xs text-[var(--muted)]">
                                {badge ? (
                                  <span
                                    className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[0.6rem] font-bold leading-none ${badge.cls}`}
                                  >
                                    {badge.label}
                                  </span>
                                ) : null}
                                <span className="min-w-0">{line.label}</span>
                              </span>
                              <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[var(--text)]">
                                {fmt(line.amount)}원
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* 카드 푸터 — 급여·기금 요약 */}
              <footer className="border-t border-[var(--border)] bg-[var(--surface-hover)]/40 px-4 py-3">
                <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                  <div>
                    <p className="dash-eyebrow mb-0.5">급여(월)</p>
                    <p className="whitespace-nowrap text-sm font-bold tabular-nums text-[var(--text)]">
                      {fmt(r.salaryMonth)}
                    </p>
                  </div>
                  <div>
                    <p
                      className="dash-eyebrow mb-0.5"
                      title="정기 지급(귀속월) + 분기 지원(지급월) + 선택 복지(월별 노트) 합계"
                    >
                      연간 기금 <span className="font-normal normal-case tracking-normal">(정기+분기+노트)</span>
                    </p>
                    <p className="whitespace-nowrap text-sm font-bold tabular-nums text-[var(--accent)]">
                      {fmt(r.yearlyWelfare)}
                    </p>
                  </div>
                  <div>
                    <p className="dash-eyebrow mb-0.5">급여+기금(월평)</p>
                    <p className="whitespace-nowrap text-sm font-bold tabular-nums text-[var(--text)]">
                      {fmt(Math.round(r.salaryMonth + r.yearlyWelfare / 12))}
                    </p>
                  </div>
                </div>

                {/* 급여포함신고 — 블록이 있을 때만 */}
                {r.capBlocks.length > 0 && (
                  <div className="mt-3 border-t border-[var(--border)]/60 pt-3">
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
                              상한 {b.hasCap ? <span className="font-semibold tabular-nums text-[var(--text)]">{fmt(b.cap)}원</span> : "없음"}
                            </span>
                            {r.showCapOver && (
                              <span className="text-[var(--muted)]">
                                초과{" "}
                                {hasOver ? (
                                  <span className="font-bold tabular-nums text-[var(--danger)]">{fmt(b.overage)}원</span>
                                ) : (
                                  <span>—</span>
                                )}
                              </span>
                            )}
                            {r.showCapUnder && (
                              <span className="text-[var(--muted)]">
                                미달{" "}
                                {hasUnder ? (
                                  <span className="font-bold tabular-nums text-[var(--warn)]">{fmt(b.underForSalaryReport)}원</span>
                                ) : (
                                  <span>—</span>
                                )}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      )}
    </div>
  );
}
