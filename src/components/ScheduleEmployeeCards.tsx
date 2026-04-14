"use client";

import { useMemo, useState } from "react";

export type ScheduleWelfareLine = { label: string; amount: number };

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
  capVs: {
    hasCap: boolean;
    cap: number;
    overage: number;
    underForSalaryReport: number;
  };
};

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function ScheduleEmployeeCards({
  year,
  rows,
  showCapOver,
  showCapUnder,
}: {
  year: number;
  rows: ScheduleCardRow[];
  showCapOver: boolean;
  showCapUnder: boolean;
}) {
  const [focusMonth, setFocusMonth] = useState<number | null>(null);

  const hint = useMemo(
    () =>
      focusMonth == null
        ? "월을 선택하면 해당 월만 크게 강조합니다. 전체는 12칸 격자로 표시됩니다."
        : `${year}년 ${focusMonth}월 지급 스케줄 열 기준 금액입니다.`,
    [year, focusMonth]
  );

  if (rows.length === 0) {
    return <p className="p-6 text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted)]">{hint}</p>
        <div className="flex max-w-full flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFocusMonth(null)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              focusMonth === null
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            전체
          </button>
          {MONTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFocusMonth(m)}
              className={`min-w-[2.25rem] rounded-md border px-2 py-1 text-xs font-medium tabular-nums transition-colors ${
                focusMonth === m
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {m}월
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const avgWelfare = r.yearlyWelfare / 12;
          const avgTotal = r.salaryMonth + avgWelfare;
          const focusAmt = focusMonth != null ? (r.welfareByMonth[focusMonth] ?? 0) : null;
          const focusLines = focusMonth != null ? (r.linesByMonth[focusMonth] ?? []) : [];

          return (
            <article
              key={r.employeeId}
              className="surface flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4 shadow-[var(--shadow-card)]"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div>
                  <p className="font-mono text-sm font-semibold tabular-nums text-[var(--text)]">{r.employeeCode}</p>
                  <p className="mt-0.5 text-base font-medium text-[var(--text)]">{r.name}</p>
                </div>
                <span className="rounded-md bg-[var(--surface-hover)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--muted)]">
                  레벨 {r.level}
                </span>
              </header>

              {focusMonth == null ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {MONTHS.map((m) => {
                    const v = r.welfareByMonth[m] ?? 0;
                    const empty = v === 0;
                    const lines = r.linesByMonth[m] ?? [];
                    return (
                      <div
                        key={m}
                        className={`rounded-lg border px-1.5 py-2 text-center ${
                          empty
                            ? "border-[var(--border)]/60 bg-[var(--bg)]/50"
                            : "border-[var(--border)] bg-[var(--surface)]"
                        }`}
                      >
                        <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {m}월
                        </div>
                        <div
                          className={`mt-0.5 text-xs tabular-nums ${empty ? "text-[var(--muted)]" : "font-medium text-[var(--text)]"}`}
                        >
                          {format(v)}
                        </div>
                        {!empty && lines.length > 0 ? (
                          <ul className="mt-1 max-h-[5rem] space-y-0.5 overflow-y-auto border-t border-[var(--border)]/50 pt-1 text-left">
                            {lines.map((line, i) => (
                              <li
                                key={`${line.label}-${i}`}
                                className="flex items-start justify-between gap-1 text-[0.58rem] leading-snug tabular-nums"
                              >
                                <span className="min-w-0 flex-1 whitespace-pre-line text-left text-[var(--muted)]">
                                  {line.label}
                                </span>
                                <span className="shrink-0 font-medium text-[var(--text)]">{format(line.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-hover)]/40 px-4 py-4 text-center">
                  <p className="text-xs font-medium text-[var(--muted)]">
                    {year}년 {focusMonth}월
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{format(focusAmt ?? 0)}원</p>
                  {focusLines.length > 0 ? (
                    <ul className="mt-4 space-y-2 border-t border-[var(--border)] pt-3 text-left text-xs">
                      {focusLines.map((line, i) => (
                        <li
                          key={`${line.label}-${i}`}
                          className="flex items-start justify-between gap-3 tabular-nums"
                        >
                          <span className="min-w-0 flex-1 whitespace-pre-line text-[var(--muted)]">{line.label}</span>
                          <span className="shrink-0 font-semibold text-[var(--text)]">{format(line.amount)}원</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}

              <footer className="space-y-1.5 border-t border-[var(--border)] pt-3 text-xs">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--muted)]">
                  <span>
                    급여(월){" "}
                    <span className="font-medium tabular-nums text-[var(--text)]">{format(r.salaryMonth)}원</span>
                  </span>
                  <span>
                    급여+기금(월평){" "}
                    <span className="font-medium tabular-nums text-[var(--text)]">{format(Math.round(avgTotal))}원</span>
                  </span>
                  <span>
                    연간 기금 합{" "}
                    <span className="font-semibold tabular-nums text-[var(--text)]">{format(r.yearlyWelfare)}원</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--muted)]">
                  <span>
                    상한{" "}
                    <span className="tabular-nums text-[var(--text)]">
                      {r.capVs.hasCap ? `${format(r.capVs.cap)}원` : "—"}
                    </span>
                  </span>
                  {showCapOver ? (
                    <span>
                      초과{" "}
                      {r.capVs.hasCap && r.capVs.overage > 0 ? (
                        <span className="font-medium tabular-nums text-[var(--danger)]">{format(r.capVs.overage)}원</span>
                      ) : (
                        <span className="tabular-nums">—</span>
                      )}
                    </span>
                  ) : null}
                  {showCapUnder ? (
                    <span>
                      미달{" "}
                      {r.capVs.hasCap && r.capVs.underForSalaryReport > 0 ? (
                        <span className="font-medium tabular-nums text-[var(--warn)]">
                          {format(r.capVs.underForSalaryReport)}원
                        </span>
                      ) : (
                        <span className="tabular-nums">—</span>
                      )}
                    </span>
                  ) : null}
                </div>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
