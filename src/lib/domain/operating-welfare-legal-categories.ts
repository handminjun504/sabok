/**
 * 근로복지기금 운영상황 보고용 — 연간 지급액을 법정 복지비 구분(57~66)으로 배분.
 * 앱 내 정기·분기·선택 복지 원천을 규칙 매핑 후, 총액이 맞도록 조정하고 과도한 편중은 완화한다.
 */
import type { Employee, Level5Override, LevelPaymentRule, MonthlyEmployeeNote, QuarterlyEmployeeConfig } from "@/types/models";
import { PAYMENT_EVENT, QUARTERLY_ITEM, type PaymentEventKey, type QuarterlyItemKey } from "@/lib/business-rules";
import { type CustomPaymentScheduleDef, buildMonthlyBreakdown } from "./schedule";

export const LEGAL_WELFARE_CATEGORY_ROWS: { code: number; label: string }[] = [
  { code: 57, label: "주택구입 임차자금" },
  { code: 58, label: "우리사주 구입자금" },
  { code: 59, label: "생활안전자금" },
  { code: 60, label: "장학금" },
  { code: 61, label: "재난구호금" },
  { code: 62, label: "체육 문화활동지원" },
  { code: 63, label: "모성보호, 일 가정 양립 비용 지원" },
  { code: 64, label: "근로자의 날 행사 등 지원" },
  { code: 65, label: "근로복지시설 설치 및 운영" },
  { code: 66, label: "그 밖의 복지비" },
];

export type WelfareSpendBySource = {
  regularByEventKey: Record<string, number>;
  quarterlyByItemKey: Record<string, number>;
  optionalExtraTotal: number;
};

/** 전 직원·연도 기준 정기/분기/선택 복지 금액을 원천별로 합산 */
export function aggregateWelfareSpendBySource(
  employees: Employee[],
  year: number,
  foundingMonth: number,
  accrualCurrentMonthPayNext: boolean,
  rules: LevelPaymentRule[],
  overrides: Level5Override[],
  quarterly: QuarterlyEmployeeConfig[],
  notes: MonthlyEmployeeNote[],
  customPaymentEvents: CustomPaymentScheduleDef[]
): WelfareSpendBySource {
  const regularByEventKey: Record<string, number> = {};
  const quarterlyByItemKey: Record<string, number> = {};
  let optionalExtraTotal = 0;

  for (const emp of employees) {
    const ovr = overrides.filter((x) => x.employeeId === emp.id);
    const qcfg = quarterly.filter((x) => x.employeeId === emp.id);
    const br = buildMonthlyBreakdown(
      emp,
      year,
      foundingMonth,
      rules,
      ovr,
      qcfg,
      accrualCurrentMonthPayNext,
      customPaymentEvents
    );
    for (const row of br) {
      for (const e of row.regularEvents) {
        regularByEventKey[e.eventKey] = (regularByEventKey[e.eventKey] ?? 0) + e.amount;
      }
      for (const q of row.quarterly) {
        quarterlyByItemKey[q.itemKey] = (quarterlyByItemKey[q.itemKey] ?? 0) + q.amount;
      }
    }
    for (const n of notes) {
      if (n.employeeId !== emp.id || n.year !== year) continue;
      const ex = n.optionalExtraAmount != null ? Number(n.optionalExtraAmount) : 0;
      if (ex !== 0) optionalExtraTotal += ex;
    }
  }

  return { regularByEventKey, quarterlyByItemKey, optionalExtraTotal };
}

function isBuiltinPaymentKey(k: string): k is PaymentEventKey {
  return Object.values(PAYMENT_EVENT).includes(k as PaymentEventKey);
}

function isQuarterlyKey(k: string): k is QuarterlyItemKey {
  return Object.values(QUARTERLY_ITEM).includes(k as QuarterlyItemKey);
}

/** 정기 행사 키 → 법정 구분 코드 */
export function legalCategoryForRegularEventKey(eventKey: string): number {
  if (!isBuiltinPaymentKey(eventKey)) return 66;
  switch (eventKey) {
    case PAYMENT_EVENT.FAMILY_MAY:
      return 64;
    case PAYMENT_EVENT.NEW_YEAR_FEB:
    case PAYMENT_EVENT.CHUSEOK_AUG:
    case PAYMENT_EVENT.YEAR_END_NOV:
      return 62;
    case PAYMENT_EVENT.HIRE_MONTH:
    case PAYMENT_EVENT.FOUNDING_MONTH:
    case PAYMENT_EVENT.BIRTH_MONTH:
    case PAYMENT_EVENT.WEDDING_MONTH:
      return 62;
    default:
      return 66;
  }
}

/** 분기 항목 키 → 법정 구분 코드 */
export function legalCategoryForQuarterlyItemKey(itemKey: string): number {
  if (!isQuarterlyKey(itemKey)) return 66;
  switch (itemKey) {
    case QUARTERLY_ITEM.HOUSING_INTEREST:
      return 57;
    case QUARTERLY_ITEM.HEALTH_INSURANCE:
      return 59;
    case QUARTERLY_ITEM.INFANT_SCHOLARSHIP:
    case QUARTERLY_ITEM.PRESCHOOL_SCHOLARSHIP:
    case QUARTERLY_ITEM.TEEN_SCHOLARSHIP:
      return 60;
    case QUARTERLY_ITEM.PARENT_SUPPORT:
      return 63;
    default:
      return 66;
  }
}

function sumAlloc(alloc: Map<number, number>): number {
  let s = 0;
  for (let c = 57; c <= 66; c++) s += alloc.get(c) ?? 0;
  return s;
}

/**
 * 단일 항목이 total의 maxRatio를 넘지 않도록 초과분을 다른 코드에 나누고,
 * 마지막에 66에서 총액을 맞춘다.
 */
function deconcentrateAlloc(alloc: Map<number, number>, total: number, maxRatio = 0.34): void {
  if (total <= 0) return;
  const codes = [57, 58, 59, 60, 61, 62, 63, 64, 65, 66] as const;
  const cap = Math.floor(total * maxRatio);

  for (let iter = 0; iter < 20; iter++) {
    let maxC = 57 as (typeof codes)[number];
    let maxV = -1;
    for (const c of codes) {
      const v = alloc.get(c) ?? 0;
      if (v > maxV) {
        maxV = v;
        maxC = c;
      }
    }
    if (maxV <= cap) break;
    const over = maxV - cap;
    alloc.set(maxC, cap);
    const recipients = codes.filter((c) => c !== maxC);
    const per = Math.floor(over / recipients.length);
    let rem = over - per * recipients.length;
    for (const c of recipients) {
      const add = per + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      alloc.set(c, (alloc.get(c) ?? 0) + add);
    }
  }

  const diff = total - sumAlloc(alloc);
  alloc.set(66, (alloc.get(66) ?? 0) + diff);
}

/** 원천 합계를 법정 구분별 금액으로 배분(총액 = totalExpected) */
export function allocateYearlyWelfareToLegalCategories(
  spend: WelfareSpendBySource,
  totalExpected: number
): Map<number, number> {
  const alloc = new Map<number, number>();
  for (let c = 57; c <= 66; c++) alloc.set(c, 0);

  for (const [key, amt] of Object.entries(spend.regularByEventKey)) {
    if (amt === 0) continue;
    const code = legalCategoryForRegularEventKey(key);
    alloc.set(code, (alloc.get(code) ?? 0) + amt);
  }
  for (const [key, amt] of Object.entries(spend.quarterlyByItemKey)) {
    if (amt === 0) continue;
    const code = legalCategoryForQuarterlyItemKey(key);
    alloc.set(code, (alloc.get(code) ?? 0) + amt);
  }
  if (spend.optionalExtraTotal !== 0) {
    alloc.set(66, (alloc.get(66) ?? 0) + spend.optionalExtraTotal);
  }

  const s = sumAlloc(alloc);
  alloc.set(66, (alloc.get(66) ?? 0) + (totalExpected - s));

  deconcentrateAlloc(alloc, totalExpected);
  return alloc;
}
