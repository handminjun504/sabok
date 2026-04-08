/** 출연금 대비 추가 적립 비율·법인 적립 상한(자본금 대비) — 회계 확정 시 조정 */

export const VENDOR_CONTRIBUTION_RESERVE_RATE = 0.2;
export const CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL = 0.5;

export type VendorBusinessType = "INDIVIDUAL" | "CORPORATE";

export type ComputeAdditionalReserveInput = {
  businessType: VendorBusinessType;
  contributionAmount: number;
  /** 법인: 사업장 자본금 K. 개인: 0 */
  workplaceCapital: number;
  /** 현재까지 누적된 추가 적립 A */
  accumulatedReserve: number;
};

export type ComputeAdditionalReserveResult = {
  /** 이번 출연금에 대해 이론상 20% */
  rawAdditional: number;
  /** 실제 이번에 더할 금액 */
  effectiveAdditional: number;
  /** 반영 후 누적 */
  newAccumulatedReserve: number;
  /** 법인일 때만 의미: Cap = 0.5 * K, 개인은 null */
  capAmount: number | null;
  /** 상한까지 남은 여유(법인). 개인은 null */
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
