/**
 * 근로복지기금 운영상황 보고서(별지 제15호서식) 도메인 로직.
 *
 * 이 모듈은
 *  1) 사업체·적립 데이터에서 각 칸에 대한 **자동 추천값(Auto Default)** 을 계산하고
 *  2) PB에 저장된 연도별 수동 입력(override)과 자동값을 병합해
 *     최종 보고서 뷰(`computeOperatingReportView`)를 만든다.
 *
 * 자동/수동 규칙:
 *  - 각 저장 필드는 `number | null`. `null` 이면 **자동값**, 숫자면 **수동값(override)**.
 *  - 수동값이 들어간 셀은 UI에서 "수동" 뱃지로 표기한다.
 */

import type {
  BaseAssetAnnual,
  BizResultAnnual,
  BizResultItem,
  CompanySettings,
  ContribUsageAnnual,
  Employee,
  FundOperationAnnual,
  FundSourceAnnual,
  MonthlyEmployeeNote,
  RealEstateHolding,
  Tenant,
  Vendor,
  VendorContribution,
} from "@/types/models";
import { LEGAL_WELFARE_CATEGORY_ROWS } from "./operating-welfare-legal-categories";

export const BIZ_ITEM_CODES = [57, 58, 59, 60, 61, 62, 63, 64, 65, 66] as const;
export type BizItemCode = (typeof BIZ_ITEM_CODES)[number];

/** ㉚ / ⑩ 용 출연금 사용 비율 (개인=50, 법인=80 or 90) */
export const CONTRIB_USAGE_RATIOS = [50, 80, 90] as const;
export type ContribUsageRatio = (typeof CONTRIB_USAGE_RATIOS)[number];

/** ㉜ / ⑫ 용 직전 기본재산 사용 비율 (20 / 25 / 30) */
export const PREV_BASE_ASSET_USAGE_RATIOS = [20, 25, 30] as const;
export type PrevBaseAssetUsageRatio = (typeof PREV_BASE_ASSET_USAGE_RATIOS)[number];

function int(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(Number(n))) return 0;
  return Math.round(Number(n));
}

/** override 가 있으면 override, 없으면 auto */
function pick(override: number | null, auto: number): number {
  return override == null ? auto : int(override);
}

/** 회계연도 "YYYY.MM.DD ~ YYYY.MM.DD" 문자열 생성 */
export function formatAccountingYearRange(year: number, startMonth: number | null): string {
  const sm = startMonth != null && startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  const endY = sm === 1 ? year : year + 1;
  const endM = sm === 1 ? 12 : sm - 1;
  const endLastDay = new Date(endY, endM, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}.${pad(sm)}.01 ~ ${endY}.${pad(endM)}.${pad(endLastDay)}`;
}

/**
 * 사업주 출연·사업주 외의 자 출연 자동 집계.
 * - tenant.clientEntityType === "CORPORATE" 면 vendor.businessType === "CORPORATE" 를 사업주로 간주.
 * - tenant.clientEntityType === "INDIVIDUAL" 이면 vendor.businessType === "INDIVIDUAL" 을 사업주로 간주.
 * - 그 외 vendor 는 "사업주 외" 로 합산한다.
 */
export function aggregateVendorContributions(
  tenant: Tenant | null,
  vendors: Vendor[],
  contributions: VendorContribution[],
): { employerTotal: number; otherTotal: number } {
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const employerKind: "CORPORATE" | "INDIVIDUAL" =
    tenant?.clientEntityType === "INDIVIDUAL" ? "INDIVIDUAL" : "CORPORATE";
  let employerTotal = 0;
  let otherTotal = 0;
  for (const c of contributions) {
    const v = vendorById.get(c.vendorId);
    const amt = int(c.contributionAmount);
    if (!v) {
      otherTotal += amt;
      continue;
    }
    if (v.businessType === employerKind) employerTotal += amt;
    else otherTotal += amt;
  }
  return { employerTotal, otherTotal };
}

/** position === "대표이사" 인 첫 번째 활성 직원의 이름 (없으면 null) */
export function firstCeoNameFromEmployees(employees: Employee[]): string | null {
  for (const e of employees) {
    if ((e.position ?? "").trim() === "대표이사" && e.name.trim()) return e.name.trim();
  }
  return null;
}

/** 월별 노트 중 optionalExtraAmount > 0 인 고유 직원 수 (선택적 복지 수혜자 수 자동 추정) */
export function estimateOptionalRecipientsByNotes(notes: MonthlyEmployeeNote[], year: number): number {
  const set = new Set<string>();
  for (const n of notes) {
    if (n.year !== year) continue;
    const ex = n.optionalExtraAmount == null ? 0 : int(n.optionalExtraAmount);
    if (ex > 0) set.add(n.employeeId);
  }
  return set.size;
}

/**
 * 보고서 산출용 컨텍스트.
 * - 현 연도에 관한 입력·자동 기반값을 한 곳에 모아, 도메인 함수가 view 를 만든다.
 */
export type OperatingReportInputs = {
  baseAsset: BaseAssetAnnual | null;
  fundOperation: FundOperationAnnual | null;
  fundSource: FundSourceAnnual | null;
  usage: ContribUsageAnnual | null;
  biz: BizResultAnnual | null;
  realEstate: RealEstateHolding[];
};

export type OperatingReportAutoSources = {
  /** ⑬ 자동 추천: 사업주 출연 합계 */
  autoEmployerContribution: number;
  /** ⑮ 자동 추천: 사업주 외 출연 합계 */
  autoNonEmployerContribution: number;
  /** ⑰ 자동 추천: 기본재산 사용 (= 연간 지급 총액) */
  autoBaseAssetUsed: number;
  /** ⑨ 활성 근로자 수 */
  autoEmployeeCount: number;
  /** 법정 코드별 자동 배분(57~66, 71) */
  legalAllocByCode: Map<number, number>;
  /** ⑦ 대표자 자동(직원) */
  autoCeoName: string | null;
  /** ◯72 선택적 복지 수혜자 수 자동 추정 */
  autoOptionalRecipients: number;
};

export type OperatingReportView = {
  /** 1쪽 기본정보(연도 칸은 모두 자동 조합) */
  basic: {
    name: string;
    approvalNumber: string;
    incorporationDate: string;
    phone: string;
    addressLine: string;
    accountingYearLabel: string;
    ceoName: string;
    industry: string;
    employeeCount: number;
    vendorEmployeeCount: number | null;
    headOfficeCapital: number;
  };

  /** 기본재산 변동 ⑫~⑳ (모든 값은 auto 병합된 숫자) */
  baseAsset: {
    prevYearEndTotal: number;
    employerContribution: number;
    investReturnAndCarryover: number;
    nonEmployerContribution: number;
    mergerIn: number;
    baseAssetUsed: number;
    splitOut: number;
    subtotal: number;
    currentYearEndTotal: number;
    /** override 여부 맵 */
    overridden: {
      prevYearEndTotal: boolean;
      employerContribution: boolean;
      nonEmployerContribution: boolean;
      currentYearEndTotal: boolean;
    };
  };

  /** 기금 운용방법 ㉑~㉘ (합계 자동, 개별은 override 그대로) */
  fundOperation: {
    deposit: number;
    trust: number;
    security: number;
    ownStock: number;
    reit: number;
    etc: number;
    loan: number;
    total: number;
  };

  /** 기금사업 재원 ㉙~㉟ */
  fundSource: {
    operationIncome: number;
    contribUsageRatio: ContribUsageRatio;
    contribUsageAmount: number;
    excessCapitalUsage: number;
    prevBaseAssetUsageRatio: PrevBaseAssetUsageRatio;
    prevBaseAssetUsageAmount: number;
    jointFundSupport: number;
    carryover: number;
    total: number;
    overridden: {
      contribUsageAmount: boolean;
      excessCapitalUsage: boolean;
      prevBaseAssetUsageAmount: boolean;
    };
  };

  /** 2쪽 사용현황 매트릭스 (일부 금액은 ㉚/㉜ 과 연동되어 기본값) */
  usage: {
    u80: { amount: number; recipientCount: number; vendorWelfareAmount: number; perHead: number };
    u90: { amount: number; recipientCount: number; vendorWelfareAmount: number; perHead: number };
    u20: { amount: number; recipientCount: number; vendorWelfareAmount: number; perHead: number };
    u25: { amount: number; recipientCount: number; vendorWelfareAmount: number; perHead: number };
    u30: { amount: number; recipientCount: number; vendorWelfareAmount: number; perHead: number };
  };

  /** 사업실적 ◯57~◯72 */
  biz: {
    items: Array<{
      code: BizItemCode;
      label: string;
      purposeAmount: number;
      purposeAmountAuto: number;
      purposeAmountOverridden: boolean;
      purposeCount: number;
      loanAmount: number;
      loanCount: number;
    }>;
    subtotalPurpose: number;
    subtotalLoan: number;
    subtotal: number;
    operationCost: number;
    balance: number;
    total: number;
    optionalAmount: number;
    optionalRecipients: number;
    optionalAmountOverridden: boolean;
    optionalRecipientsOverridden: boolean;
  };

  /** 부동산 ㉓~㉕ */
  realEstate: {
    rows: Array<{ id: string; seq: number; name: string; amount: number; acquiredAt: string }>;
    totalAmount: number;
  };

  /** 검증 경고(㉘ === ⑳, ㉗+㉟ === ◯70 등) */
  warnings: string[];
};

/**
 * 자동값·override 를 병합해 보고서 뷰를 만든다.
 *
 * @param prevBaseAsset 전년도 `sabok_base_asset_annual` 레코드. ⑫(직전말) 자동 링크에 사용.
 * @param prevFundSource 전년도 `sabok_fund_source_annual` 레코드. ㉞(이월금) 자동 링크에 사용.
 */
export function computeOperatingReportView(args: {
  tenant: Tenant | null;
  settings: CompanySettings | null;
  year: number;
  inputs: OperatingReportInputs;
  prevBaseAsset: BaseAssetAnnual | null;
  prevFundSource: FundSourceAnnual | null;
  autos: OperatingReportAutoSources;
}): OperatingReportView {
  const { tenant, year, inputs, prevBaseAsset, prevFundSource, autos } = args;

  const capital = int(tenant?.headOfficeCapital);

  /** ⑫ 직전말 — override 없으면 전년도 ⑳ 자동 */
  const prevAuto = computeEndTotalAuto(prevBaseAsset);
  const prevYearEndTotal = pick(inputs.baseAsset?.prevYearEndTotal ?? null, prevAuto);

  const employerContribution = pick(
    inputs.baseAsset?.employerContributionOverride ?? null,
    autos.autoEmployerContribution,
  );
  const nonEmployerContribution = pick(
    inputs.baseAsset?.nonEmployerContributionOverride ?? null,
    autos.autoNonEmployerContribution,
  );
  const investReturnAndCarryover = int(inputs.baseAsset?.investReturnAndCarryover);
  const mergerIn = int(inputs.baseAsset?.mergerIn);
  const splitOut = int(inputs.baseAsset?.splitOut);
  const baseAssetUsed = autos.autoBaseAssetUsed;
  const subtotal =
    employerContribution + investReturnAndCarryover + nonEmployerContribution + mergerIn - baseAssetUsed - splitOut;
  const currentYearEndTotalAuto = prevYearEndTotal + subtotal;
  const currentYearEndTotal = pick(
    inputs.baseAsset?.currentYearEndTotalOverride ?? null,
    currentYearEndTotalAuto,
  );

  /** ㉑~㉗ */
  const fundOpVals = {
    deposit: int(inputs.fundOperation?.deposit),
    trust: int(inputs.fundOperation?.trust),
    security: int(inputs.fundOperation?.security),
    ownStock: int(inputs.fundOperation?.ownStock),
    reit: int(inputs.fundOperation?.reit),
    etc: int(inputs.fundOperation?.etc),
    loan: int(inputs.fundOperation?.loan),
  };
  const fundOpTotal =
    fundOpVals.deposit +
    fundOpVals.trust +
    fundOpVals.security +
    fundOpVals.ownStock +
    fundOpVals.reit +
    fundOpVals.etc +
    fundOpVals.loan;

  /** 재원 ㉙~㉟ */
  const ratioContrib: ContribUsageRatio =
    inputs.fundSource?.contribUsageRatio ??
    (tenant?.clientEntityType === "INDIVIDUAL" ? 50 : 80);
  const ratioPrev: PrevBaseAssetUsageRatio =
    inputs.fundSource?.prevBaseAssetUsageRatio ??
    (tenant?.clientEntityType === "INDIVIDUAL" ? 20 : 25);

  const contribBase = employerContribution + nonEmployerContribution;
  const autoContribUsageAmount = Math.floor((contribBase * ratioContrib) / 100);
  const contribUsageAmount = pick(
    inputs.fundSource?.contribUsageAmount ?? null,
    autoContribUsageAmount,
  );

  const halfCapital = Math.floor(capital * 0.5);
  const autoExcessCapitalUsage = Math.max(0, currentYearEndTotal - halfCapital);
  const excessCapitalUsage = pick(
    inputs.fundSource?.excessCapitalUsage ?? null,
    autoExcessCapitalUsage,
  );

  const autoPrevBaseUsageAmount = Math.floor((prevYearEndTotal * ratioPrev) / 100);
  const prevBaseAssetUsageAmount = pick(
    inputs.fundSource?.prevBaseAssetUsageAmount ?? null,
    autoPrevBaseUsageAmount,
  );

  const operationIncome = int(inputs.fundSource?.operationIncome);
  const jointFundSupport = int(inputs.fundSource?.jointFundSupport);
  const carryoverAuto = computeCarryoverAutoFromPrev(prevFundSource);
  const carryover = inputs.fundSource?.carryover == null ? carryoverAuto : int(inputs.fundSource.carryover);

  const fundSourceTotal =
    operationIncome +
    contribUsageAmount +
    excessCapitalUsage +
    prevBaseAssetUsageAmount +
    jointFundSupport +
    carryover;

  /** 사용현황 매트릭스 */
  const u80Amount = Math.floor((contribBase * 80) / 100);
  const u90Amount = Math.floor((contribBase * 90) / 100);
  const u20Amount = Math.floor((prevYearEndTotal * 20) / 100);
  const u25Amount = Math.floor((prevYearEndTotal * 25) / 100);
  const u30Amount = Math.floor((prevYearEndTotal * 30) / 100);

  const safePerHead = (amt: number, cnt: number): number => (cnt > 0 ? Math.floor(amt / cnt) : 0);

  const u80 = {
    amount: u80Amount,
    recipientCount: int(inputs.usage?.u80RecipientCount),
    vendorWelfareAmount: int(inputs.usage?.u80VendorWelfareAmount),
    perHead: 0,
  };
  u80.perHead = safePerHead(u80.amount, u80.recipientCount);

  const u90 = {
    amount: u90Amount,
    recipientCount: int(inputs.usage?.u90RecipientCount),
    vendorWelfareAmount: int(inputs.usage?.u90VendorWelfareAmount),
    perHead: 0,
  };
  u90.perHead = safePerHead(u90.amount, u90.recipientCount);

  const u20 = {
    amount: inputs.usage?.u20BaseAssetUsed != null ? int(inputs.usage.u20BaseAssetUsed) : u20Amount,
    recipientCount: int(inputs.usage?.u20RecipientCount),
    vendorWelfareAmount: int(inputs.usage?.u20VendorWelfareAmount),
    perHead: 0,
  };
  u20.perHead = safePerHead(u20.amount, u20.recipientCount);

  const u25 = {
    amount: inputs.usage?.u25BaseAssetUsed != null ? int(inputs.usage.u25BaseAssetUsed) : u25Amount,
    recipientCount: int(inputs.usage?.u25RecipientCount),
    vendorWelfareAmount: int(inputs.usage?.u25VendorWelfareAmount),
    perHead: 0,
  };
  u25.perHead = safePerHead(u25.amount, u25.recipientCount);

  const u30 = {
    amount: inputs.usage?.u30BaseAssetUsed != null ? int(inputs.usage.u30BaseAssetUsed) : u30Amount,
    recipientCount: int(inputs.usage?.u30RecipientCount),
    vendorWelfareAmount: int(inputs.usage?.u30VendorWelfareAmount),
    perHead: 0,
  };
  u30.perHead = safePerHead(u30.amount, u30.recipientCount);

  /** 사업실적 */
  const items = BIZ_ITEM_CODES.map((code) => {
    const label = LEGAL_WELFARE_CATEGORY_ROWS.find((row) => row.code === code)?.label ?? String(code);
    const auto = int(autos.legalAllocByCode.get(code));
    const saved: BizResultItem | undefined = inputs.biz?.bizItems?.[String(code)];
    const purposeAmount = saved?.purposeAmountOverride == null ? auto : int(saved.purposeAmountOverride);
    return {
      code,
      label,
      purposeAmount,
      purposeAmountAuto: auto,
      purposeAmountOverridden: saved?.purposeAmountOverride != null,
      purposeCount: int(saved?.purposeCount),
      loanAmount: int(saved?.loanAmount),
      loanCount: int(saved?.loanCount),
    };
  });

  const subtotalPurpose = items.reduce((s, it) => s + it.purposeAmount, 0);
  const subtotalLoan = items.reduce((s, it) => s + it.loanAmount, 0);
  const bizSubtotal = subtotalPurpose + subtotalLoan;
  const operationCost = int(inputs.biz?.operationCost);

  /** 잔액(◯69) 기본값: 재원 합(㉟) − 기본재산 사용(⑰) − 운영비(◯68) */
  const balanceAuto = Math.max(0, fundSourceTotal - baseAssetUsed - operationCost);
  const bizTotal = bizSubtotal + operationCost + balanceAuto;

  /** ◯71 선택적 복지 */
  const optionalAuto = int(autos.legalAllocByCode.get(71));
  const optionalAmount = pick(inputs.biz?.optionalAmountOverride ?? null, optionalAuto);
  const optionalRecipients = pick(
    inputs.biz?.optionalRecipientsOverride ?? null,
    autos.autoOptionalRecipients,
  );

  /** 부동산 */
  const reRows = inputs.realEstate
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map((row) => ({
      id: row.id,
      seq: row.seq,
      name: row.name ?? "",
      amount: int(row.amount),
      acquiredAt: row.acquiredAt ?? "",
    }));
  const reTotal = reRows.reduce((s, r) => s + r.amount, 0);

  /** 검증 경고 */
  const warnings: string[] = [];
  if (fundOpTotal !== currentYearEndTotal) {
    warnings.push(
      `기금 운용방법 합계(㉘=${fundOpTotal.toLocaleString("ko-KR")})가 당해 기본재산 말 총액(⑳=${currentYearEndTotal.toLocaleString("ko-KR")})과 일치하지 않습니다.`,
    );
  }
  const loanPlusSource = fundOpVals.loan + fundSourceTotal;
  if (loanPlusSource !== bizTotal) {
    warnings.push(
      `근로자 대부(㉗) + 기금사업 재원 합계(㉟) = ${loanPlusSource.toLocaleString("ko-KR")} 이 사업실적 합계(◯70=${bizTotal.toLocaleString("ko-KR")})와 일치하지 않습니다.`,
    );
  }
  if (currentYearEndTotal !== currentYearEndTotalAuto) {
    warnings.push(
      `당해 말 총액(⑳) 수동값이 ⑫+⑲ 자동 합(${currentYearEndTotalAuto.toLocaleString("ko-KR")})과 다릅니다. 차이가 의도된 것인지 확인하세요.`,
    );
  }

  return {
    basic: {
      name: tenant?.name ?? "",
      approvalNumber: tenant?.approvalNumber ?? "",
      incorporationDate: tenant?.incorporationDate ?? "",
      phone: tenant?.phone ?? "",
      addressLine: tenant?.addressLine ?? "",
      accountingYearLabel: formatAccountingYearRange(year, tenant?.accountingYearStartMonth ?? null),
      ceoName: (tenant?.ceoName ?? "").trim() || autos.autoCeoName || "",
      industry: tenant?.industry ?? "",
      employeeCount: autos.autoEmployeeCount,
      vendorEmployeeCount: null,
      headOfficeCapital: capital,
    },
    baseAsset: {
      prevYearEndTotal,
      employerContribution,
      investReturnAndCarryover,
      nonEmployerContribution,
      mergerIn,
      baseAssetUsed,
      splitOut,
      subtotal,
      currentYearEndTotal,
      overridden: {
        prevYearEndTotal: inputs.baseAsset?.prevYearEndTotal != null,
        employerContribution: inputs.baseAsset?.employerContributionOverride != null,
        nonEmployerContribution: inputs.baseAsset?.nonEmployerContributionOverride != null,
        currentYearEndTotal: inputs.baseAsset?.currentYearEndTotalOverride != null,
      },
    },
    fundOperation: {
      ...fundOpVals,
      total: fundOpTotal,
    },
    fundSource: {
      operationIncome,
      contribUsageRatio: ratioContrib,
      contribUsageAmount,
      excessCapitalUsage,
      prevBaseAssetUsageRatio: ratioPrev,
      prevBaseAssetUsageAmount,
      jointFundSupport,
      carryover,
      total: fundSourceTotal,
      overridden: {
        contribUsageAmount: inputs.fundSource?.contribUsageAmount != null,
        excessCapitalUsage: inputs.fundSource?.excessCapitalUsage != null,
        prevBaseAssetUsageAmount: inputs.fundSource?.prevBaseAssetUsageAmount != null,
      },
    },
    usage: { u80, u90, u20, u25, u30 },
    biz: {
      items,
      subtotalPurpose,
      subtotalLoan,
      subtotal: bizSubtotal,
      operationCost,
      balance: balanceAuto,
      total: bizTotal,
      optionalAmount,
      optionalRecipients,
      optionalAmountOverridden: inputs.biz?.optionalAmountOverride != null,
      optionalRecipientsOverridden: inputs.biz?.optionalRecipientsOverride != null,
    },
    realEstate: { rows: reRows, totalAmount: reTotal },
    warnings,
  };
}

/** 전년도 ⑳ 자동값(override 우선) */
function computeEndTotalAuto(prev: BaseAssetAnnual | null): number {
  if (!prev) return 0;
  if (prev.currentYearEndTotalOverride != null) return int(prev.currentYearEndTotalOverride);
  const base = int(prev.prevYearEndTotal);
  const sub =
    int(prev.employerContributionOverride) +
    int(prev.investReturnAndCarryover) +
    int(prev.nonEmployerContributionOverride) +
    int(prev.mergerIn) -
    int(prev.splitOut);
  return base + sub;
}

function computeCarryoverAutoFromPrev(prev: FundSourceAnnual | null): number {
  if (!prev) return 0;
  /** 단순화: 전년도 carryover 그대로 전달. 세밀한 자동 연동은 추후 개선 포인트. */
  return int(prev.carryover);
}
