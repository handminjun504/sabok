import { parseSalaryInclusionVarianceMode, parseSalaryInclusionVarianceModeOrNull } from "@/lib/domain/salary-inclusion-display";
import type {
  CompanySettings,
  CustomPaymentEventDef,
  Employee,
  Level5Override,
  LevelPaymentRule,
  LevelTarget,
  MonthlyEmployeeNote,
  PaymentEventDefsByYear,
  QuarterlyEmployeeConfig,
  QuarterlyRate,
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
  birthMonth: r.birthMonth === null || r.birthMonth === undefined || r.birthMonth === "" ? null : num(r.birthMonth),
  hireMonth: r.hireMonth === null || r.hireMonth === undefined || r.hireMonth === "" ? null : num(r.hireMonth),
  resignMonth: r.resignMonth === null || r.resignMonth === undefined || r.resignMonth === "" ? null : num(r.resignMonth),
  resignYear: r.resignYear === null || r.resignYear === undefined || r.resignYear === "" ? null : num(r.resignYear),
  weddingMonth:
    r.weddingMonth === null || r.weddingMonth === undefined || r.weddingMonth === "" ? null : num(r.weddingMonth),
  childrenInfant: num(r.childrenInfant),
  childrenPreschool: num(r.childrenPreschool),
  childrenTeen: num(r.childrenTeen),
  parentsCount: num(r.parentsCount),
  parentsInLawCount: num(r.parentsInLawCount),
  insurancePremium: num(r.insurancePremium),
  loanInterest: num(r.loanInterest),
  monthlyRentAmount: numNull(r.monthlyRentAmount),
  payDay: r.payDay === null || r.payDay === undefined || r.payDay === "" ? null : num(r.payDay),
  level: num(r.level, 1),
  expectedYearlyWelfare: numNull(r.expectedYearlyWelfare),
  flagAutoAmount: bool(r.flagAutoAmount),
  flagRepReturn: bool(r.flagRepReturn),
  flagSpouseReceipt: bool(r.flagSpouseReceipt),
  flagWorkerNet: bool(r.flagWorkerNet),
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

export function mapCompanySettings(r: Record<string, unknown>): CompanySettings {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    foundingMonth: num(r.foundingMonth, 1),
    defaultPayDay: num(r.defaultPayDay, 25),
    activeYear: num(r.activeYear, new Date().getFullYear()),
    accrualCurrentMonthPayNext: bool(r.accrualCurrentMonthPayNext),
    salaryInclusionVarianceMode: parseSalaryInclusionVarianceMode(r.salaryInclusionVarianceMode),
    surveyShowRepReturn: bool(r.surveyShowRepReturn),
    surveyShowSpouseReceipt: bool(r.surveyShowSpouseReceipt),
    surveyShowWorkerNet: bool(r.surveyShowWorkerNet),
    paymentEventDefs: parsePaymentEventDefs(r.paymentEventDefs),
    reserveProgressNote: textOrNull(r.reserveProgressNote),
  };
}
