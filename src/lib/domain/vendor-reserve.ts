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
