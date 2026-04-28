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

export type EmploymentRange = {
  /** 해당 연도에 활성인 시작 월(포함) */
  fromMonth: number;
  /** 해당 연도에 활성인 끝 월(포함) */
  toMonth: number;
};

export type EmployeeStatusForYear =
  | { kind: "ACTIVE_FULL_YEAR" }
  | { kind: "ACTIVE_PARTIAL"; range: EmploymentRange }
  | { kind: "AFTER_RESIGN"; resignYear: number; resignMonth: number | null };

/**
 * 활성 연도(year) 기준 직원의 활성 월 범위를 결정한다.
 *
 * 규칙(하위 호환):
 *   - resignYear 가 없으면 → 전체 연도 활성(입사 시점은 매년 hireMonth 에 입사축하 발생만 사용, 활성 범위와는 무관)
 *   - 활성 연도 > resignYear → 퇴사 후(AFTER_RESIGN), 스케줄 0
 *   - 활성 연도 == resignYear → resignMonth(있으면) 까지만 활성, 없으면 12월까지
 *   - resignMonth 만 있고 resignYear 가 없으면 → 무시(연도가 명시되어야 적용. 옛 데이터의 단일 월 입력이 영원히 잘리는 사고 방지)
 */
export function employeeStatusForYear(
  employee: Pick<Employee, "resignYear" | "resignMonth">,
  year: number,
): EmployeeStatusForYear {
  const resignY = employee.resignYear ?? null;

  if (resignY != null && year > resignY) {
    return { kind: "AFTER_RESIGN", resignYear: resignY, resignMonth: employee.resignMonth ?? null };
  }

  let to = 12;
  let partial = false;

  if (resignY != null && year === resignY && employee.resignMonth != null) {
    const m = Math.round(Number(employee.resignMonth));
    if (Number.isFinite(m) && m >= 1 && m <= 12 && m < 12) {
      to = m;
      partial = true;
    }
  }

  return partial ? { kind: "ACTIVE_PARTIAL", range: { fromMonth: 1, toMonth: to } } : { kind: "ACTIVE_FULL_YEAR" };
}

/** 활성 연도에 직원이 “전혀 활성이 아니다(0원)”인지 한 줄로 확인 */
export function employeeIsInactiveForYear(
  employee: Pick<Employee, "resignYear" | "resignMonth">,
  year: number,
): boolean {
  const s = employeeStatusForYear(employee, year);
  return s.kind === "AFTER_RESIGN";
}

/** 특정 월이 활성 범위 안인지 — 정기/분기/노트 적용 시 공통으로 사용 */
function monthIsActive(status: EmployeeStatusForYear, month: number): boolean {
  if (status.kind === "ACTIVE_FULL_YEAR") return true;
  if (status.kind === "ACTIVE_PARTIAL") {
    return month >= status.range.fromMonth && month <= status.range.toMonth;
  }
  return false;
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
  customPaymentEvents: CustomPaymentScheduleDef[] = [],
  /**
   * 내장 4종 이벤트(NEW_YEAR_FEB / FAMILY_MAY / CHUSEOK_AUG / YEAR_END_NOV)의 귀속 월 오버라이드.
   * 키가 빠진 이벤트는 코드 기본값(`FIXED_EVENT_MONTH`)을 사용한다. 빈 객체나 미전달이면 100% 기본값.
   */
  fixedEventMonthsOverride: Partial<Record<PaymentEventKey, number>> = {},
): string[] {
  const keys: string[] = [];
  (Object.keys(FIXED_EVENT_MONTH) as PaymentEventKey[]).forEach((k) => {
    const overridden = fixedEventMonthsOverride[k];
    const m =
      overridden != null && Number.isFinite(overridden) && overridden >= 1 && overridden <= 12
        ? Math.round(Number(overridden))
        : FIXED_EVENT_MONTH[k];
    if (m === month) keys.push(k);
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

/**
 * 월별 노트 오버라이드 — 중도 재분배(Mid-year Rebalance) 및 월별 개별 수정 공용.
 * 귀속월(accrualMonth) 기준으로 키를 구성한다.
 *
 * - `levelOverride`: 해당 월 이벤트 금액을 다른 레벨로 해석 (Level 5 override 매칭도 포함).
 * - `welfareOverrideAmount`: 해당 행의 `totalWelfareMonth`(정기+분기 합)를 강제로 이 값으로 치환.
 *   `regularEvents`/`quarterly` 배열은 디버깅·legal-category 분류를 위해 원본(규칙 기반) 값을 유지하되 합계만 교체.
 * - `eventAmountOverrides`: 개별 이벤트/분기 항목의 금액을 eventKey·itemKey 단위로 override.
 *   적용 우선순위: 정기/커스텀 이벤트 → `eventAmountOverrides[eventKey]` 가 있으면 사용.
 *                 분기 → `eventAmountOverrides[itemKey]` 가 있으면 사용.
 *   `welfareOverrideAmount` 가 같이 있으면 총액은 그 값이 최종 (개별 override 는 표시·감사용).
 */
export type MonthlyOverrideEntry = {
  levelOverride?: number | null;
  welfareOverrideAmount?: number | null;
  eventAmountOverrides?: Readonly<Record<string, number>> | null;
};

function pickLevelOverride(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
}

function pickWelfareOverride(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function pickEventOverride(
  map: Readonly<Record<string, number>> | null | undefined,
  key: string,
): number | null {
  if (!map) return null;
  if (!Object.prototype.hasOwnProperty.call(map, key)) return null;
  const v = map[key];
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

export function buildMonthlyBreakdown(
  employee: Employee,
  year: number,
  foundingMonth: number,
  rules: LevelPaymentRule[],
  overrides: Level5Override[],
  quarterly: QuarterlyEmployeeConfig[],
  accrualCurrentMonthPayNext: boolean,
  customPaymentEvents: CustomPaymentScheduleDef[] = [],
  /** 내장 정기 4종 귀속월 업체 오버라이드. 미전달이면 코드 기본값(2/5/8/11). */
  fixedEventMonthsOverride: Partial<Record<PaymentEventKey, number>> = {},
  /**
   * 월별 노트 오버라이드(귀속월 기준). 중도 재분배 시 저장된 스냅샷·새 규칙 값을 주입한다.
   * 미전달이면 종전 동작(규칙 기반 계산)과 100% 동일.
   */
  notesByAccrualMonth?: ReadonlyMap<number, MonthlyOverrideEntry>,
): MonthBreakdown[] {
  const status = employeeStatusForYear(employee, year);

  const qByPaidMonth = new Map<number, { itemKey: string; amount: number }[]>();
  for (const q of quarterly) {
    if (q.year !== year) continue;
    const months = q.paymentMonths.length > 0 ? q.paymentMonths : [];
    for (const m of months) {
      if (m < 1 || m > 12) continue;
      /** 분기 지원도 활성 월 범위 안에 있을 때만 반영 (지급월 기준) */
      if (!monthIsActive(status, m)) continue;
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

    /**
     * 정기 이벤트는 **귀속월·지급월이 모두 활성 범위 안**일 때만 발생한다.
     *
     * - “당월 귀속·익월 지급”(`accrualCurrentMonthPayNext=true`) 모드에서는 귀속이 활성 범위에 들어가도
     *   지급월이 퇴사월 다음 달로 밀릴 수 있다. 이 경우 사내 규칙상 “퇴사월 당월까지만 지급, 그 이후
     *   지급하지 않음”에 따라 **그 월의 정기 지급은 발생하지 않는다**.
     * - 동월 귀속·동월 지급 모드에서는 두 값이 같아 기존 동작과 동일하다.
     * - 12월 귀속·1월 지급(롤백) 케이스는 12월이 비활성이면 이미 귀속에서 걸러지므로 영향이 없다.
     */
    const accrualActive = monthIsActive(status, accrualMonth);
    const paidActive = monthIsActive(status, paidMonth);
    const eventKeys = accrualActive && paidActive
      ? eventsOccurringInMonth(accrualMonth, employee, foundingMonth, customPaymentEvents, fixedEventMonthsOverride)
      : [];
    const noteOverride = notesByAccrualMonth?.get(accrualMonth);
    const levelOverride = pickLevelOverride(noteOverride?.levelOverride ?? null);
    const levelResolveTarget: Pick<Employee, "level"> = levelOverride != null
      ? { level: levelOverride }
      : employee;
    /**
     * 정기·커스텀 이벤트는 귀속월 기준 note 의 `eventAmountOverrides[eventKey]` 를 우선 적용.
     * 분기 항목은 지급월 기준 note 의 `eventAmountOverrides[itemKey]` 를 우선 적용.
     */
    const eventOverridesAccrual = noteOverride?.eventAmountOverrides ?? null;
    const eventOverridesPaid = notesByAccrualMonth?.get(paidMonth)?.eventAmountOverrides ?? null;
    const regularEvents = eventKeys.map((eventKey) => {
      const ov = pickEventOverride(eventOverridesAccrual, eventKey);
      const amount =
        ov != null ? ov : resolveEventAmount(levelResolveTarget, eventKey, year, rules, overrides);
      return { eventKey, amount };
    });
    const quarterlyRaw = qByPaidMonth.get(paidMonth) ?? [];
    const quarterlyAtPaidMonth = quarterlyRaw.map((q) => {
      const ov = pickEventOverride(eventOverridesPaid, q.itemKey);
      return { itemKey: q.itemKey, amount: ov != null ? ov : q.amount };
    });

    /**
     * "금액 안 쓰여있는 월"(자연 발생하지 않는 월) 에도 override 를 통해 항목을 추가할 수 있게 지원.
     *
     * `eventAmountOverrides` 에 들어 있는 키 중, 위에서 이미 처리된 것들 외에 새로 등장한 키를 합류시킨다.
     *   - 직원의 분기 config 에 있는 itemKey → `quarterlyAtPaidMonth` 로(= paidMonth 의 override 를 본다)
     *   - 그 외 유효한 이벤트 키 → `regularEvents` 로(= accrualMonth 의 override 를 본다)
     *
     * 서버 액션(`EMPLOYEE_MONTHLY_EDIT`) 이 사전에 허용된 eventKey/itemKey 만 통과시키므로
     * 여기서는 직원의 분기 config 여부만으로 분기/정기를 구분해도 안전하다.
     */
    const employeeQuarterlyItemKeys = new Set(
      quarterly.filter((q) => q.year === year).map((q) => q.itemKey),
    );
    if (eventOverridesAccrual) {
      const seen = new Set(regularEvents.map((r) => r.eventKey));
      for (const [eventKey, rawAmount] of Object.entries(eventOverridesAccrual)) {
        if (seen.has(eventKey)) continue;
        if (employeeQuarterlyItemKeys.has(eventKey)) continue;
        const amt = pickEventOverride({ [eventKey]: rawAmount }, eventKey);
        if (amt == null) continue;
        regularEvents.push({ eventKey, amount: amt });
        seen.add(eventKey);
      }
    }
    if (eventOverridesPaid) {
      const seen = new Set(quarterlyAtPaidMonth.map((q) => q.itemKey));
      for (const [itemKey, rawAmount] of Object.entries(eventOverridesPaid)) {
        if (seen.has(itemKey)) continue;
        if (!employeeQuarterlyItemKeys.has(itemKey)) continue;
        const amt = pickEventOverride({ [itemKey]: rawAmount }, itemKey);
        if (amt == null) continue;
        quarterlyAtPaidMonth.push({ itemKey, amount: amt });
        seen.add(itemKey);
      }
    }
    const totalRegular = regularEvents.reduce((s, e) => s + e.amount, 0);
    const totalQ = quarterlyAtPaidMonth.reduce((s, e) => s + e.amount, 0);
    const naturalTotal = totalRegular + totalQ;
    const overrideAmt = pickWelfareOverride(noteOverride?.welfareOverrideAmount ?? null);
    const effectiveTotal = overrideAmt != null ? overrideAmt : naturalTotal;
    months.push({
      accrualMonth,
      paidMonth,
      regularEvents,
      quarterly: quarterlyAtPaidMonth,
      totalWelfareMonth: effectiveTotal,
    });
  }
  return months;
}

/** 월별 노트 배열을 귀속월 키 Map 으로 변환 (buildMonthlyBreakdown/display 함수 입력용). */
export function monthlyOverrideMapFromNotes(
  notes: ReadonlyArray<{
    year: number;
    month: number;
    levelOverride?: number | null;
    welfareOverrideAmount?: number | null;
    eventAmountOverrides?: Readonly<Record<string, number>> | null;
  }>,
  year: number,
): Map<number, MonthlyOverrideEntry> {
  const map = new Map<number, MonthlyOverrideEntry>();
  for (const n of notes) {
    if (n.year !== year) continue;
    const m = Math.round(Number(n.month));
    if (!Number.isFinite(m) || m < 1 || m > 12) continue;
    const prev = map.get(m) ?? {};
    /**
     * 같은 월의 여러 노트가 있을 수는 없지만(upsert), 혹시 중복 행이 있으면
     * 먼저 만난 non-null 값을 우선하도록 merge 한다.
     */
    const mergedEvents: Record<string, number> | null =
      n.eventAmountOverrides && Object.keys(n.eventAmountOverrides).length > 0
        ? { ...(prev.eventAmountOverrides ?? {}), ...n.eventAmountOverrides }
        : (prev.eventAmountOverrides ?? null);
    map.set(m, {
      levelOverride: n.levelOverride ?? prev.levelOverride ?? null,
      welfareOverrideAmount: n.welfareOverrideAmount ?? prev.welfareOverrideAmount ?? null,
      eventAmountOverrides: mergedEvents,
    });
  }
  return map;
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
type QuarterlyRateShape = {
  level: number;
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
};

/**
 * 레벨별 요율 배열에서 적용할 요율을 선택한다.
 * - `employeeLevel`에 맞는 레벨별 요율(level > 0)이 있으면 우선 사용
 * - 없으면 공통 요율(level === 0)으로 fallback
 */
export function resolveQuarterlyRate(
  rates: QuarterlyRateShape[],
  employeeLevel: number
): QuarterlyRateShape | null {
  return (
    rates.find((r) => r.level === employeeLevel) ??
    rates.find((r) => r.level === 0) ??
    null
  );
}

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
  ratesOrRate: QuarterlyRateShape[] | QuarterlyRateShape | null,
  employeeLevel = 0
): number {
  const rate = Array.isArray(ratesOrRate)
    ? resolveQuarterlyRate(ratesOrRate, employeeLevel)
    : ratesOrRate;
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

/**
 * 단일 "월 조정급여" (모든 월 동일 가정). 월별 노트에 중도 재분배 오버라이드가 있는 경우에는
 * `resolveEffectiveAdjustedSalaryForMonth` 를 월별로 호출해야 정확하다 — 이 함수는 요약 표시용.
 */
export function monthlySalaryPortion(employee: Pick<Employee, "adjustedSalary" | "baseSalary">): number {
  const base = toNum(employee.adjustedSalary) > 0 ? toNum(employee.adjustedSalary) : toNum(employee.baseSalary);
  return Math.round(base / 12);
}

/**
 * 적용 연봉(원/년): 조정급여가 있으면 조정, 없으면 기존연봉.
 *
 * 월별 노트에 `adjustedSalaryOverrideAmount` 가 단 하나라도 있으면 월별 합으로 재계산되어야
 * 하므로 호출자는 `computeYearlyAdjustedSalaryFromNotes` 를 직접 사용해야 한다.
 */
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
 *
 * `welfareOverrideByAccrualMonth`(중도 재분배 스냅샷/오버라이드)가 주어지면 해당 귀속월 행은
 * 정기·분기를 합산하지 않고 오버라이드 값을 귀속월 열에 한 번에 기재한다. 이 경우 그 행의
 * `totalWelfareMonth` 와 컬럼 합이 일치한다.
 */
export function welfareByScheduleDisplayMonth(
  br: MonthBreakdown[],
  noteExtrasByPaidMonth?: ReadonlyMap<number, number>,
  welfareOverrideByAccrualMonth?: ReadonlyMap<number, number>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of br) {
    const ovr = welfareOverrideByAccrualMonth?.get(row.accrualMonth);
    if (ovr != null && Number.isFinite(ovr)) {
      if (ovr !== 0) {
        map.set(row.accrualMonth, (map.get(row.accrualMonth) ?? 0) + ovr);
      }
      continue;
    }
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
export type WelfareScheduleDisplayLine = {
  label: string;
  amount: number;
  /** 출처 — UI 에서 “정기/분기/선택 복지”를 색상·뱃지로 구분하기 위함 */
  kind: "regular" | "quarterly" | "note";
};

function eventLabelForScheduleRow(eventKey: string, customDefs: CustomPaymentEventDef[]): string {
  if (Object.prototype.hasOwnProperty.call(PAYMENT_EVENT_LABELS, eventKey)) {
    return PAYMENT_EVENT_LABELS[eventKey as PaymentEventKey];
  }
  return paymentEventLabel(eventKey, customDefs);
}

export function welfareScheduleLinesByMonth(
  br: MonthBreakdown[],
  noteExtrasByPaidMonth: ReadonlyMap<number, number> | undefined,
  customDefs: CustomPaymentEventDef[],
  welfareOverrideByAccrualMonth?: ReadonlyMap<number, number>,
): Map<number, WelfareScheduleDisplayLine[]> {
  const byMonth = new Map<number, WelfareScheduleDisplayLine[]>();
  const overrideMonths = new Set<number>();
  for (let m = 1; m <= 12; m++) {
    const lines: WelfareScheduleDisplayLine[] = [];
    const accrualRow = br.find((r) => r.accrualMonth === m);
    const ovr = welfareOverrideByAccrualMonth?.get(m);
    const hasOverride = ovr != null && Number.isFinite(ovr);
    if (hasOverride) {
      overrideMonths.add(m);
      if (ovr !== 0) {
        lines.push({
          label: "중도 재분배 반영",
          amount: Number(ovr),
          kind: "regular",
        });
      }
    } else if (accrualRow) {
      for (const ev of accrualRow.regularEvents) {
        if (ev.amount === 0) continue;
        lines.push({
          label: eventLabelForScheduleRow(ev.eventKey, customDefs),
          amount: ev.amount,
          kind: "regular",
        });
      }
    }
    if (!hasOverride) {
      for (const row of br) {
        if (row.paidMonth !== m) continue;
        if (overrideMonths.has(row.accrualMonth)) continue;
        for (const q of row.quarterly) {
          if (q.amount === 0) continue;
          const lab = Object.prototype.hasOwnProperty.call(QUARTERLY_ITEM_LABELS, q.itemKey)
            ? QUARTERLY_ITEM_LABELS[q.itemKey as QuarterlyItemKey]
            : q.itemKey;
          lines.push({ label: lab, amount: q.amount, kind: "quarterly" });
        }
      }
    }
    const noteExtra = noteExtrasByPaidMonth?.get(m) ?? 0;
    if (noteExtra > 0) {
      lines.push({ label: "선택적 복지(월별 노트)", amount: noteExtra, kind: "note" });
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
  notes: ReadonlyArray<{
    year: number;
    month?: number;
    optionalExtraAmount: number | null;
  }>,
  year: number,
  /** 직원 활성 범위 — 주어지면 범위 밖 월 노트는 합산에서 제외 */
  status?: EmployeeStatusForYear,
): number {
  return notes
    .filter((n) => n.year === year)
    .filter((n) => {
      if (!status) return true;
      const m = n.month;
      if (m == null) return true; /** month 가 없는 레거시 형태는 그대로 합산 */
      return monthIsActive(status, m);
    })
    .reduce((s, n) => s + (n.optionalExtraAmount != null ? toNum(n.optionalExtraAmount) : 0), 0);
}

/**
 * 정기·분기 스케줄 + 해당 연도 월별 노트 추가액을 합산한 연간 사복 실적.
 * 스케줄 페이지·급여포함신고에서 동일 로직 사용.
 *
 * 월별 노트에 중도 재분배 오버라이드(`welfareOverrideAmount`·`levelOverride`)가 있으면
 * `buildMonthlyBreakdown` 단계에서 자동으로 반영된다. 호출자는 풀 `MonthlyEmployeeNote[]` 를 넘기면 된다.
 */
export function computeActualYearlyWelfareForEmployee(
  employee: Employee,
  year: number,
  foundingMonth: number,
  accrualCurrentMonthPayNext: boolean,
  rules: LevelPaymentRule[],
  overridesForEmployee: Level5Override[],
  quarterlyForEmployee: QuarterlyEmployeeConfig[],
  monthlyNotesForEmployee: ReadonlyArray<{
    year: number;
    month?: number;
    optionalExtraAmount: number | null;
    levelOverride?: number | null;
    welfareOverrideAmount?: number | null;
  }>,
  customPaymentEvents: CustomPaymentScheduleDef[] = [],
  fixedEventMonthsOverride: Partial<Record<PaymentEventKey, number>> = {},
): number {
  const overrideMap = monthlyOverrideMapFromNotes(
    monthlyNotesForEmployee
      .filter((n): n is typeof n & { month: number } => typeof n.month === "number"),
    year,
  );
  const br = buildMonthlyBreakdown(
    employee,
    year,
    foundingMonth,
    rules,
    overridesForEmployee,
    quarterlyForEmployee,
    accrualCurrentMonthPayNext,
    customPaymentEvents,
    fixedEventMonthsOverride,
    overrideMap,
  );
  const status = employeeStatusForYear(employee, year);
  return yearlyWelfareTotal(br) + sumMonthlyNoteExtrasForYear(monthlyNotesForEmployee, year, status);
}

/** 지급월(paidMonth)이 lastPaidMonthInclusive 이하인 스케줄 행만 합산 */
export function yearlyWelfareTotalThroughPaidMonth(
  rows: MonthBreakdown[],
  lastPaidMonthInclusive: number
): number {
  const m = Math.min(12, Math.max(0, lastPaidMonthInclusive));
  return rows.filter((r) => r.paidMonth <= m).reduce((s, r) => s + r.totalWelfareMonth, 0);
}

/** 월별 노트 추가액 — 해당 연도·지급월이 lastPaidMonthInclusive 이하만, 활성 범위 안에서만 */
export function sumMonthlyNoteExtrasThroughPaidMonth(
  notes: ReadonlyArray<{
    year: number;
    month: number;
    optionalExtraAmount: number | null;
  }>,
  year: number,
  lastPaidMonthInclusive: number,
  status?: EmployeeStatusForYear,
): number {
  const m = Math.min(12, Math.max(0, lastPaidMonthInclusive));
  return notes
    .filter((n) => n.year === year && n.month >= 1 && n.month <= m)
    .filter((n) => (status ? monthIsActive(status, n.month) : true))
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
  monthlyNotesForEmployee: ReadonlyArray<{
    year: number;
    month: number;
    optionalExtraAmount: number | null;
    levelOverride?: number | null;
    welfareOverrideAmount?: number | null;
  }>,
  lastPaidMonthInclusive: number,
  customPaymentEvents: CustomPaymentScheduleDef[] = [],
  fixedEventMonthsOverride: Partial<Record<PaymentEventKey, number>> = {},
): number {
  const overrideMap = monthlyOverrideMapFromNotes(monthlyNotesForEmployee, year);
  const br = buildMonthlyBreakdown(
    employee,
    year,
    foundingMonth,
    rules,
    overridesForEmployee,
    quarterlyForEmployee,
    accrualCurrentMonthPayNext,
    customPaymentEvents,
    fixedEventMonthsOverride,
    overrideMap,
  );
  const through = Math.min(12, Math.max(1, lastPaidMonthInclusive));
  const status = employeeStatusForYear(employee, year);
  return (
    yearlyWelfareTotalThroughPaidMonth(br, through) +
    sumMonthlyNoteExtrasThroughPaidMonth(monthlyNotesForEmployee, year, through, status)
  );
}

