/** 월별 기금(정기·분기·선택) 집계 — 참고 시트의 월별지급·취합과 같은 의미로 맞춤. docs/sheet-mapping.md */
import type {
  CustomPaymentEventDef,
  Employee,
  Level5Override,
  LevelPaymentRule,
  QuarterlyEmployeeConfig,
} from "@/types/models";
import {
  FIXED_EVENT_MONTH,
  PAYMENT_EVENT,
  PAYMENT_EVENT_LABELS,
  QUARTERLY_ITEM_LABELS,
  type PaymentEventKey,
  type QuarterlyItemKey,
  QUARTERLY_INTERVAL_MONTHS,
} from "../business-rules";
import { paymentEventLabel } from "./payment-events";

/**
 * 급여포함신고 관련 함수들은 `./salary-inclusion` 으로 분리되었다.
 * 기존 호출부 호환을 위해 그대로 re-export 한다(신규 코드는 `./salary-inclusion` 에서 직접 import 권장).
 */
export {
  computeIncentiveWelfareSalaryInclusionYtd,
  computeSalaryInclusionCapBlocks,
  computeSalaryInclusionVsActual,
  computeWelfareCapVsActual,
  resolveSalaryInclusionCap,
  salaryInclusionCapLabel,
  sumIncentiveAccrualYtd,
  sumIncentiveWelfarePaymentThroughMonth,
  sumIncentiveWelfarePaymentYtd,
  type MonthlyNoteIncentiveFields,
  type SalaryInclusionCapBlock,
  type SalaryInclusionCapSource,
} from "./salary-inclusion";

/** 테넌트 추가 정기 행사(귀속 월) */
export type CustomPaymentScheduleDef = { eventKey: string; accrualMonth: number };

export type MonthBreakdown = {
  /** 귀속(이벤트 발생) 기준 월 */
  accrualMonth: number;
  /** 실제 지급 표시 월 (당월귀속·차월지급 시 익월) */
  paidMonth: number;
  regularEvents: { eventKey: string; amount: number }[];
  quarterly: { itemKey: string; amount: number }[];
  totalWelfareMonth: number;
};

function toNum(v: number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

/** 직원 발생액(보험료·이자·월세 등) 대비 분기 템플릿에 넣는 기금 지급 한도(원) */
function quarterlyWelfareMinOccurredAndCap(occurred: number, capWon: number | null | undefined): number {
  const o = Math.max(0, Math.round(toNum(occurred)));
  const c =
    capWon != null && capWon !== undefined && Number.isFinite(Number(capWon))
      ? Math.max(0, Math.round(toNum(capWon)))
      : 0;
  if (c <= 0) return 0;
  return Math.min(o, c);
}

function employeeLevelNorm(employee: Pick<Employee, "level">): number {
  const n = Math.round(Number(employee.level));
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

/** 해당 연도·레벨의 정기(레벨/행사) 규칙 금액 합 — 모든 행사가 한 번씩 발생한다고 가정한 표준 연간 합 */
export function sumRegularRulesAnnualForLevel(
  rules: LevelPaymentRule[],
  year: number,
  level: number
): number {
  let s = 0;
  for (const r of rules) {
    if (r.year !== year || Number(r.level) !== level) continue;
    s += Math.round(toNum(r.amount));
  }
  return s;
}

/** 레벨 1~5 각각의 정기(규칙) 연간 합 */
export function regularAnnualTotalsByLevel(rules: LevelPaymentRule[], year: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (let lv = 1; lv <= 5; lv++) {
    out[lv] = sumRegularRulesAnnualForLevel(rules, year, lv);
  }
  return out;
}

/**
 * 지급 예정액(원)과 각 레벨의 정기(규칙) 연간 합을 비교해 가장 가까운 레벨.
 * 예정액이 없거나 0 이하면 null.
 */
export function suggestLevelByExpectedRegular(
  expectedWon: number | null | undefined,
  totalsByLevel: Record<number, number>
): number | null {
  const e =
    expectedWon != null && Number.isFinite(Number(expectedWon)) ? Math.max(0, Math.round(Number(expectedWon))) : 0;
  if (e <= 0) return null;
  let best: number | null = null;
  let bestDiff = Infinity;
  for (let lv = 1; lv <= 5; lv++) {
    const t = totalsByLevel[lv] ?? 0;
    const d = Math.abs(t - e);
    if (d < bestDiff || (d === bestDiff && best !== null && lv < best)) {
      bestDiff = d;
      best = lv;
    }
  }
  return best;
}

export function resolveEventAmount(
  employee: Pick<Employee, "level">,
  eventKey: string,
  year: number,
  rules: LevelPaymentRule[],
  overrides: Level5Override[]
): number {
  const lv = employeeLevelNorm(employee);
  if (lv === 5) {
    const ov = overrides.find((o) => o.year === year && o.eventKey === eventKey);
    if (ov) return toNum(ov.amount);
  }
  const rule = rules.find(
    (r) => r.year === year && Number(r.level) === lv && r.eventKey === eventKey
  );
  return rule ? toNum(rule.amount) : 0;
}

/** 해당 월에 발생하는 정기 이벤트 목록 */
export function eventsOccurringInMonth(
  month: number,
  employee: Pick<Employee, "hireMonth" | "birthMonth" | "weddingMonth">,
  foundingMonth: number,
  customPaymentEvents: CustomPaymentScheduleDef[] = []
): string[] {
  const keys: string[] = [];
  (Object.keys(FIXED_EVENT_MONTH) as PaymentEventKey[]).forEach((k) => {
    if (FIXED_EVENT_MONTH[k] === month) keys.push(k);
  });
  if (employee.hireMonth === month) keys.push(PAYMENT_EVENT.HIRE_MONTH);
  if (foundingMonth === month) keys.push(PAYMENT_EVENT.FOUNDING_MONTH);
  if (employee.birthMonth === month) keys.push(PAYMENT_EVENT.BIRTH_MONTH);
  if (employee.weddingMonth === month) keys.push(PAYMENT_EVENT.WEDDING_MONTH);
  for (const c of customPaymentEvents) {
    if (c.accrualMonth === month) keys.push(c.eventKey);
  }
  return keys;
}

export function buildMonthlyBreakdown(
  employee: Employee,
  year: number,
  foundingMonth: number,
  rules: LevelPaymentRule[],
  overrides: Level5Override[],
  quarterly: QuarterlyEmployeeConfig[],
  accrualCurrentMonthPayNext: boolean,
  customPaymentEvents: CustomPaymentScheduleDef[] = []
): MonthBreakdown[] {
  const qByPaidMonth = new Map<number, { itemKey: string; amount: number }[]>();
  for (const q of quarterly) {
    if (q.year !== year) continue;
    const months = q.paymentMonths.length > 0 ? q.paymentMonths : [];
    for (const m of months) {
      if (m < 1 || m > 12) continue;
      const list = qByPaidMonth.get(m) ?? [];
      list.push({ itemKey: q.itemKey, amount: toNum(q.amount) });
      qByPaidMonth.set(m, list);
    }
  }

  const months: MonthBreakdown[] = [];
  for (let accrualMonth = 1; accrualMonth <= 12; accrualMonth++) {
    const paidMonth = accrualCurrentMonthPayNext
      ? accrualMonth === 12
        ? 1
        : accrualMonth + 1
      : accrualMonth;
    const eventKeys = eventsOccurringInMonth(accrualMonth, employee, foundingMonth, customPaymentEvents);
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

export function normalizeQuarterlyPaymentMonths(months: readonly number[]): number[] {
  const s = new Set<number>();
  for (const x of months) {
    const n = Math.round(Number(x));
    if (n >= 1 && n <= 12) s.add(n);
  }
  return [...s].sort((a, b) => a - b);
}

export function validateQuarterlyPaymentMonths(months: number[]): { ok: boolean; message?: string } {
  const n = normalizeQuarterlyPaymentMonths(months);
  if (n.length === 0) return { ok: false, message: "지급 월을 1개 이상 선택하세요." };
  return { ok: true };
}

export function suggestQuarterlyMonths(startMonth: number): number[] {
  const m = ((startMonth - 1) % 12) + 1;
  return [m, ((m + QUARTERLY_INTERVAL_MONTHS - 1) % 12) + 1, ((m + 5) % 12) + 1, ((m + 8) % 12) + 1].slice(
    0,
    4
  );
}

/** 분기 금액 산출(템플릿). 보험·이자·월세는 발생액 대비 지급 한도(원) = min(발생, 한도). */
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
    | "monthlyRentAmount"
  >,
  itemKey: string,
  rate: {
    amountPerInfant: number | null;
    amountPerPreschool: number | null;
    amountPerTeen: number | null;
    amountPerParent: number | null;
    amountPerInLaw: number | null;
    flatAmount: number | null;
    /** PB 필드명 레거시 — 의미는 건강보험 지급 한도(원) */
    percentInsurance: number | null;
    /** PB 필드명 레거시 — 의미는 주택이자 지급 한도(원) */
    percentLoanInterest: number | null;
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
      return quarterlyWelfareMinOccurredAndCap(employee.insurancePremium, rate.percentInsurance);
    case "HOUSING_INTEREST":
      return quarterlyWelfareMinOccurredAndCap(employee.loanInterest, rate.percentLoanInterest);
    case "HOUSING_RENT":
      return quarterlyWelfareMinOccurredAndCap(
        employee.monthlyRentAmount != null ? toNum(employee.monthlyRentAmount) : 0,
        rate.flatAmount
      );
    default:
      return toNum(rate.flatAmount);
  }
}

export function monthlySalaryPortion(employee: Pick<Employee, "adjustedSalary" | "baseSalary">): number {
  const base = toNum(employee.adjustedSalary) > 0 ? toNum(employee.adjustedSalary) : toNum(employee.baseSalary);
  return Math.round(base / 12);
}

/** 적용 연봉(원/년): 조정급여가 있으면 조정, 없으면 기존연봉 */
export function effectiveAnnualSalaryWon(employee: Pick<Employee, "baseSalary" | "adjustedSalary">): number {
  const adj = toNum(employee.adjustedSalary);
  const base = toNum(employee.baseSalary);
  return Math.round(adj > 0 ? adj : base);
}

/** 지급월 기준으로 모든 직원 합계(정기+분기가 동일 행에 묶인 값) */
export function sumByPaidMonth(all: MonthBreakdown[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of all) {
    map.set(row.paidMonth, (map.get(row.paidMonth) ?? 0) + row.totalWelfareMonth);
  }
  return map;
}

/**
 * 월별 스케줄 표(1~12월 열)용 금액 — 참고 시트 「월별지급스케줄」처럼 정기는 **귀속월**,
 * 분기 지원은 설정한 **지급월**에 나눠 담습니다. (당월 귀속·익월 지급이어도 정기는 귀속 달 열에 표시)
 * 선택 복지 노트는 `month`를 지급월로 보고 같은 열에 합산합니다.
 * 열 합계는 `yearlyWelfareTotal(br) + 노트 추가액`과 일치합니다.
 */
export function welfareByScheduleDisplayMonth(
  br: MonthBreakdown[],
  noteExtrasByPaidMonth?: ReadonlyMap<number, number>
): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of br) {
    const reg = row.regularEvents.reduce((s, e) => s + e.amount, 0);
    if (reg !== 0) {
      map.set(row.accrualMonth, (map.get(row.accrualMonth) ?? 0) + reg);
    }
    const q = row.quarterly.reduce((s, e) => s + e.amount, 0);
    if (q !== 0) {
      map.set(row.paidMonth, (map.get(row.paidMonth) ?? 0) + q);
    }
  }
  if (noteExtrasByPaidMonth) {
    for (const [m, amt] of noteExtrasByPaidMonth) {
      if (amt === 0 || m < 1 || m > 12) continue;
      map.set(m, (map.get(m) ?? 0) + amt);
    }
  }
  return map;
}

/** 스케줄 표 열(월)에 맞춘 내역 — 정기는 귀속월, 분기·노트는 지급월 (`welfareByScheduleDisplayMonth` 와 동일 기준) */
export type WelfareScheduleDisplayLine = { label: string; amount: number };

function eventLabelForScheduleRow(eventKey: string, customDefs: CustomPaymentEventDef[]): string {
  if (Object.prototype.hasOwnProperty.call(PAYMENT_EVENT_LABELS, eventKey)) {
    return PAYMENT_EVENT_LABELS[eventKey as PaymentEventKey];
  }
  return paymentEventLabel(eventKey, customDefs);
}

export function welfareScheduleLinesByMonth(
  br: MonthBreakdown[],
  noteExtrasByPaidMonth: ReadonlyMap<number, number> | undefined,
  customDefs: CustomPaymentEventDef[]
): Map<number, WelfareScheduleDisplayLine[]> {
  const byMonth = new Map<number, WelfareScheduleDisplayLine[]>();
  for (let m = 1; m <= 12; m++) {
    const lines: WelfareScheduleDisplayLine[] = [];
    const accrualRow = br.find((r) => r.accrualMonth === m);
    if (accrualRow) {
      for (const ev of accrualRow.regularEvents) {
        if (ev.amount === 0) continue;
        lines.push({
          label: eventLabelForScheduleRow(ev.eventKey, customDefs),
          amount: ev.amount,
        });
      }
    }
    for (const row of br) {
      if (row.paidMonth !== m) continue;
      for (const q of row.quarterly) {
        if (q.amount === 0) continue;
        const lab = Object.prototype.hasOwnProperty.call(QUARTERLY_ITEM_LABELS, q.itemKey)
          ? QUARTERLY_ITEM_LABELS[q.itemKey as QuarterlyItemKey]
          : q.itemKey;
        lines.push({ label: lab, amount: q.amount });
      }
    }
    const noteExtra = noteExtrasByPaidMonth?.get(m) ?? 0;
    if (noteExtra > 0) {
      lines.push({ label: "선택적 복지(월별 노트)", amount: noteExtra });
    }
    if (lines.length > 0) byMonth.set(m, lines);
  }
  return byMonth;
}

export function yearlyWelfareTotal(rows: MonthBreakdown[]): number {
  return rows.reduce((s, r) => s + r.totalWelfareMonth, 0);
}

/** 월별 노트에서 연간 추가액 (지급월 합산용과 동일하게 연도 필터) */
export function sumMonthlyNoteExtrasForYear(
  notes: Pick<{ year: number; optionalExtraAmount: number | null }, "year" | "optionalExtraAmount">[],
  year: number
): number {
  return notes
    .filter((n) => n.year === year)
    .reduce((s, n) => s + (n.optionalExtraAmount != null ? toNum(n.optionalExtraAmount) : 0), 0);
}

/**
 * 정기·분기 스케줄 + 해당 연도 월별 노트 추가액을 합산한 연간 사복 실적.
 * 스케줄 페이지·급여포함신고에서 동일 로직 사용.
 */
export function computeActualYearlyWelfareForEmployee(
  employee: Employee,
  year: number,
  foundingMonth: number,
  accrualCurrentMonthPayNext: boolean,
  rules: LevelPaymentRule[],
  overridesForEmployee: Level5Override[],
  quarterlyForEmployee: QuarterlyEmployeeConfig[],
  monthlyNotesForEmployee: Pick<
    { year: number; optionalExtraAmount: number | null },
    "year" | "optionalExtraAmount"
  >[],
  customPaymentEvents: CustomPaymentScheduleDef[] = []
): number {
  const br = buildMonthlyBreakdown(
    employee,
    year,
    foundingMonth,
    rules,
    overridesForEmployee,
    quarterlyForEmployee,
    accrualCurrentMonthPayNext,
    customPaymentEvents
  );
  return yearlyWelfareTotal(br) + sumMonthlyNoteExtrasForYear(monthlyNotesForEmployee, year);
}

/** 지급월(paidMonth)이 lastPaidMonthInclusive 이하인 스케줄 행만 합산 */
export function yearlyWelfareTotalThroughPaidMonth(
  rows: MonthBreakdown[],
  lastPaidMonthInclusive: number
): number {
  const m = Math.min(12, Math.max(0, lastPaidMonthInclusive));
  return rows.filter((r) => r.paidMonth <= m).reduce((s, r) => s + r.totalWelfareMonth, 0);
}

/** 월별 노트 추가액 — 해당 연도·지급월이 lastPaidMonthInclusive 이하만 */
export function sumMonthlyNoteExtrasThroughPaidMonth(
  notes: Pick<{ year: number; month: number; optionalExtraAmount: number | null }, "year" | "month" | "optionalExtraAmount">[],
  year: number,
  lastPaidMonthInclusive: number
): number {
  const m = Math.min(12, Math.max(0, lastPaidMonthInclusive));
  return notes
    .filter((n) => n.year === year && n.month >= 1 && n.month <= m)
    .reduce((s, n) => s + (n.optionalExtraAmount != null ? toNum(n.optionalExtraAmount) : 0), 0);
}

/**
 * 기준 연도·지급월 ~N월까지 누적 실지급(정기·분기 스케줄 + 선택 복지 노트).
 * N=12이면 연간 합과 동일.
 */
export function computeActualWelfareThroughPaidMonth(
  employee: Employee,
  year: number,
  foundingMonth: number,
  accrualCurrentMonthPayNext: boolean,
  rules: LevelPaymentRule[],
  overridesForEmployee: Level5Override[],
  quarterlyForEmployee: QuarterlyEmployeeConfig[],
  monthlyNotesForEmployee: Pick<
    { year: number; month: number; optionalExtraAmount: number | null },
    "year" | "month" | "optionalExtraAmount"
  >[],
  lastPaidMonthInclusive: number,
  customPaymentEvents: CustomPaymentScheduleDef[] = []
): number {
  const br = buildMonthlyBreakdown(
    employee,
    year,
    foundingMonth,
    rules,
    overridesForEmployee,
    quarterlyForEmployee,
    accrualCurrentMonthPayNext,
    customPaymentEvents
  );
  const through = Math.min(12, Math.max(1, lastPaidMonthInclusive));
  return (
    yearlyWelfareTotalThroughPaidMonth(br, through) +
    sumMonthlyNoteExtrasThroughPaidMonth(monthlyNotesForEmployee, year, through)
  );
}

