"use client";

import { useCallback, useState, useTransition } from "react";
import { CommaWonInput } from "@/components/CommaWonInput";
import type { setMonthlyIncentiveAccrualCellAction } from "@/app/actions/quarterly";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * 컬럼 폭:
 *   코드 5.5rem · 이름 6.5rem · (1~12월) 각 7.25rem · 예상 7rem · 누적 7rem · 잔여 9rem · 상태 6rem
 *
 * 7.25rem = 콤마 포함 9~10자리(예: 12,345,678)까지 잘리지 않고 보이는 폭.
 * 이전 3.75rem 은 5~6자리만 들어가 흔히 잘려 보였다.
 *
 * 행 끝 요약 3칸:
 *   - 예상: 직원 마스터의 ‘예상 인센’ (incentiveAmount). 입력 불가, 직원 폼에서만 수정.
 *   - 누적: 1~12월 발생 인센 합. 입력 즉시(타이핑 단계에서) 갱신.
 *   - 잔여: 예상 − 누적. 음수면 빨갛게 + ‘급여 얹기’ 라벨 → 사복으로 다 지급할 수 없으니 초과분은 급여 포함으로 신고해야 함을 알림.
 */
const ROW_GRID =
  "5.5rem 6.5rem repeat(12, minmax(7.25rem, 1fr)) 7rem 7rem 9rem 6rem" as const;

export type MonthlyIncentiveAccrualGridRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  /** 지급월 1~12 — 그 달 노트에 적힌 발생(귀속) 인센 */
  incentiveAccrualByMonth: Record<number, number | null>;
  /** 직원 마스터 ‘예상 인센’ — 사복으로 지급 가능한 한도. null/0 이면 한도 없음(잔여 비교 생략). */
  incentiveAmount: number | null;
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
  /**
   * 12개월 입력값을 라이브로 추적 — 잔여(예상-누적) 표시는 디바운스/저장 전에도 즉시 반영되어야 한다.
   * 초기값은 props 로 받은 incentiveAccrualByMonth, 이후 onUserChange 로 키 입력마다 갱신.
   */
  const [valueByCell, setValueByCell] = useState<Map<CellKey, number>>(() => {
    const m = new Map<CellKey, number>();
    for (const r of rows) {
      for (let mn = 1; mn <= 12; mn++) {
        const v = r.incentiveAccrualByMonth[mn];
        if (v != null && Number.isFinite(Number(v))) {
          m.set(cellKey(r.employeeId, mn), Math.round(Number(v)));
        }
      }
    }
    return m;
  });
  const [, startTransition] = useTransition();

  const onCellLiveChange = useCallback((employeeId: string, month: number, value: number) => {
    const k = cellKey(employeeId, month);
    setValueByCell((prev) => {
      const m = new Map(prev);
      if (value > 0) m.set(k, Math.round(value));
      else m.delete(k);
      return m;
    });
  }, []);

  const onCellCommit = useCallback(
    (employeeId: string, month: number, value: number) => {
      const k = cellKey(employeeId, month);
      /** commit 도 동일하게 라이브 맵을 한 번 더 정리(blur 만 한 케이스에서 필요). */
      setValueByCell((prev) => {
        const m = new Map(prev);
        if (value > 0) m.set(k, Math.round(value));
        else m.delete(k);
        return m;
      });
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

  function rowAccrualSum(employeeId: string): number {
    let s = 0;
    for (let m = 1; m <= 12; m++) {
      const v = valueByCell.get(cellKey(employeeId, m));
      if (typeof v === "number") s += v;
    }
    return s;
  }

  function fmt(n: number): string {
    return Math.round(n).toLocaleString("ko-KR");
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        각 칸은 해당 <strong className="text-[var(--text)]">지급월</strong> 월별 노트의「발생 인센」과 같습니다. 입력
        후 잠시 멈추거나 다른 칸을 누르면{" "}
        <strong className="text-[var(--text)]">자동으로 저장</strong>됩니다(저장 버튼 없음). 행 끝의{" "}
        <strong className="text-[var(--text)]">잔여(예상−누적)</strong>가 음수면 발생 인센이 ‘예상 인센’ 한도를
        넘은 것이라, 초과분은 사복으로 다 줄 수 없으므로 <strong className="text-[var(--text)]">급여에 얹어 신고</strong>해야 합니다.
      </p>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <div className="min-w-[110rem] bg-[var(--surface)]">
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
            <div className="px-2 py-2 text-right text-xs font-bold text-[var(--muted)]" title="직원 폼의 ‘예상 인센’ — 사복으로 줄 수 있는 한도">
              예상 인센
            </div>
            <div className="px-2 py-2 text-right text-xs font-bold text-[var(--muted)]" title="1~12월 발생 인센 합">
              누적 발생
            </div>
            <div className="px-2 py-2 text-right text-xs font-bold text-[var(--muted)]" title="예상 − 누적 발생 (음수 = 급여 얹기 필요)">
              잔여(예상−누적)
            </div>
            <div className="px-1 py-2 text-center text-xs font-bold text-[var(--muted)]">상태</div>
          </div>

          {rows.map((r) => {
            const status = rowStatus(r.employeeId);
            const errMsg = rowErrorMessage(r.employeeId);
            const expected =
              r.incentiveAmount != null && Number.isFinite(Number(r.incentiveAmount))
                ? Math.max(0, Math.round(Number(r.incentiveAmount)))
                : 0;
            const accrued = rowAccrualSum(r.employeeId);
            const hasCap = expected > 0;
            const remaining = expected - accrued;
            const overflow = hasCap && remaining < 0;
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
                        onUserChange={(v) => onCellLiveChange(r.employeeId, m, v)}
                        onCommitValue={
                          canEdit
                            ? (v) => onCellCommit(r.employeeId, m, v)
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
                <div
                  className="flex items-center justify-end px-2 py-1.5 text-sm tabular-nums text-[var(--muted)]"
                  title="직원 폼의 ‘예상 인센’ — 사복으로 줄 수 있는 한도"
                >
                  {hasCap ? fmt(expected) : "—"}
                </div>
                <div
                  className="flex items-center justify-end px-2 py-1.5 text-sm font-semibold tabular-nums text-[var(--text)]"
                  title="1~12월 발생 인센 합 (입력 즉시 갱신)"
                >
                  {accrued > 0 ? fmt(accrued) : "—"}
                </div>
                <div
                  className={
                    "flex flex-col items-end justify-center px-2 py-1.5 text-sm tabular-nums " +
                    (overflow
                      ? "text-[var(--danger)]"
                      : hasCap && remaining > 0
                        ? "text-[var(--success)]"
                        : "text-[var(--muted)]")
                  }
                  title={
                    !hasCap
                      ? "직원 폼에 ‘예상 인센’이 비어 있어 잔여를 비교할 수 없습니다."
                      : overflow
                        ? `발생 ${fmt(accrued)} − 예상 ${fmt(expected)} = ${fmt(-remaining)}원 초과. 사복 한도를 넘어 급여 포함으로 신고해야 합니다.`
                        : `예상 ${fmt(expected)} − 발생 ${fmt(accrued)} = 잔여 ${fmt(remaining)}원`
                  }
                >
                  <span className={overflow ? "font-bold" : "font-semibold"}>
                    {!hasCap ? "—" : (remaining >= 0 ? fmt(remaining) : `−${fmt(-remaining)}`)}
                  </span>
                  {overflow ? (
                    <span className="mt-0.5 text-[0.65rem] font-bold uppercase tracking-wide">
                      급여 얹기
                    </span>
                  ) : null}
                </div>
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
