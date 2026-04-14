"use client";

import { useFormStatus } from "react-dom";
import { CommaWonInput } from "@/components/CommaWonInput";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const ROW_GRID =
  "5.5rem 6.5rem repeat(12, minmax(3.75rem, 1fr)) 4.5rem" as const;

export type MonthlyIncentiveAccrualGridRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  /** 지급월 1~12 — 그 달 노트에 적힌 발생(귀속) 인센 */
  incentiveAccrualByMonth: Record<number, number | null>;
};

function RowSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary whitespace-nowrap px-2 py-1 text-xs" disabled={pending}>
      {pending ? "저장 중…" : "저장"}
    </button>
  );
}

export function MonthlyIncentiveAccrualGrid({
  year,
  rows,
  canEdit,
  saveAction,
}: {
  year: number;
  rows: MonthlyIncentiveAccrualGridRow[];
  canEdit: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        각 칸은 해당 <strong className="text-[var(--text)]">지급월</strong> 월별 노트의「발생 인센」과 같습니다. 급여포함신고의
        누적 발생 인센·차액 계산에 반영됩니다. 사복으로 지급할 인센은「선택적 복지·메모」탭에서 월·직원별로 함께
        적을 수 있습니다.
      </p>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <div className="min-w-[56rem] bg-[var(--surface)]">
          <div
            className="grid border-b border-[var(--border)] bg-[var(--surface-hover)]"
            style={{ gridTemplateColumns: ROW_GRID }}
          >
            <div className="sticky left-0 z-[1] bg-[var(--surface-hover)] px-2 py-2 text-[0.65rem] font-bold text-[var(--muted)]">
              코드
            </div>
            <div className="sticky left-[5.5rem] z-[1] bg-[var(--surface-hover)] px-2 py-2 text-[0.65rem] font-bold text-[var(--muted)]">
              이름
            </div>
            {MONTHS.map((m) => (
              <div
                key={m}
                className="px-1 py-2 text-center text-[0.65rem] font-bold tabular-nums text-[var(--muted)]"
              >
                {m}월
              </div>
            ))}
            <div className="px-1 py-2 text-center text-[0.65rem] font-bold text-[var(--muted)]">{""}</div>
          </div>

          {rows.map((r) => (
            <form
              key={r.employeeId}
              action={saveAction}
              className="grid border-b border-[var(--border)] last:border-b-0"
              style={{ gridTemplateColumns: ROW_GRID }}
            >
              <input type="hidden" name="employeeId" value={r.employeeId} />
              <input type="hidden" name="year" value={year} />
              <div className="sticky left-0 z-[1] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs font-semibold tabular-nums text-[var(--text)]">
                {r.employeeCode}
              </div>
              <div className="sticky left-[5.5rem] z-[1] bg-[var(--surface)] px-2 py-1.5 text-xs font-medium text-[var(--text)]">
                {r.name}
              </div>
              {MONTHS.map((m) => (
                <div key={m} className="px-1 py-1">
                  <CommaWonInput
                    name={`incentiveAccrual_${m}`}
                    defaultValue={r.incentiveAccrualByMonth[m] ?? null}
                    disabled={!canEdit}
                    readOnly={!canEdit}
                    className="input w-full min-w-0 px-1 py-1 text-[0.65rem] tabular-nums"
                    placeholder="—"
                  />
                </div>
              ))}
              <div className="flex items-center justify-center px-1 py-1">
                {canEdit ? <RowSubmitButton /> : <span className="text-[0.65rem] text-[var(--muted)]">—</span>}
              </div>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
