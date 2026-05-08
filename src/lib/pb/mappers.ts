import { parseSalaryInclusionVarianceMode, parseSalaryInclusionVarianceModeOrNull } from "@/lib/domain/salary-inclusion-display";
import type {
  BaseAssetAnnual,
  BizResultAnnual,
  BizResultItem,
  CompanySettings,
  ContribUsageAnnual,
  CustomPaymentEventDef,
  Employee,
  FundOperationAnnual,
  FundSourceAnnual,
  Level5Override,
  LevelPaymentRule,
  LevelTarget,
  MonthlyEmployeeNote,
  MonthlyPaymentStatus,
  PaymentEventDefsByYear,
  QuarterlyEmployeeConfig,
  QuarterlyRate,
  RealEstateHolding,
} from "@/types/models";

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === null || v === undefined) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "" || s === "false" || s === "0" || s === "n" || s === "no") return false;
    if (s === "true" || s === "1" || s === "y" || s === "yes") return true;
  }
  return Boolean(v);
}

/**
 * 월/연도/일 같은 ordinal 필드 정규화. 빈 값·null·0 은 모두 "미입력(=null)" 으로 본다.
 * - PB number 컬럼 default 가 0 으로 잡히는 환경에서 0 이 도메인에 새어 들어가면
 *   "1900 년에 퇴사한 직원" 처럼 해석되는 사고가 난다.
 */
function ordinalOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export function mapEmployee(r: Record<string, unknown>): Employee {
  return {
  id: String(r.id),
  tenantId: String(r.tenantId),
  employeeCode: String(r.employeeCode ?? ""),
  name: String(r.name ?? ""),
  position: String(r.position ?? ""),
  baseSalary: num(r.baseSalary),
  adjustedSalary: num(r.adjustedSalary),
  welfareAllocation: num(r.welfareAllocation),
  priorOverpaidWelfareWon: numNull(r.priorOverpaidWelfareWon),
  incentiveAmount: numNull(r.incentiveAmount),
  discretionaryAmount: numNull(r.discretionaryAmount),
  optionalWelfareAmount: numNull(r.optionalWelfareAmount),
  monthlyPayAmount: numNull(r.monthlyPayAmount),
  quarterlyPayAmount: numNull(r.quarterlyPayAmount),
  /**
   * 월/연도/일 같은 ordinal 필드는 0 도 null 로 매핑한다.
   * - PocketBase 에 새 number 컬럼을 추가하면 기존 행이 NULL 이 아닌 0 으로 채워지는 환경이 있어,
   *   `resignYear=0` 인 채로 도메인에 들어가면 `year > resignY` 가 항상 참이 되어
   *   모든 기존 직원이 AFTER_RESIGN 으로 보이는 사고가 난다(2026-05 사용자 보고).
   * - 0월/0년/0일은 도메인적으로 의미 없으므로 손실 없이 null 로 정규화한다.
   * - 금액 필드(0원이 의미 있는 값)는 numNull/num 그대로 유지.
   */
  birthMonth: ordinalOrNull(r.birthMonth),
  hireMonth: ordinalOrNull(r.hireMonth),
  resignMonth: ordinalOrNull(r.resignMonth),
  resignYear: ordinalOrNull(r.resignYear),
  weddingMonth: ordinalOrNull(r.weddingMonth),
  childrenInfant: num(r.childrenInfant),
  childrenPreschool: num(r.childrenPreschool),
  childrenTeen: num(r.childrenTeen),
  parentsCount: num(r.parentsCount),
  parentsInLawCount: num(r.parentsInLawCount),
  insurancePremium: num(r.insurancePremium),
  loanInterest: num(r.loanInterest),
  monthlyRentAmount: numNull(r.monthlyRentAmount),
  payDay: ordinalOrNull(r.payDay),
  level: num(r.level, 1),
  expectedYearlyWelfare: numNull(r.expectedYearlyWelfare),
  flagAutoAmount: bool(r.flagAutoAmount),
  flagRepReturn: bool(r.flagRepReturn),
  flagSpouseReceipt: bool(r.flagSpouseReceipt),
  flagWorkerNet: bool(r.flagWorkerNet),
  /** PB 컬럼이 없거나 빈 값이면 false — 기존 데이터 모두 ‘사복 대상’ 으로 안전 fallback. */
  flagWelfareIneligible: bool(r.flagWelfareIneligible),
  /**
   * 퇴사월 사복 지급 토글 — PB 컬럼이 없거나 빈 값이면 false.
   * 기본 false 라 기존 퇴사 직원도 ‘퇴사월 사복 지급 안 함’ 으로 자동 정렬되며,
   * 필요한 직원만 사용자가 직접 체크해 사복을 지급한다.
   */
  flagPayWelfareOnResignMonth: bool(r.flagPayWelfareOnResignMonth),
  salaryInclusionVarianceMode: parseSalaryInclusionVarianceModeOrNull(r.salaryInclusionVarianceMode),
  };
}

export function mapLevelRule(r: Record<string, unknown>): LevelPaymentRule {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    level: num(r.level),
    eventKey: String(r.eventKey),
    amount: num(r.amount),
  };
}

export function mapLevel5Override(r: Record<string, unknown>): Level5Override {
  return {
    id: String(r.id),
    employeeId: String(r.employeeId),
    year: num(r.year),
    eventKey: String(r.eventKey),
    amount: num(r.amount),
  };
}

export function mapLevelTarget(r: Record<string, unknown>): LevelTarget {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    level: num(r.level),
    targetAmount: num(r.targetAmount),
  };
}

export function mapQuarterlyRate(r: Record<string, unknown>): QuarterlyRate {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    level: num(r.level, 0),
    itemKey: String(r.itemKey),
    amountPerInfant: numNull(r.amountPerInfant),
    amountPerPreschool: numNull(r.amountPerPreschool),
    amountPerTeen: numNull(r.amountPerTeen),
    amountPerParent: numNull(r.amountPerParent),
    amountPerInLaw: numNull(r.amountPerInLaw),
    flatAmount: numNull(r.flatAmount),
    percentInsurance: numNull(r.percentInsurance),
    percentLoanInterest: numNull(r.percentLoanInterest),
  };
}

function parsePaymentMonthsField(r: Record<string, unknown>, legacyMonth: number): number[] {
  const raw = r.paymentMonths;
  const pushValid = (arr: number[]) => {
    const s = new Set<number>();
    for (const x of arr) {
      const n = Math.round(Number(x));
      if (n >= 1 && n <= 12) s.add(n);
    }
    return [...s].sort((a, b) => a - b);
  };
  if (Array.isArray(raw)) {
    const out = pushValid(raw as number[]);
    if (out.length > 0) return out;
  }
  if (raw != null && typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) {
        const out = pushValid(j as number[]);
        if (out.length > 0) return out;
      }
    } catch {
      const out = pushValid(
        raw
          .split(/[,\s]+/)
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n))
      );
      if (out.length > 0) return out;
    }
  }
  return legacyMonth >= 1 && legacyMonth <= 12 ? [legacyMonth] : [];
}

export function mapQuarterlyCfg(r: Record<string, unknown>): QuarterlyEmployeeConfig {
  const legacy = num(r.paymentMonth);
  return {
    id: String(r.id),
    employeeId: String(r.employeeId),
    year: num(r.year),
    itemKey: String(r.itemKey),
    paymentMonths: parsePaymentMonthsField(r, legacy),
    amount: num(r.amount),
  };
}

export function mapMonthlyNote(r: Record<string, unknown>): MonthlyEmployeeNote {
  return {
    id: String(r.id),
    employeeId: String(r.employeeId),
    year: num(r.year),
    month: num(r.month),
    optionalWelfareText:
      r.optionalWelfareText === null || r.optionalWelfareText === undefined
        ? null
        : String(r.optionalWelfareText),
    optionalExtraAmount: numNull(r.optionalExtraAmount),
    incentiveAccrualAmount: numNull(r.incentiveAccrualAmount),
    incentiveWelfarePaymentAmount: numNull(r.incentiveWelfarePaymentAmount),
    welfareOverrideAmount: numNull(r.welfareOverrideAmount),
    adjustedSalaryOverrideAmount: numNull(r.adjustedSalaryOverrideAmount),
    levelOverride: (() => {
      const v = numNull(r.levelOverride);
      if (v === null) return null;
      const lv = Math.round(v);
      return lv >= 1 && lv <= 5 ? lv : null;
    })(),
    eventAmountOverrides: (() => {
      const raw = r.eventAmountOverridesJson;
      if (raw == null || raw === "") return null;
      /**
       * PB JSON 필드는 객체로도, 문자열로도 올 수 있어 양쪽을 방어한다.
       * 파싱 실패·비객체·빈 객체는 모두 null 로 정규화해 호출부 분기를 단순화.
       */
      let parsed: unknown = raw;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return null;
        }
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        out[k] = Math.max(0, Math.round(n));
      }
      return Object.keys(out).length > 0 ? out : null;
    })(),
  };
}

export function mapMonthlyPaymentStatus(r: Record<string, unknown>): MonthlyPaymentStatus {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    month: num(r.month),
    paidConfirmed: bool(r.paidConfirmed),
  };
}

function parsePaymentEventDefs(v: unknown): PaymentEventDefsByYear | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: PaymentEventDefsByYear = {};
  for (const [yk, arr] of Object.entries(o)) {
    if (!Array.isArray(arr)) continue;
    const list: CustomPaymentEventDef[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const eventKey = String(rec.eventKey ?? "").trim();
      const label = String(rec.label ?? "").trim();
      const accrualMonth = num(rec.accrualMonth, 0);
      if (!eventKey || !label || accrualMonth < 1 || accrualMonth > 12) continue;
      list.push({ eventKey, label, accrualMonth });
    }
    if (list.length) out[yk] = list;
  }
  return Object.keys(out).length ? out : null;
}

function textOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * 내장 정기 지급 4종의 귀속 월 오버라이드.
 * - 입력은 plain object, JSON 문자열, null/undefined 모두 허용.
 * - 키는 NEW_YEAR_FEB / FAMILY_MAY / CHUSEOK_AUG / YEAR_END_NOV 만 받아들임(타이포·미지원 키는 무시).
 * - 값은 1~12 정수만 통과. 그 외는 무시.
 * - 결과가 비면 null.
 */
const ALLOWED_FIXED_EVENT_KEYS = new Set([
  "NEW_YEAR_FEB",
  "FAMILY_MAY",
  "CHUSEOK_AUG",
  "YEAR_END_NOV",
]);
function parseFixedEventMonths(v: unknown): Partial<Record<string, number>> | null {
  let raw: unknown = v;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      raw = JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Partial<Record<string, number>> = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_FIXED_EVENT_KEYS.has(k)) continue;
    const n = Math.round(Number(val));
    if (Number.isFinite(n) && n >= 1 && n <= 12) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function mapCompanySettings(r: Record<string, unknown>): CompanySettings {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    foundingMonth: num(r.foundingMonth, 1),
    defaultPayDay: num(r.defaultPayDay, 25),
    activeYear: num(r.activeYear, new Date().getFullYear()),
    salaryInclusionVarianceMode: parseSalaryInclusionVarianceMode(r.salaryInclusionVarianceMode),
    surveyShowRepReturn: bool(r.surveyShowRepReturn),
    surveyShowSpouseReceipt: bool(r.surveyShowSpouseReceipt),
    surveyShowWorkerNet: bool(r.surveyShowWorkerNet),
    paymentEventDefs: parsePaymentEventDefs(r.paymentEventDefs),
    reserveProgressNote: textOrNull(r.reserveProgressNote),
    fixedEventMonths: parseFixedEventMonths(r.fixedEventMonths),
    quarterlyPayMonths: parseQuarterlyPayMonths(r.quarterlyPayMonths),
    repReturnSchedule: parseRepReturnSchedule(r.repReturnSchedule),
    spouseReceiptSchedule: parseSpouseReceiptSchedule(r.spouseReceiptSchedule),
    discretionarySchedule: parseDiscretionarySchedule(r.discretionarySchedule),
    customReturnsSchedule: parseCustomReturnsSchedule(r.customReturnsSchedule),
    vendorWelfareApplied: parseVendorWelfareApplied(r.vendorWelfareApplied),
    vendorWelfareRatio: parseVendorWelfareRatio(r.vendorWelfareRatio),
    incentiveNetRatioPercent: parseIncentiveNetRatioPercent(r.incentiveNetRatioPercent),
    feeRatePercent: parseFeeRatePercent(r.feeRatePercent),
    feeBillingMode: parseFeeBillingMode(r.feeBillingMode),
    feeRateBreakpoints: parseFeeRateBreakpoints(r.feeRateBreakpoints),
  };
}

/**
 * 「수수료 변경점」 배열 파싱 — JSON 문자열 / plain array / null 모두 허용.
 * - 항목 형식: `{ fromMonth: 1..12, ratePercent: 0.1..100 }`
 * - fromMonth 같은 항목이 여럿이면 마지막 입력만 유지(나중 입력 = 사용자 의도).
 * - fromMonth 오름차순 정렬. 결과가 비면 null(폴백 단일 요율 사용 의미).
 */
function parseFeeRateBreakpoints(v: unknown): import("@/types/models").FeeRateBreakpoint[] | null {
  let raw: unknown = v;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      raw = JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  const dedup = new Map<number, import("@/types/models").FeeRateBreakpoint>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const fm = Math.round(Number(obj.fromMonth));
    const r = Number(obj.ratePercent);
    if (!Number.isFinite(fm) || fm < 1 || fm > 12) continue;
    if (!Number.isFinite(r) || r <= 0 || r > 100) continue;
    const rate = Math.round(r * 10) / 10;
    dedup.set(fm, { fromMonth: fm, ratePercent: rate });
  }
  if (dedup.size === 0) return null;
  return [...dedup.values()].sort((a, b) => a.fromMonth - b.fromMonth);
}

/**
 * 사복기금 운영 수수료 요율(%) 파싱.
 * 1~100 정수만 허용. 그 외는 null → 호출 시 거래처 구분(개인 10 / 법인 2) 디폴트로 폴백.
 */
function parseFeeRatePercent(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  /** 소수점 1자리까지 반올림 — 운영자가 「2.5%」 같은 값을 쓸 수 있도록. */
  const r = Math.round(n * 10) / 10;
  if (r < 0.1 || r > 100) return null;
  return r;
}

function parseFeeBillingMode(v: unknown): import("@/types/models").FeeBillingMode {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s === "ON_PAY_MONTH") return "ON_PAY_MONTH";
  return "EVEN_12";
}

/**
 * 「+ 반환 추가」 카테고리 배열 파싱.
 * 상위 wrapper 는 `{ categories: [...] }` 또는 곧장 배열 형식 모두 허용(graceful).
 * 각 항목은 `{ key, label, byEmployeeMonth }` — 라벨이 비거나 byEmployeeMonth 가 모두 0 이면 제거.
 * 같은 `key` 가 두 번 나오면 마지막 값으로 머지(라벨은 앞 값 유지).
 */
function parseCustomReturnsSchedule(v: unknown): import("@/types/models").CustomReturnsSchedule | null {
  let raw: unknown = v;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try { raw = JSON.parse(t) as unknown; } catch { return null; }
  }
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.categories)) arr = o.categories;
    else return null;
  } else {
    return null;
  }
  const seen = new Map<string, import("@/types/models").CustomReturnCategory>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!key || !label) continue;
    const byEmp = parseEmployeeMonthlyAmountMap(o.byEmployeeMonth);
    if (!byEmp) continue;
    const exist = seen.get(key);
    if (exist) {
      /** 같은 key 중복 시 byEmployeeMonth 만 머지(라벨은 처음 값 유지) */
      for (const [eid, months] of Object.entries(byEmp)) {
        exist.byEmployeeMonth[eid] = { ...(exist.byEmployeeMonth[eid] ?? {}), ...months };
      }
    } else {
      seen.set(key, { key, label, byEmployeeMonth: byEmp });
    }
  }
  if (seen.size === 0) return null;
  return { categories: [...seen.values()] };
}

/**
 * 월별 발생 인센 자동 세후 변환 비율(%) 파싱.
 * - 1~100 정수만 허용. 0/음수/100 초과/유한수 아님 → null(변환 비활성).
 * - PB 컬럼 자체가 없을 때도 안전하게 null.
 */
function parseIncentiveNetRatioPercent(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 100) return null;
  return n;
}

/** 협력업체 복리후생 사용 여부 — PB 컬럼 없으면 null. */
function parseVendorWelfareApplied(v: unknown): boolean | null {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "y" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "n" || s === "no") return false;
  }
  return null;
}

/** 협력업체 복리후생 사용 비율 — 80/90/20/25/30 외는 null. */
function parseVendorWelfareRatio(v: unknown): 80 | 90 | 20 | 25 | 30 | null {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  if (n === 80 || n === 90 || n === 20 || n === 25 || n === 30) {
    return n as 80 | 90 | 20 | 25 | 30;
  }
  return null;
}

/**
 * 분기 지원 항목별 지급 월 오버라이드.
 * 키는 QUARTERLY_ITEM 값(문자열), 값은 1~12 정수 배열(중복 제거·정렬).
 * 결과가 비면 null.
 */
/**
 * 직원×월 단위 금액 맵 파싱 — 대표반환·배우자수령·알아서금액 공통.
 * 구조: { "직원ID": { "1": 금액, "3": 금액, ... } }
 * 허용: 내부 값이 0 이하이거나 유한수가 아니면 키를 제거.
 */
function parseEmployeeMonthlyAmountMap(
  v: unknown,
): Record<string, Partial<Record<string, number>>> | null {
  let raw: unknown = v;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try { raw = JSON.parse(t) as unknown; } catch { return null; }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, Partial<Record<string, number>>> = {};
  for (const [empId, monthMap] of Object.entries(raw as Record<string, unknown>)) {
    if (!empId || typeof monthMap !== "object" || monthMap == null || Array.isArray(monthMap)) continue;
    const months: Partial<Record<string, number>> = {};
    for (const [mk, mv] of Object.entries(monthMap as Record<string, unknown>)) {
      const mNum = parseInt(mk, 10);
      if (!Number.isFinite(mNum) || mNum < 1 || mNum > 12) continue;
      const amt = Math.round(Number(mv));
      if (!Number.isFinite(amt) || amt <= 0) continue;
      months[mk] = amt;
    }
    if (Object.keys(months).length > 0) out[empId] = months;
  }
  return Object.keys(out).length ? out : null;
}

const parseRepReturnSchedule = parseEmployeeMonthlyAmountMap;
const parseSpouseReceiptSchedule = parseEmployeeMonthlyAmountMap;
const parseDiscretionarySchedule = parseEmployeeMonthlyAmountMap;

export function mapBaseAssetAnnual(r: Record<string, unknown>): BaseAssetAnnual {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    prevYearEndTotal: numNull(r.prevYearEndTotal),
    employerContributionOverride: numNull(r.employerContributionOverride),
    investReturnAndCarryover: numNull(r.investReturnAndCarryover),
    nonEmployerContributionOverride: numNull(r.nonEmployerContributionOverride),
    mergerIn: numNull(r.mergerIn),
    splitOut: numNull(r.splitOut),
    currentYearEndTotalOverride: numNull(r.currentYearEndTotalOverride),
  };
}

export function mapFundOperationAnnual(r: Record<string, unknown>): FundOperationAnnual {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    deposit: numNull(r.deposit),
    trust: numNull(r.trust),
    security: numNull(r.security),
    ownStock: numNull(r.ownStock),
    reit: numNull(r.reit),
    etc: numNull(r.etc),
    loan: numNull(r.loan),
  };
}

function parseContribUsageRatio(v: unknown): 50 | 80 | 90 | null {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return n === 50 || n === 80 || n === 90 ? (n as 50 | 80 | 90) : null;
}

function parsePrevBaseAssetUsageRatio(v: unknown): 20 | 25 | 30 | null {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return n === 20 || n === 25 || n === 30 ? (n as 20 | 25 | 30) : null;
}

export function mapFundSourceAnnual(r: Record<string, unknown>): FundSourceAnnual {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    operationIncome: numNull(r.operationIncome),
    contribUsageRatio: parseContribUsageRatio(r.contribUsageRatio),
    contribUsageAmount: numNull(r.contribUsageAmount),
    excessCapitalUsage: numNull(r.excessCapitalUsage),
    prevBaseAssetUsageRatio: parsePrevBaseAssetUsageRatio(r.prevBaseAssetUsageRatio),
    prevBaseAssetUsageAmount: numNull(r.prevBaseAssetUsageAmount),
    jointFundSupport: numNull(r.jointFundSupport),
    carryover: numNull(r.carryover),
  };
}

export function mapContribUsageAnnual(r: Record<string, unknown>): ContribUsageAnnual {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    u80RecipientCount: numNull(r.u80RecipientCount),
    u80VendorWelfareAmount: numNull(r.u80VendorWelfareAmount),
    u90RecipientCount: numNull(r.u90RecipientCount),
    u90VendorWelfareAmount: numNull(r.u90VendorWelfareAmount),
    u20BaseAssetUsed: numNull(r.u20BaseAssetUsed),
    u20VendorWelfareAmount: numNull(r.u20VendorWelfareAmount),
    u20RecipientCount: numNull(r.u20RecipientCount),
    u25BaseAssetUsed: numNull(r.u25BaseAssetUsed),
    u25VendorWelfareAmount: numNull(r.u25VendorWelfareAmount),
    u25RecipientCount: numNull(r.u25RecipientCount),
    u30BaseAssetUsed: numNull(r.u30BaseAssetUsed),
    u30VendorWelfareAmount: numNull(r.u30VendorWelfareAmount),
    u30RecipientCount: numNull(r.u30RecipientCount),
  };
}

/** 사업실적 구분별 저장 객체: key 는 법정 코드 문자열("57"~"66"). */
function parseBizItems(v: unknown): Record<string, BizResultItem> {
  let raw: unknown = v;
  if (raw == null || raw === "") return {};
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, BizResultItem> = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val == null || typeof val !== "object" || Array.isArray(val)) continue;
    const rec = val as Record<string, unknown>;
    out[String(k)] = {
      purposeAmountOverride: numNull(rec.purposeAmountOverride),
      purposeCount: numNull(rec.purposeCount),
      loanAmount: numNull(rec.loanAmount),
      loanCount: numNull(rec.loanCount),
    };
  }
  return out;
}

export function mapBizResultAnnual(r: Record<string, unknown>): BizResultAnnual {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    bizItems: parseBizItems(r.bizItems),
    operationCost: numNull(r.operationCost),
    optionalAmountOverride: numNull(r.optionalAmountOverride),
    optionalRecipientsOverride: numNull(r.optionalRecipientsOverride),
  };
}

export function mapRealEstateHolding(r: Record<string, unknown>): RealEstateHolding {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    year: num(r.year),
    seq: num(r.seq),
    name: r.name == null || r.name === "" ? null : String(r.name),
    amount: numNull(r.amount),
    acquiredAt: r.acquiredAt == null || r.acquiredAt === "" ? null : String(r.acquiredAt).slice(0, 10),
  };
}

function parseQuarterlyPayMonths(v: unknown): Partial<Record<string, number[]>> | null {
  let raw: unknown = v;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      raw = JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Partial<Record<string, number[]>> = {};
  for (const [k, arr] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    const valid = [...new Set(
      (arr as unknown[])
        .map((x) => Math.round(Number(x)))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12),
    )].sort((a, b) => a - b);
    if (valid.length) out[k] = valid;
  }
  return Object.keys(out).length ? out : null;
}
