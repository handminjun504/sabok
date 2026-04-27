"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { CommaWonInput } from "@/components/CommaWonInput";
import { saveQuarterlyRatesFormAction } from "@/app/actions/quarterly";
import type { QuarterlyRate } from "@/types/models";
import { QUARTERLY_ITEM, QUARTERLY_ITEM_LABELS, type QuarterlyItemKey } from "@/lib/business-rules";

const LEVELS = [0, 1, 2, 3, 4, 5] as const;
const LEVEL_LABELS: Record<number, string> = {
  0: "공통(기본)",
  1: "레벨 1",
  2: "레벨 2",
  3: "레벨 3",
  4: "레벨 4",
  5: "레벨 5",
};

const INPUT_CLS =
  "w-[6.5rem] min-w-[5.5rem] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-right text-sm tabular-nums focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]";

type RateCell = {
  /** 항목 키 */
  itemKey: QuarterlyItemKey;
  /** form input suffix (e.g. "infant", "par") */
  field: string;
  /** 레이블 */
  label: string;
  /** 단위 표시 */
  suffix: string;
  /** rate 객체에서 값을 꺼내는 키 */
  rateKey: keyof Pick<
    QuarterlyRate,
    | "amountPerInfant"
    | "amountPerPreschool"
    | "amountPerTeen"
    | "amountPerParent"
    | "amountPerInLaw"
    | "flatAmount"
    | "percentInsurance"
    | "percentLoanInterest"
  >;
  /** 보조 설명 */
  hint: string;
};

const RATE_CELLS: RateCell[] = [
  {
    itemKey: "INFANT_SCHOLARSHIP",
    field: "infant",
    label: "자녀(영유아) 1명당",
    suffix: "원/명",
    rateKey: "amountPerInfant",
    hint: "영유아 자녀 수에 곱해짐",
  },
  {
    itemKey: "PRESCHOOL_SCHOLARSHIP",
    field: "pre",
    label: "자녀(미취학) 1명당",
    suffix: "원/명",
    rateKey: "amountPerPreschool",
    hint: "미취학 자녀 수에 곱해짐",
  },
  {
    itemKey: "TEEN_SCHOLARSHIP",
    field: "teen",
    label: "자녀(청소년) 1명당",
    suffix: "원/명",
    rateKey: "amountPerTeen",
    hint: "청소년 자녀 수에 곱해짐",
  },
  {
    itemKey: "PARENT_SUPPORT",
    field: "par",
    label: "부모봉양 — 부모 1명당",
    suffix: "원/명",
    rateKey: "amountPerParent",
    hint: "부모 수에 곱해짐",
  },
  {
    itemKey: "PARENT_SUPPORT",
    field: "inlaw",
    label: "부모봉양 — 시부모 1명당",
    suffix: "원/명",
    rateKey: "amountPerInLaw",
    hint: "시부모 수에 곱해짐",
  },
  {
    itemKey: "HEALTH_INSURANCE",
    field: "pins",
    label: "건강보험료 한도",
    suffix: "원",
    rateKey: "percentInsurance",
    hint: "min(발생액, 한도)",
  },
  {
    itemKey: "HOUSING_INTEREST",
    field: "ploan",
    label: "대출이자 한도",
    suffix: "원",
    rateKey: "percentLoanInterest",
    hint: "min(발생액, 한도)",
  },
  {
    itemKey: "HOUSING_RENT",
    field: "flat",
    label: "월세 월 한도",
    suffix: "원/월",
    rateKey: "flatAmount",
    hint: "min(발생액, 한도)",
  },
];

/** `(itemKey, level)` → QuarterlyRate */
function buildRateIndex(rates: QuarterlyRate[]): Map<string, QuarterlyRate> {
  const m = new Map<string, QuarterlyRate>();
  for (const r of rates) {
    m.set(`${r.itemKey}:${r.level}`, r);
  }
  return m;
}

function cellKey(itemKey: string, field: string, level: number) {
  return `${itemKey}:${field}:${level}`;
}

type CellStatus = "idle" | "saving" | "saved" | "error";

export function QuarterlyRatesMatrixForm({
  year,
  rates,
  canEdit,
}: {
  year: number;
  rates: QuarterlyRate[];
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();
  const [cellStatus, setCellStatus] = useState<Map<string, CellStatus>>(() => new Map());
  const [globalError, setGlobalError] = useState<string | null>(null);

  const rateIndex = useMemo(() => buildRateIndex(rates), [rates]);

  const getDefaultValue = useCallback(
    (cell: RateCell, level: number): number => {
      const r = rateIndex.get(`${cell.itemKey}:${level}`);
      return Number(r?.[cell.rateKey] ?? 0);
    },
    [rateIndex]
  );

  const handleCommit = useCallback(
    (cell: RateCell, level: number) => (amount: number) => {
      const k = cellKey(cell.itemKey, cell.field, level);
      setCellStatus((prev) => new Map(prev).set(k, "saving"));
      setGlobalError(null);

      const fd = new FormData();
      fd.set("year", String(year));
      const suffix = level === 0 ? "" : `_lv${level}`;
      fd.set(`${cell.itemKey}_${cell.field}${suffix}`, String(amount));

      startTransition(async () => {
        const res = await saveQuarterlyRatesFormAction(fd);
        if (res && typeof res === "object" && "오류" in res) {
          setCellStatus((prev) => new Map(prev).set(k, "error"));
          setGlobalError((res as { 오류: string }).오류);
        } else {
          setCellStatus((prev) => {
            const next = new Map(prev).set(k, "saved");
            setTimeout(() => setCellStatus((p) => { const m = new Map(p); m.set(k, "idle"); return m; }), 1500);
            return next;
          });
        }
      });
    },
    [year]
  );

  if (!canEdit) {
    return (
      <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
    );
  }

  const items = Object.values(QUARTERLY_ITEM) as QuarterlyItemKey[];

  return (
    <div className="space-y-2">
      {globalError && (
        <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{globalError}</p>
      )}
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        공통(기본) 칸을 채우면 레벨별 칸이 비어있을 때 자동으로 fallback 됩니다.
        레벨별 칸에 값을 입력하면 해당 레벨 직원에게는 그 단가가 우선 적용됩니다.
        셀을 벗어나면 자동 저장됩니다.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border-strong)]">
              <th className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-2 text-left text-xs font-bold text-[var(--text)]">
                항목
              </th>
              {LEVELS.map((lv) => (
                <th
                  key={lv}
                  className={`px-2 py-2 text-center text-xs font-semibold text-[var(--text)] ${
                    lv === 0 ? "dash-table-vline-strong" : "dash-table-vline"
                  }`}
                >
                  <span className={lv === 0 ? "text-[var(--text)]" : "text-[var(--muted)]"}>
                    {LEVEL_LABELS[lv]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.flatMap((itemKey) => {
              const cells = RATE_CELLS.filter((c) => c.itemKey === itemKey);
              return cells.map((cell, ci) => (
                <tr
                  key={`${itemKey}-${cell.field}`}
                  className={`border-b border-[var(--border)] hover:bg-[var(--surface-hover)] ${
                    ci === 0 && itemKey !== items[0] ? "border-t-2 border-t-[var(--border-strong)]" : ""
                  }`}
                >
                  <td className="sticky left-0 z-[1] bg-[var(--surface)] px-3 py-2 text-left text-xs font-medium leading-snug text-[var(--text)] whitespace-nowrap">
                    <div className="font-semibold">
                      {ci === 0 ? QUARTERLY_ITEM_LABELS[itemKey] : ""}
                    </div>
                    <div className="text-[var(--muted)]">{cell.label.split("—").pop()?.trim() ?? cell.label}</div>
                  </td>
                  {LEVELS.map((lv) => {
                    const k = cellKey(itemKey, cell.field, lv);
                    const status = cellStatus.get(k) ?? "idle";
                    return (
                      <td
                        key={lv}
                        className={`px-1 py-1 text-center ${
                          lv === 0 ? "dash-table-vline-strong" : "dash-table-vline"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <CommaWonInput
                            name={`_${cell.itemKey}_${cell.field}_lv${lv}`}
                            defaultValue={getDefaultValue(cell, lv)}
                            className={`${INPUT_CLS} ${
                              status === "error"
                                ? "border-[var(--danger)]"
                                : status === "saved"
                                  ? "border-[var(--success)]"
                                  : lv === 0
                                    ? ""
                                    : "opacity-80"
                            }`}
                            commitDebounceMs={800}
                            onCommitValue={handleCommit(cell, lv)}
                          />
                          {status === "saving" && (
                            <span className="text-[0.6rem] text-[var(--muted)]">저장 중…</span>
                          )}
                          {status === "saved" && (
                            <span className="text-[0.6rem] text-[var(--success)]">저장됨</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
