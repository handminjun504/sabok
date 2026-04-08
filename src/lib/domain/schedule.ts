import type { Decimal } from "@prisma/client/runtime/library";
import type { Employee, Level5Override, LevelPaymentRule, QuarterlyEmployeeConfig } from "@prisma/client";
import {
  FIXED_EVENT_MONTH,
  PAYMENT_EVENT,
  type PaymentEventKey,
  QUARTERLY_INTERVAL_MONTHS,
} from "../business-rules";

export type MonthBreakdown = {
  /** 귀속(이벤트 발생) 기준 월 */
  accrualMonth: number;
  /** 실제 지급 표시 월 (당월귀속·차월지급 시 익월) */
  paidMonth: number;
  regularEvents: { eventKey: PaymentEventKey; amount: number }[];
  quarterly: { itemKey: string; amount: number }[];
  totalWelfareMonth: number;
};

function toNum(v: Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  return Number(v.toString());
}

export function resolveEventAmount(
  employee: Pick<Employee, "level">,
  eventKey: PaymentEventKey,
  year: number,
  rules: LevelPaymentRule[],
  overrides: Level5Override[]
): number {
  if (employee.level === 5) {
    const ov = overrides.find((o) => o.year === year && o.eventKey === eventKey);
    if (ov) return toNum(ov.amount);
  }
  const rule = rules.find((r) => r.year === year && r.level === employee.level && r.eventKey === eventKey);
  return rule ? toNum(rule.amount) : 0;
}

/** 해당 월에 발생하는 정기 이벤트 목록 */
export function eventsOccurringInMonth(
  month: number,
  employee: Pick<Employee, "hireMonth" | "birthMonth" | "weddingMonth">,
  foundingMonth: number
): PaymentEventKey[] {
  const keys: PaymentEventKey[] = [];
  (Object.keys(FIXED_EVENT_MONTH) as PaymentEventKey[]).forEach((k) => {
    if (FIXED_EVENT_MONTH[k] === month) keys.push(k);
  });
  if (employee.hireMonth === month) keys.push(PAYMENT_EVENT.HIRE_MONTH);
  if (foundingMonth === month) keys.push(PAYMENT_EVENT.FOUNDING_MONTH);
  if (employee.birthMonth === month) keys.push(PAYMENT_EVENT.BIRTH_MONTH);
  if (employee.weddingMonth === month) keys.push(PAYMENT_EVENT.WEDDING_MONTH);
  return keys;
}

export function buildMonthlyBreakdown(
  employee: Employee,
  year: number,
  foundingMonth: number,
  rules: LevelPaymentRule[],
  overrides: Level5Override[],
  quarterly: QuarterlyEmployeeConfig[],
  accrualCurrentMonthPayNext: boolean
): MonthBreakdown[] {
  const qByPaidMonth = new Map<number, { itemKey: string; amount: number }[]>();
  for (const q of quarterly) {
    if (q.year !== year) continue;
    const m = q.paymentMonth;
    const list = qByPaidMonth.get(m) ?? [];
    list.push({ itemKey: q.itemKey, amount: toNum(q.amount) });
    qByPaidMonth.set(m, list);
  }

  const months: MonthBreakdown[] = [];
  for (let accrualMonth = 1; accrualMonth <= 12; accrualMonth++) {
    const paidMonth = accrualCurrentMonthPayNext
      ? accrualMonth === 12
        ? 1
        : accrualMonth + 1
      : accrualMonth;
    const eventKeys = eventsOccurringInMonth(accrualMonth, employee, foundingMonth);
    const regularEvents = eventKeys.map((eventKey) => ({
      eventKey,
      amount: resolveEventAmount(employee, eventKey, year, rules, overrides),
    }));
    const quarterlyAtPaidMonth = qByPaidMonth.get(paidMonth) ?? [];
    const totalRegular = regularEvents.reduce((s, e) => s + e.amount, 0);
    const totalQ = quarterlyAtPaidMonth.reduce((s, e) => s + e.amount, 0);
    months.push({
      accrualMonth,
      paidMonth,
      regularEvents,
      quarterly: quarterlyAtPaidMonth,
      totalWelfareMonth: totalRegular + totalQ,
    });
  }
  return months;
}

export function validateQuarterlyMonth(paymentMonth: number): { ok: boolean; message?: string } {
  if (paymentMonth < 1 || paymentMonth > 12) {
    return { ok: false, message: "지급 월은 1~12 사이여야 합니다." };
  }
  return { ok: true };
}

export function suggestQuarterlyMonths(startMonth: number): number[] {
  const m = ((startMonth - 1) % 12) + 1;
  return [m, ((m + QUARTERLY_INTERVAL_MONTHS - 1) % 12) + 1, ((m + 5) % 12) + 1, ((m + 8) % 12) + 1].slice(
    0,
    4
  );
}

/** 분기 금액 산출(템플릿 요율) */
export function computeQuarterlyAmountFromRates(
  employee: Pick<
    Employee,
    | "childrenInfant"
    | "childrenPreschool"
    | "childrenTeen"
    | "parentsCount"
    | "parentsInLawCount"
    | "insurancePremium"
    | "loanInterest"
  >,
  itemKey: string,
  rate: {
    amountPerInfant: Decimal | null;
    amountPerPreschool: Decimal | null;
    amountPerTeen: Decimal | null;
    amountPerParent: Decimal | null;
    amountPerInLaw: Decimal | null;
    flatAmount: Decimal | null;
    percentInsurance: Decimal | null;
    percentLoanInterest: Decimal | null;
  } | null
): number {
  if (!rate) return 0;
  switch (itemKey) {
    case "INFANT_SCHOLARSHIP":
      return toNum(rate.amountPerInfant) * employee.childrenInfant;
    case "PRESCHOOL_SCHOLARSHIP":
      return toNum(rate.amountPerPreschool) * employee.childrenPreschool;
    case "TEEN_SCHOLARSHIP":
      return toNum(rate.amountPerTeen) * employee.childrenTeen;
    case "PARENT_SUPPORT":
      return (
        toNum(rate.amountPerParent) * employee.parentsCount +
        toNum(rate.amountPerInLaw) * employee.parentsInLawCount
      );
    case "HEALTH_INSURANCE":
      return Math.round(toNum(rate.percentInsurance) * toNum(employee.insurancePremium));
    case "HOUSING_INTEREST":
      return Math.round(toNum(rate.percentLoanInterest) * toNum(employee.loanInterest));
    default:
      return toNum(rate.flatAmount);
  }
}

export function monthlySalaryPortion(employee: Pick<Employee, "adjustedSalary" | "baseSalary">): number {
  const base = toNum(employee.adjustedSalary) > 0 ? toNum(employee.adjustedSalary) : toNum(employee.baseSalary);
  return Math.round(base / 12);
}

/** 지급월 기준으로 모든 직원 합계(정기+분기가 동일 행에 묶인 값) */
export function sumByPaidMonth(all: MonthBreakdown[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of all) {
    map.set(row.paidMonth, (map.get(row.paidMonth) ?? 0) + row.totalWelfareMonth);
  }
  return map;
}

export function yearlyWelfareTotal(rows: MonthBreakdown[]): number {
  return rows.reduce((s, r) => s + r.totalWelfareMonth, 0);
}
