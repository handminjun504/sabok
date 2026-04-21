"use client";

import { useCallback, useState, useTransition } from "react";
import { CommaWonInput } from "@/components/CommaWonInput";
import type { setMonthlyIncentiveAccrualCellAction } from "@/app/actions/quarterly";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * 컬럼 폭:
 *   코드 5.5rem · 이름 6.5rem · (1~12월) 각 7.25rem · 상태 6rem
 *
 * 7.25rem = 콤마 포함 9~10자리(예: 12,345,678)까지 잘리지 않고 보이는 폭.
 * 이전 3.75rem 은 5~6자리만 들어가 흔히 잘려 보였다.
 */
const ROW_GRID =
  "5.5rem 6.5rem repeat(12, minmax(7.25rem, 1fr)) 6rem" as const;

export type MonthlyIncentiveAccrualGridRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  /** 지급월 1~12 — 그 달 노트에 적힌 발생(귀속) 인센 */
  incentiveAccrualByMonth: Record<number, number | null>;
};

type CellKey = `${string}:${number}`;
function cellKey(employeeId: string, month: number): CellKey {
  return `${employeeId}:${month}`;
}

type CellStatus = "idle" | "pending" | "saved" | "error";

export function MonthlyIncentiveAccrualGrid({
  year,
  rows,
  canEdit,
  setCell,
}: {
  year: number;
  rows: MonthlyIncentiveAccrualGridRow[];
  canEdit: boolean;
  /** 한 셀(직원·월) 한 칸을 자동 저장하는 서버 액션. */
  setCell: typeof setMonthlyIncentiveAccrualCellAction;
}) {
  const [statusByCell, setStatusByCell] = useState<Map<CellKey, CellStatus>>(() => new Map());
  const [errorByCell, setErrorByCell] = useState<Map<CellKey, string>>(() => new Map());
  const [, startTransition] = useTransition();

  const onCellCommit = useCallback(
    (employeeId: string, month: number, value: number) => {
      const k = cellKey(employeeId, month);
      setStatusByCell((prev) => {
        const m = new Map(prev);
        m.set(k, "pending");
        return m;
      });
      setErrorByCell((prev) => {
        const m = new Map(prev);
        m.delete(k);
        return m;
      });
      startTransition(async () => {
        const res = await setCell(employeeId, year, month, value > 0 ? value : null);
        if (res.ok) {
          setStatusByCell((prev) => {
            const m = new Map(prev);
            m.set(k, "saved");
            return m;
          });
          /** 잠깐 ‘저장됨’ 표시 후 idle 로 사라짐 — 사용자가 자기 입력이 보존됐다는 신호만 받게. */
          window.setTimeout(() => {
            setStatusByCell((prev) => {
              const m = new Map(prev);
              if (m.get(k) === "saved") m.delete(k);
              return m;
            });
          }, 1500);
        } else {
          setStatusByCell((prev) => {
            const m = new Map(prev);
            m.set(k, "error");
            return m;
          });
          setErrorByCell((prev) => {
            const m = new Map(prev);
            m.set(k, res.오류);
            return m;
          });
        }
      });
    },
    [setCell, year],
  );

  /** 한 행에서 “가장 우선순위 높은” 상태 — error > pending > saved > idle. */
  function rowStatus(employeeId: string): CellStatus {
    let acc: CellStatus = "idle";
    for (let m = 1; m <= 12; m++) {
      const s = statusByCell.get(cellKey(employeeId, m));
      if (s === "error") return "error";
      if (s === "pending") acc = "pending";
      else if (s === "saved" && acc === "idle") acc = "saved";
    }
    return acc;
  }

  function rowErrorMessage(employeeId: string): string | null {
    for (let m = 1; m <= 12; m++) {
      const e = errorByCell.get(cellKey(employeeId, m));
      if (e) return e;
    }
    return null;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        각 칸은 해당 <strong className="text-[var(--text)]">지급월</strong> 월별 노트의「발생 인센」과 같습니다. 입력
        후 잠시 멈추거나 다른 칸을 누르면{" "}
        <strong className="text-[var(--text)]">자동으로 저장</strong>됩니다(저장 버튼 없음). 급여포함신고의 누적
        발생 인센·차액 계산에 반영됩니다.
      </p>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <div className="min-w-[88rem] bg-[var(--surface)]">
          <div
            className="grid border-b border-[var(--border)] bg-[var(--surface-hover)]"
            style={{ gridTemplateColumns: ROW_GRID }}
          >
            <div className="sticky left-0 z-[1] bg-[var(--surface-hover)] px-2 py-2 text-xs font-bold text-[var(--muted)]">
              코드
            </div>
            <div className="sticky left-[5.5rem] z-[1] bg-[var(--surface-hover)] px-2 py-2 text-xs font-bold text-[var(--muted)]">
              이름
            </div>
            {MONTHS.map((m) => (
              <div
                key={m}
                className="px-1 py-2 text-center text-xs font-bold tabular-nums text-[var(--muted)]"
              >
                {m}월
              </div>
            ))}
            <div className="px-1 py-2 text-center text-xs font-bold text-[var(--muted)]">상태</div>
          </div>

          {rows.map((r) => {
            const status = rowStatus(r.employeeId);
            const errMsg = rowErrorMessage(r.employeeId);
            return (
              <div
                key={r.employeeId}
                className="grid border-b border-[var(--border)] last:border-b-0"
                style={{ gridTemplateColumns: ROW_GRID }}
              >
                <div className="sticky left-0 z-[1] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs font-semibold tabular-nums text-[var(--text)]">
                  {r.employeeCode}
                </div>
                <div className="sticky left-[5.5rem] z-[1] bg-[var(--surface)] px-2 py-1.5 text-sm font-medium text-[var(--text)]">
                  {r.name}
                </div>
                {MONTHS.map((m) => {
                  const k = cellKey(r.employeeId, m);
                  const cellState = statusByCell.get(k);
                  const cellHasError = cellState === "error";
                  return (
                    <div key={m} className="px-1 py-1">
                      <CommaWonInput
                        name={`incentiveAccrual_${m}`}
                        defaultValue={r.incentiveAccrualByMonth[m] ?? null}
                        disabled={!canEdit}
                        readOnly={!canEdit}
                        className={
                          "input w-full min-w-0 px-2 py-1 text-sm tabular-nums " +
                          (cellHasError
                            ? "border-[var(--danger)]/60 ring-1 ring-[var(--danger)]/30"
                            : cellState === "saved"
                              ? "border-[var(--success)]/40"
                              : "")
                        }
                        placeholder="—"
                        onCommitValue={
                          canEdit
                            ? (v) => onCellCommit(r.employeeId, m, v)
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
                <div className="flex items-center justify-center px-1 py-1 text-[0.7rem]">
                  {status === "pending" ? (
                    <span className="text-[var(--muted)]">저장 중…</span>
                  ) : status === "saved" ? (
                    <span className="font-semibold text-[var(--success)]">저장됨 ✓</span>
                  ) : status === "error" ? (
                    <span
                      className="font-semibold text-[var(--danger)]"
                      title={errMsg ?? "저장 실패"}
                    >
                      오류 !
                    </span>
                  ) : !canEdit ? (
                    <span className="text-[var(--muted)]">—</span>
                  ) : (
                    <span className="text-[var(--muted)]">자동 저장</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
