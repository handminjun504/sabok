/** 거래처 출연·추가 적립 산식 (법인: 누적 상한, 개인: 비율만). */

export const VENDOR_CONTRIBUTION_RESERVE_RATE = 0.2;
export const CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL = 0.5;

export type VendorBusinessType = "INDIVIDUAL" | "CORPORATE";

export type ComputeAdditionalReserveInput = {
  businessType: VendorBusinessType;
  /** Monthly contribution amount (C) */
  contributionAmount: number;
  /** Corporate: capital K; individual: 0 */
  workplaceCapital: number;
  /** Running total of additional reserve (A) */
  accumulatedReserve: number;
};

export type ComputeAdditionalReserveResult = {
  /** C × rate before cap */
  rawAdditional: number;
  /** Amount to book this month */
  effectiveAdditional: number;
  /** A after this month */
  newAccumulatedReserve: number;
  /** Corporate: 0.5×K cap; individual: null */
  capAmount: number | null;
  /** Headroom under cap (corporate only) */
  remainingToCap: number | null;
};

export function computeAdditionalReserve(input: ComputeAdditionalReserveInput): ComputeAdditionalReserveResult {
  const C = Math.max(0, input.contributionAmount);
  const A = Math.max(0, input.accumulatedReserve);
  const rawAdditional = Math.round(C * VENDOR_CONTRIBUTION_RESERVE_RATE);

  if (input.businessType === "INDIVIDUAL") {
    const effectiveAdditional = rawAdditional;
    return {
      rawAdditional,
      effectiveAdditional,
      newAccumulatedReserve: A + effectiveAdditional,
      capAmount: null,
      remainingToCap: null,
    };
  }

  const K = Math.max(0, input.workplaceCapital);
  const capAmount = Math.round(K * CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL);
  const room = Math.max(0, capAmount - A);
  const effectiveAdditional = Math.min(rawAdditional, room);
  return {
    rawAdditional,
    effectiveAdditional,
    newAccumulatedReserve: A + effectiveAdditional,
    capAmount,
    remainingToCap: Math.max(0, capAmount - A - effectiveAdditional),
  };
}

/** 출연(거래처) 추가 적립 누적 — 법인은 자본금×50% 상한(`computeAdditionalReserve`와 동일 K·cap). */
export type TenantAdditionalReserveSummary =
  | {
      kind: "CORPORATE";
      /** 상한 산정에 쓴 자본금(원) — 본사 자본금 우선, 없으면 활성 출연처 사업장 자본금 중 최대 */
      capitalWon: number;
      capWon: number;
      /** 활성 출연처 누적 추가 적립 합 */
      accumulatedTotalWon: number;
      remainingWon: number;
      isComplete: boolean;
      /** 자본금이 없어 상한을 0으로만 계산된 경우 */
      cannotAssess: boolean;
      activeVendorCount: number;
    }
  | {
      kind: "INDIVIDUAL";
      accumulatedTotalWon: number;
      activeVendorCount: number;
    }
  | { kind: "NO_VENDORS" };

type ReserveTenantInput = {
  clientEntityType: "INDIVIDUAL" | "CORPORATE";
  headOfficeCapital: number | null;
};

type ReserveVendorInput = {
  active: boolean;
  workplaceCapital: number;
  accumulatedReserve: number;
};

/**
 * 거래처별 `accumulatedReserve`는 각 레코드에 있으나, 법인 상한 K는 `vendorAppendContribution`과 같이
 * 본사 자본금 → 없으면 활성 출연처 사업장 자본금 최대값 순으로 씁니다. 복수 출연처면 누적은 합산해 한도와 비교합니다.
 */
export function summarizeTenantAdditionalReserve(
  tenant: ReserveTenantInput,
  vendors: readonly ReserveVendorInput[]
): TenantAdditionalReserveSummary {
  const active = vendors.filter((v) => v.active);
  if (active.length === 0) return { kind: "NO_VENDORS" };

  const accumulatedTotalWon = active.reduce((s, v) => s + Math.max(0, v.accumulatedReserve), 0);

  if (tenant.clientEntityType !== "CORPORATE") {
    return { kind: "INDIVIDUAL", accumulatedTotalWon, activeVendorCount: active.length };
  }

  const fromHead =
    tenant.headOfficeCapital != null && Number.isFinite(tenant.headOfficeCapital)
      ? Math.max(0, tenant.headOfficeCapital)
      : 0;
  const maxWorkplace = active.reduce((m, v) => Math.max(m, Math.max(0, v.workplaceCapital)), 0);
  const K = fromHead > 0 ? fromHead : maxWorkplace;

  const capWon = Math.round(K * CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL);
  const cannotAssess = capWon <= 0;
  const remainingWon = cannotAssess ? 0 : Math.max(0, capWon - accumulatedTotalWon);
  const isComplete = !cannotAssess && accumulatedTotalWon >= capWon;

  return {
    kind: "CORPORATE",
    capitalWon: K,
    capWon,
    accumulatedTotalWon,
    remainingWon,
    isComplete,
    cannotAssess,
    activeVendorCount: active.length,
  };
}
