"use client";

import { useState } from "react";

export type ScheduleWelfareLine = { label: string; amount: number };

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
  /** 지급 스케줄 열 기준 월 1~12 → 원 */
  welfareByMonth: Record<number, number>;
  /** 해당 월 열에 포함된 행사·분기·노트 등 항목별 금액 */
  linesByMonth: Record<number, ScheduleWelfareLine[]>;
  yearlyWelfare: number;
  salaryMonth: number;
  capBlocks: ScheduleCapBlock[];
  /** 급여포함신고 초과·미달 표시 — 직원별(없으면 전사 설정) */
  showCapOver: boolean;
  showCapUnder: boolean;
};

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function ScheduleEmployeeCards({ year, rows }: { year: number; rows: ScheduleCardRow[] }) {
  const [focusMonth, setFocusMonth] = useState<number | null>(null);

  if (rows.length === 0) {
    return <p className="p-6 text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>;
  }

  const chipBase =
    "rounded-lg border px-2.5 py-1.5 text-xs font-medium tabular-nums transition-all duration-200 active:scale-[0.98]";
  const chipIdle =
    "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] shadow-[var(--shadow-card)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:shadow-[var(--shadow-card-hover)]";
  const chipActive =
    "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dim)] shadow-[0_0_0_1px_var(--accent-soft)] ring-2 ring-[var(--accent-soft)]/40";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]/35 p-3 shadow-[var(--shadow-card)] sm:p-4">
        <div className="flex flex-wrap items-center justify-end gap-1.5" role="tablist" aria-label="지급월 보기">
          <button
            type="button"
            role="tab"
            aria-selected={focusMonth === null}
            onClick={() => setFocusMonth(null)}
            className={`${chipBase} ${focusMonth === null ? chipActive : chipIdle}`}
          >
            전체
          </button>
          {MONTHS.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={focusMonth === m}
              onClick={() => setFocusMonth(m)}
              className={`min-w-[2.35rem] ${chipBase} ${focusMonth === m ? chipActive : chipIdle}`}
            >
              {m}월
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-5 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const { showCapOver, showCapUnder } = r;
          const avgWelfare = r.yearlyWelfare / 12;
          const avgTotal = r.salaryMonth + avgWelfare;
          const focusAmt = focusMonth != null ? (r.welfareByMonth[focusMonth] ?? 0) : null;
          const focusLines = focusMonth != null ? (r.linesByMonth[focusMonth] ?? []) : [];

          return (
            <article
              key={r.employeeId}
              className="flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]"
            >
              <header className="relative flex flex-nowrap items-baseline justify-between gap-2 border-b border-[var(--border)] bg-gradient-to-br from-[var(--surface-hover)]/80 to-[var(--surface)] px-4 pb-3 pt-3.5">
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-r-sm bg-[var(--accent)]/85 opacity-90"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pl-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
                  <p className="whitespace-nowrap text-base font-semibold text-[var(--text)]">
                    <span className="font-mono text-sm font-semibold tabular-nums tracking-tight">{r.employeeCode}</span>
                    <span className="mx-1.5 font-normal text-[var(--muted)]">·</span>
                    <span>{r.name}</span>
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--muted)] shadow-[var(--shadow-card)]">
                  Lv.{r.level}
                </span>
              </header>

              <div className="min-w-0 flex-1 px-3 pb-1 pt-3 sm:px-4">
                {focusMonth == null ? (
                  <div className="min-w-0 w-full">
                    <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      지급월별 기금
                    </p>
                    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)]/80 bg-[var(--bg)]/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] sm:p-4">
                      <div className="grid min-w-0 grid-cols-[repeat(3,minmax(0,1fr))] gap-2.5 sm:gap-3">
                        {MONTHS.map((m) => {
                          const v = r.welfareByMonth[m] ?? 0;
                          const empty = v === 0;
                          const lines = r.linesByMonth[m] ?? [];
                          return (
                            <div
                              key={m}
                              className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border text-center shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-150 ${
                                empty
                                  ? "border-[var(--border)]/50 bg-[var(--surface)]/60"
                                  : "border-[var(--border)] bg-[var(--surface)] ring-1 ring-[var(--accent-soft)]/30 hover:shadow-[var(--shadow-card-hover)]"
                              }`}
                            >
                              <div className="shrink-0 bg-[var(--surface-hover)]/50 px-1 py-1.5 text-xs font-bold tabular-nums text-[var(--muted)]">
                                {m}월
                              </div>
                              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-1.5 pb-2 pt-1">
                                <div
                                  className={`min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden text-center text-sm tabular-nums whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-0.5 ${
                                    empty ? "text-[var(--muted)]" : "font-semibold text-[var(--text)]"
                                  }`}
                                >
                                  {format(v)}
                                </div>
                                {!empty && lines.length > 0 ? (
                                  <ul className="mt-1.5 min-h-0 min-w-0 max-w-full max-h-[9rem] flex-1 space-y-1 overflow-y-auto overflow-x-hidden border-t border-[var(--border)]/40 pt-1.5 text-left">
                                    {lines.map((line, i) => (
                                      <li
                                        key={`${line.label}-${i}`}
                                        className="flex min-w-0 w-full flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden rounded-md bg-[var(--surface-hover)]/40 px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-0.5"
                                      >
                                        <span className="shrink-0 whitespace-nowrap text-left text-[0.65rem] leading-tight text-[var(--muted)]">
                                          {line.label.replace(/\r?\n/g, " ")}
                                        </span>
                                        <span className="shrink-0 whitespace-nowrap text-[0.7rem] font-semibold tabular-nums leading-tight text-[var(--text)]">
                                          {format(line.amount)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 overflow-hidden rounded-xl border-2 border-[var(--accent-soft)] bg-gradient-to-b from-[var(--accent-soft)]/25 to-[var(--surface-hover)]/30 px-4 py-5 text-center shadow-[var(--shadow-card)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-dim)]">
                      {year}년 {focusMonth}월
                    </p>
                    <div className="mt-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:thin]">
                      <p className="whitespace-nowrap text-2xl font-bold tabular-nums tracking-tight text-[var(--text)]">
                        {format(focusAmt ?? 0)}
                        <span className="text-base font-semibold text-[var(--muted)]">원</span>
                      </p>
                    </div>
                    {focusLines.length > 0 ? (
                      <ul className="mt-4 space-y-2 border-t border-[var(--border)]/60 pt-4 text-left text-xs">
                        {focusLines.map((line, i) => (
                          <li
                            key={`${line.label}-${i}`}
                            className="flex min-w-0 w-full flex-nowrap items-center gap-3 overflow-x-auto rounded-lg border border-[var(--border)]/50 bg-[var(--surface)]/80 px-2.5 py-2 tabular-nums shadow-[var(--shadow-card)] [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1"
                          >
                            <span className="shrink-0 whitespace-nowrap text-[var(--muted)]">
                              {line.label.replace(/\r?\n/g, " ")}
                            </span>
                            <span className="shrink-0 whitespace-nowrap font-bold tabular-nums text-[var(--text)]">
                              {format(line.amount)}원
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>

              <footer className="mt-auto space-y-3 border-t border-[var(--border)] bg-[var(--surface-hover)]/25 px-3 py-3 sm:px-4">
                <div>
                  <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    월 급여 · 기금 요약
                  </p>
                  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
                    <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)]/70 bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow-card)]">
                      <p className="text-[0.6rem] font-medium text-[var(--muted)]">급여(월)</p>
                      <p className="mt-0.5 overflow-x-auto whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--text)] [-ms-overflow-style:none] [scrollbar-width:thin]">
                        {format(r.salaryMonth)}원
                      </p>
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)]/70 bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow-card)]">
                      <p className="text-[0.6rem] font-medium text-[var(--muted)]">급여+기금(월평)</p>
                      <p className="mt-0.5 overflow-x-auto whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--text)] [-ms-overflow-style:none] [scrollbar-width:thin]">
                        {format(Math.round(avgTotal))}원
                      </p>
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--accent-soft)] bg-[var(--accent-soft)]/15 px-2.5 py-2 shadow-[var(--shadow-card)] sm:col-span-1">
                      <p className="text-[0.6rem] font-medium text-[var(--accent-dim)]">연간 기금 합</p>
                      <p className="mt-0.5 overflow-x-auto whitespace-nowrap text-sm font-bold tabular-nums text-[var(--text)] [-ms-overflow-style:none] [scrollbar-width:thin]">
                        {format(r.yearlyWelfare)}원
                      </p>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)]/80 bg-[var(--surface)]/90 p-2.5 shadow-[var(--shadow-card)]">
                  <p className="mb-2 px-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    급여포함신고 (상한 대비)
                  </p>
                  <div className="space-y-2">
                    {r.capBlocks.map((b) => (
                      <div
                        key={b.key}
                        className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)]/60 bg-[var(--surface-hover)]/30 px-2.5 py-2 first:mt-0"
                      >
                        <div className="overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:thin]">
                          <p className="inline text-[0.68rem] font-semibold text-[var(--text)]">{b.title}</p>
                          <span className="ml-1.5 inline text-[0.62rem] font-normal text-[var(--muted)]">
                            · 실적: {b.actualLabel}
                          </span>
                        </div>
                        <div className="mt-2 flex min-w-0 flex-nowrap gap-x-3 overflow-x-auto border-t border-[var(--border)]/40 pt-2 text-[0.7rem] text-[var(--muted)] [-ms-overflow-style:none] [scrollbar-width:thin] [&>span]:shrink-0">
                          <span>
                            상한{" "}
                            <span className="font-medium tabular-nums text-[var(--text)]">
                              {b.hasCap ? `${format(b.cap)}원` : "—"}
                            </span>
                          </span>
                          {showCapOver ? (
                            <span>
                              초과{" "}
                              {b.hasCap && b.overage > 0 ? (
                                <span className="font-semibold tabular-nums text-[var(--danger)]">{format(b.overage)}원</span>
                              ) : (
                                <span className="tabular-nums">—</span>
                              )}
                            </span>
                          ) : null}
                          {showCapUnder ? (
                            <span>
                              미달{" "}
                              {b.hasCap && b.underForSalaryReport > 0 ? (
                                <span className="font-semibold tabular-nums text-[var(--warn)]">
                                  {format(b.underForSalaryReport)}원
                                </span>
                              ) : (
                                <span className="tabular-nums">—</span>
                              )}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
