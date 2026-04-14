"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { deleteCustomPaymentEventFormAction, saveLevelPaymentRuleCellAction } from "@/app/actions/levelRules";
import { CommaWonInput } from "@/components/CommaWonInput";

const INPUT_CLS =
  "w-[6rem] max-w-[7rem] min-w-[5.5rem] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm tabular-nums focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]";

const LEVELS = [1, 2, 3, 4, 5] as const;

export function LevelRulesMatrixForm({
  year,
  eventKeys,
  eventLabels,
  amountsByLevelEvent,
  customEventKeys,
  rulesSignature,
}: {
  year: number;
  eventKeys: string[];
  eventLabels: string[];
  amountsByLevelEvent: Record<string, number>;
  customEventKeys: string[];
  /** 서버 스냅샷이 바뀌면 폼을 다시 붙여 입력값을 맞춤 */
  rulesSignature: string;
}) {
  const [cellError, setCellError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const customSet = useMemo(() => new Set(customEventKeys), [customEventKeys]);

  const commitCell = useCallback(
    (level: number, eventKey: string) => (amount: number) => {
      setCellError(null);
      startTransition(async () => {
        const r = await saveLevelPaymentRuleCellAction(year, level, eventKey, amount);
        if (!r.ok) setCellError(r.오류);
      });
    },
    [year]
  );

  return (
    <div className="space-y-0">
      {customEventKeys.map((ev) => (
        <form
          key={ev}
          id={`delete-custom-event-${ev}`}
          action={deleteCustomPaymentEventFormAction}
          className="hidden"
          aria-hidden
        >
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="eventKey" value={ev} />
        </form>
      ))}

      <div className="surface overflow-x-auto px-2 py-2 sm:px-3 sm:py-2.5">
        {cellError ? <p className="mb-2 text-sm text-[var(--danger)]">{cellError}</p> : null}
        {isPending ? (
          <p className="mb-2 text-xs text-[var(--muted)]" aria-live="polite">
            저장 중…
          </p>
        ) : null}

        <div key={rulesSignature} className="space-y-2">
          <table className="min-w-max border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--border-strong)]">
                <th className="sticky left z-10 bg-[var(--surface)] px-2 py-2 text-left text-sm font-bold text-[var(--text)]">
                  레벨 / 행사
                </th>
                {eventKeys.map((ev, evIdx) => (
                  <th
                    key={ev}
                    className={`max-w-[9rem] whitespace-normal px-2 py-2 text-center text-sm font-semibold leading-snug text-[var(--text)] ${
                      evIdx === 0 ? "dash-table-vline-strong" : "dash-table-vline"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="whitespace-pre-line text-[var(--text)]">{eventLabels[evIdx]}</span>
                      {customSet.has(ev) ? (
                        <button
                          type="submit"
                          form={`delete-custom-event-${ev}`}
                          className="text-xs font-normal text-[var(--danger)] hover:underline"
                        >
                          삭제
                        </button>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((lv) => (
                <tr key={lv} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                  <td className="sticky left z-[1] bg-[var(--surface)] px-2 py-1.5 text-left text-sm font-semibold whitespace-nowrap text-[var(--text)]">
                    레벨 {lv}
                  </td>
                  {eventKeys.map((ev, evIdx) => (
                    <td
                      key={ev}
                      className={`px-1 py-1 text-center ${
                        evIdx === 0 ? "dash-table-vline-strong" : "dash-table-vline"
                      }`}
                    >
                      <CommaWonInput
                        name={`amt_${lv}_${ev}`}
                        defaultValue={amountsByLevelEvent[`${lv}_${ev}`] ?? 0}
                        className={INPUT_CLS}
                        onCommitValue={commitCell(lv, ev)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
