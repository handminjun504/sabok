"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import type { QuarterlyRate } from "@/types/models";
import { computeQuarterlyAmountFromRates } from "@/lib/domain/schedule";
import type { saveQuarterlyEmployeeConfigAction } from "@/app/actions/quarterly";
import type { deleteQuarterlyEmployeeConfigAction } from "@/app/actions/quarterly";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const DEFAULT_PAY_MONTHS: readonly number[] = [3, 6, 9, 12];

export type QuarterlyCheckItem = {
  itemKey: string;
  label: string;
  /** 현재 이 항목이 설정된 직원 ID → configId (삭제용) */
  configByEmployeeId: Record<string, string>;
  /** settings.quarterlyPayMonths 에서 읽은 이 항목의 지급 월. 없으면 기본값 사용. */
  payMonths: readonly number[];
};

export type QuarterlyCheckEmployee = {
  id: string;
  employeeCode: string;
  name: string;
  childrenInfant: number;
  childrenPreschool: number;
  childrenTeen: number;
  parentsCount: number;
  parentsInLawCount: number;
  insurancePremium: number;
  loanInterest: number;
  monthlyRentAmount: number | null;
  resignYear: number | null;
  resignMonth: number | null;
};

type SaveAction = typeof saveQuarterlyEmployeeConfigAction;
type DeleteAction = typeof deleteQuarterlyEmployeeConfigAction;
type SaveResult = Awaited<ReturnType<SaveAction>>;
type DeleteResult = Awaited<ReturnType<DeleteAction>>;

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

type CellState = "idle" | "saving" | "ok" | "error";

/**
 * 분기 지원금 — 항목별 대상자 체크 표.
 *
 * 직원 행마다 체크박스 ON/OFF:
 * - ON → `saveQuarterlyEmployeeConfigAction` 호출 (지급 월·금액 자동 계산)
 * - OFF → `deleteQuarterlyEmployeeConfigAction` 호출
 *
 * 금액은 `QuarterlyRate` × 직원 인원수를 즉시 계산해 미리보기로 보여주므로 별도 입력이 없어도 된다.
 */
export function QuarterlyBulkCheckGrid({
  year,
  items,
  employees,
  rates,
  canEdit,
  onSave,
  onDelete,
}: {
  year: number;
  items: QuarterlyCheckItem[];
  employees: QuarterlyCheckEmployee[];
  rates: QuarterlyRate[];
  canEdit: boolean;
  onSave: SaveAction;
  onDelete: DeleteAction;
}) {
  const rateMap = useMemo(() => new Map(rates.map((r) => [r.itemKey, r])), [rates]);

  /** 낙관적 체크 상태: `${employeeId}:${itemKey}` → boolean */
  const [optimistic, setOptimistic] = useState<Map<string, boolean>>(() => new Map());
  const [cellState, setCellState] = useState<Map<string, CellState>>(() => new Map());
  const [, startTransition] = useTransition();

  const cellKey = (empId: string, itemKey: string) => `${empId}:${itemKey}`;

  const isCellChecked = useCallback(
    (empId: string, itemKey: string, fallback: boolean): boolean => {
      const k = cellKey(empId, itemKey);
      if (optimistic.has(k)) return optimistic.get(k) === true;
      return fallback;
    },
    [optimistic],
  );

  const onToggle = useCallback(
    (
      emp: QuarterlyCheckEmployee,
      item: QuarterlyCheckItem,
      currentChecked: boolean,
      existingConfigId: string | undefined,
    ) => {
      if (!canEdit) return;
      const next = !currentChecked;
      const k = cellKey(emp.id, item.itemKey);

      setOptimistic((prev) => {
        const m = new Map(prev);
        m.set(k, next);
        return m;
      });
      setCellState((prev) => {
        const m = new Map(prev);
        m.set(k, "saving");
        return m;
      });

      const rate = rateMap.get(item.itemKey) ?? null;
      const amount = computeQuarterlyAmountFromRates(emp, item.itemKey, rate);
      const payMonths = [...(item.payMonths.length ? item.payMonths : DEFAULT_PAY_MONTHS)];

      startTransition(async () => {
        let res: SaveResult | DeleteResult;
        if (next) {
          const fd = new FormData();
          fd.append("employeeId", emp.id);
          fd.append("year", String(year));
          fd.append("itemKey", item.itemKey);
          fd.append("amount", String(amount));
          for (const m of payMonths) fd.append("payMonth", String(m));
          res = await onSave(null, fd);
        } else {
          const configId = existingConfigId ?? "";
          if (!configId) {
            setOptimistic((prev) => {
              const m = new Map(prev);
              m.set(k, currentChecked);
              return m;
            });
            setCellState((prev) => {
              const m = new Map(prev);
              m.set(k, "error");
              return m;
            });
            return;
          }
          const fd = new FormData();
          fd.append("configId", configId);
          res = await onDelete(null, fd);
        }

        if (res && "성공" in res && res.성공) {
          setCellState((prev) => {
            const m = new Map(prev);
            m.set(k, "ok");
            return m;
          });
          window.setTimeout(() => {
            setCellState((prev) => {
              const m = new Map(prev);
              if (m.get(k) === "ok") m.delete(k);
              return m;
            });
          }, 1500);
        } else {
          setOptimistic((prev) => {
            const m = new Map(prev);
            m.set(k, currentChecked);
            return m;
          });
          setCellState((prev) => {
            const m = new Map(prev);
            m.set(k, "error");
            return m;
          });
        }
      });
    },
    [canEdit, onSave, onDelete, year, rateMap],
  );

  if (employees.length === 0) {
    return <p className="py-6 text-sm text-[var(--muted)]">등록된 직원이 없습니다.</p>;
  }

  return (
    <div className="space-y-10">
      {items.map((item) => {
        const rate = rateMap.get(item.itemKey) ?? null;
        const effectiveMonths = item.payMonths.length ? item.payMonths : DEFAULT_PAY_MONTHS;

        return (
          <div key={item.itemKey} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-bold text-[var(--text)]">{item.label}</h3>
              <span className="text-xs text-[var(--muted)]">
                지급 월: <span className="font-semibold text-[var(--text)]">{effectiveMonths.join("·")}월</span>
              </span>
            </div>

            <div className="surface overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] bg-[var(--surface-hover)]/40">
                    {canEdit ? <th className="w-10 text-center px-2 py-2 text-xs font-bold text-[var(--muted)]">지급</th> : null}
                    <th className="px-2 py-2 text-left text-xs font-bold text-[var(--muted)]">코드</th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-[var(--muted)]">이름</th>
                    <th className="px-2 py-2 text-right text-xs font-bold text-[var(--muted)]">관련 인원</th>
                    <th className="px-2 py-2 text-right text-xs font-bold text-[var(--muted)]">지급액(회당)</th>
                    <th className="px-2 py-2 text-center text-xs font-bold text-[var(--muted)]">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const existingConfigId = item.configByEmployeeId[emp.id];
                    const checked = isCellChecked(emp.id, item.itemKey, !!existingConfigId);
                    const k = cellKey(emp.id, item.itemKey);
                    const cs = cellState.get(k) ?? "idle";
                    const amount = computeQuarterlyAmountFromRates(emp, item.itemKey, rate);
                    const resigned =
                      emp.resignYear != null &&
                      emp.resignMonth != null;

                    const relevantCountLabel = (() => {
                      switch (item.itemKey) {
                        case "INFANT_SCHOLARSHIP": return emp.childrenInfant > 0 ? `영유아 ${emp.childrenInfant}명` : "—";
                        case "PRESCHOOL_SCHOLARSHIP": return emp.childrenPreschool > 0 ? `미취학 ${emp.childrenPreschool}명` : "—";
                        case "TEEN_SCHOLARSHIP": return emp.childrenTeen > 0 ? `청소년 ${emp.childrenTeen}명` : "—";
                        case "PARENT_SUPPORT": {
                          const total = emp.parentsCount + emp.parentsInLawCount;
                          return total > 0 ? `부모 ${emp.parentsCount}+${emp.parentsInLawCount}명` : "—";
                        }
                        case "HEALTH_INSURANCE": return emp.insurancePremium > 0 ? `보험 ${fmt(emp.insurancePremium)}` : "—";
                        case "HOUSING_INTEREST": return emp.loanInterest > 0 ? `이자 ${fmt(emp.loanInterest)}` : "—";
                        case "HOUSING_RENT": return emp.monthlyRentAmount != null && emp.monthlyRentAmount > 0 ? `월세 ${fmt(emp.monthlyRentAmount)}` : "—";
                        default: return "—";
                      }
                    })();

                    return (
                      <tr
                        key={emp.id}
                        className={
                          "border-b border-[var(--border)] " +
                          (resigned ? "opacity-60" : "hover:bg-[var(--surface-hover)]/40")
                        }
                      >
                        {canEdit ? (
                          <td className="text-center px-2 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canEdit || cs === "saving"}
                              className="size-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
                              onChange={() => onToggle(emp, item, checked, existingConfigId)}
                              title={
                                amount === 0
                                  ? "금액이 0원입니다. 요율 설정 또는 직원 인원수를 확인하세요."
                                  : checked
                                    ? "체크 해제 → 이 직원 분기 설정 삭제"
                                    : `체크 ON → ${effectiveMonths.join("·")}월에 ${fmt(amount)}원 지급 설정`
                              }
                            />
                          </td>
                        ) : null}
                        <td className="px-2 py-2 font-mono text-xs tabular-nums text-[var(--muted)]">
                          {emp.employeeCode}
                        </td>
                        <td className="px-2 py-2 text-sm font-semibold text-[var(--text)]">
                          {emp.name}
                          {resigned ? <span className="ml-1.5 text-[0.65rem] text-[var(--muted)]">퇴사</span> : null}
                        </td>
                        <td className="px-2 py-2 text-right text-xs text-[var(--muted)]">
                          {relevantCountLabel}
                        </td>
                        <td className={
                          "px-2 py-2 text-right font-semibold tabular-nums " +
                          (amount === 0 ? "text-[var(--muted)]/50" : "text-[var(--text)]")
                        }>
                          {amount === 0 ? "—" : `${fmt(amount)}원`}
                        </td>
                        <td className="px-2 py-2 text-center text-[0.7rem]">
                          {cs === "saving" ? (
                            <span className="text-[var(--muted)]">저장 중…</span>
                          ) : cs === "ok" ? (
                            <span className="font-semibold text-[var(--success)]">완료 ✓</span>
                          ) : cs === "error" ? (
                            <span className="font-semibold text-[var(--danger)]">오류 !</span>
                          ) : checked ? (
                            <span className="font-semibold text-[var(--accent)]">✓ 설정됨</span>
                          ) : (
                            <span className="text-[var(--muted)]/50">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 지급 월 요약 */}
            <div className="flex flex-wrap gap-1.5">
              {MONTHS.map((m) => (
                <span
                  key={m}
                  className={
                    "rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums " +
                    (effectiveMonths.includes(m)
                      ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-dim)]"
                      : "border-[var(--border)] bg-[var(--surface-hover)]/40 text-[var(--muted)]/50")
                  }
                >
                  {m}월
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
