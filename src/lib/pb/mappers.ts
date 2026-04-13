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
  incentiveAmount: numNull(r.incentiveAmount),
  discretionaryAmount: numNull(r.discretionaryAmount),
  optionalWelfareAmount: numNull(r.optionalWelfareAmount),
  monthlyPayAmount: numNull(r.monthlyPayAmount),
  quarterlyPayAmount: numNull(r.quarterlyPayAmount),
  birthMonth: r.birthMonth === null || r.birthMonth === undefined || r.birthMonth === "" ? null : num(r.birthMonth),
  hireMonth: r.hireMonth === null || r.hireMonth === undefined || r.hireMonth === "" ? null : num(r.hireMonth),
  resignMonth: r.resignMonth === null || r.resignMonth === undefined || r.resignMonth === "" ? null : num(r.resignMonth),
  weddingMonth:
    r.weddingMonth === null || r.weddingMonth === undefined || r.weddingMonth === "" ? null : num(r.weddingMonth),
  childrenInfant: num(r.childrenInfant),
  childrenPreschool: num(r.childrenPreschool),
  childrenTeen: num(r.childrenTeen),
  parentsCount: num(r.parentsCount),
  parentsInLawCount: num(r.parentsInLawCount),
  insurancePremium: num(r.insurancePremium),
  loanInterest: num(r.loanInterest),
  payDay: r.payDay === null || r.payDay === undefined || r.payDay === "" ? null : num(r.payDay),
  level: num(r.level, 1),
  flagAutoAmount: bool(r.flagAutoAmount),
  flagRepReturn: bool(r.flagRepReturn),
  flagSpouseReceipt: bool(r.flagSpouseReceipt),
  flagWorkerNet: bool(r.flagWorkerNet),
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

export function mapQuarterlyCfg(r: Record<string, unknown>): QuarterlyEmployeeConfig {
  return {
    id: String(r.id),
    employeeId: String(r.employeeId),
    year: num(r.year),
    itemKey: String(r.itemKey),
    paymentMonth: num(r.paymentMonth),
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

export function mapCompanySettings(r: Record<string, unknown>): CompanySettings {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    foundingMonth: num(r.foundingMonth, 1),
    defaultPayDay: num(r.defaultPayDay, 25),
    activeYear: num(r.activeYear, new Date().getFullYear()),
    accrualCurrentMonthPayNext: bool(r.accrualCurrentMonthPayNext),
    paymentEventDefs: parsePaymentEventDefs(r.paymentEventDefs),
  };
}
