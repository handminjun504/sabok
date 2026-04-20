"use client";

import { useCallback, useState, useTransition } from "react";
import { saveLevel5OverrideCellAction } from "@/app/actions/levelRules";
import { CommaWonInput } from "@/components/CommaWonInput";

const INPUT_CLS =
  "w-[7rem] max-w-[8rem] min-w-[6rem] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm tabular-nums focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]";

export type Level5OverrideRow = {
  eventKey: string;
  /** 화면 표시용 라벨(줄바꿈 가능) */
  label: string;
  /** 레벨 5 공통 금액 (오버라이드가 없을 때 실제 적용되는 금액) */
  defaultAmountWon: number;
  /** 직원의 오버라이드 금액 — 없으면 null */
  overrideAmountWon: number | null;
};

export function Level5OverrideMatrixForm({
  employeeId,
  year,
  rows,
  rulesSignature,
}: {
  employeeId: string;
  year: number;
  rows: Level5OverrideRow[];
  /** 행사 추가/삭제 등 구조 변경 시에만 바뀌는 키. 금액 변경만으로는 바뀌지 않아 자동 저장 후에도 입력 유지. */
  rulesSignature: string;
}) {
  const [cellError, setCellError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const commitCell = useCallback(
    (eventKey: string) => (amount: number) => {
      setCellError(null);
      startTransition(async () => {
        const r = await saveLevel5OverrideCellAction(employeeId, year, eventKey, amount);
        if (!r.ok) setCellError(r.오류);
      });
    },
    [employeeId, year],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        직원 금액이 레벨 5 공통보다 우선합니다. 셀을 비우거나 <strong className="text-[var(--text)]">0</strong> 으로 두면
        오버라이드가 자동 삭제되어 공통 금액(괄호)이 다시 적용됩니다.
      </p>

      <div className="surface overflow-x-auto px-2 py-2 sm:px-3 sm:py-2.5">
        {cellError ? (
          <p className="mb-2 text-sm text-[var(--danger)]" role="alert">
            {cellError}
          </p>
        ) : null}
        {isPending ? (
          <p className="mb-2 text-xs text-[var(--muted)]" aria-live="polite">
            저장 중…
          </p>
        ) : null}

        <div key={rulesSignature}>
          <table className="min-w-max border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--border-strong)]">
                <th className="sticky left z-10 bg-[var(--surface)] px-2 py-2 text-left text-sm font-bold text-[var(--text)]">
                  행사
                </th>
                <th className="dash-table-vline-strong px-2 py-2 text-right text-xs font-semibold text-[var(--muted)]">
                  레벨 5 공통
                </th>
                <th className="dash-table-vline px-2 py-2 text-center text-sm font-semibold text-[var(--text)]">
                  직원 오버라이드 (원)
                </th>
                <th className="dash-table-vline px-2 py-2 text-left text-xs font-semibold text-[var(--muted)]">
                  적용 금액
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const applied = r.overrideAmountWon != null && r.overrideAmountWon > 0
                  ? r.overrideAmountWon
                  : r.defaultAmountWon;
                const overridden = r.overrideAmountWon != null && r.overrideAmountWon > 0;
                return (
                  <tr key={r.eventKey} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                    <td className="sticky left z-[1] bg-[var(--surface)] px-2 py-1.5 text-left text-sm font-semibold whitespace-pre-line text-[var(--text)]">
                      {r.label}
                    </td>
                    <td className="dash-table-vline-strong px-2 py-1.5 text-right text-xs tabular-nums text-[var(--muted)]">
                      {r.defaultAmountWon.toLocaleString("ko-KR")} 원
                    </td>
                    <td className="dash-table-vline px-1 py-1 text-center">
                      <CommaWonInput
                        name={`l5_${r.eventKey}`}
                        defaultValue={r.overrideAmountWon ?? null}
                        placeholder="—"
                        className={INPUT_CLS}
                        commitDebounceMs={1200}
                        onCommitValue={commitCell(r.eventKey)}
                      />
                    </td>
                    <td className="dash-table-vline px-2 py-1.5 text-left text-xs tabular-nums">
                      <span className={overridden ? "font-bold text-[var(--accent)]" : "text-[var(--text)]"}>
                        {applied.toLocaleString("ko-KR")} 원
                      </span>
                      {overridden ? (
                        <span className="ml-1 text-[var(--muted)]">
                          (공통 {r.defaultAmountWon.toLocaleString("ko-KR")})
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
