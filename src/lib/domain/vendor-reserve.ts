/**
 * **출연금 C** 정의: 해당 월에 레벨 1, 2, 3, 4, 5 직원에게 입금할 **총 금액**.
 *
 * 이 금액을 기준으로 **추가 적립** 비율·법인 상한을 둔다.
 *
 * - **법인**: 매 출연금(월)마다 C의 {@link VENDOR_CONTRIBUTION_RESERVE_RATE}(20%)를 추가 적립하되,
 *   누적 추가 적립이 본사 자본금 K의 {@link CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL}(50%)에 도달하면
 *   그 이후 출연분에는 추가 적립을 하지 않아도 됨(상한까지 남은 만큼만 반영).
 * - **개인**: 매 출연금(월)마다 항상 C의 20%를 추가로 적립해야 함(상한 없음).
 *
 * 회계·실무 확정 수치는 별도 조정 가능.
 */

export const VENDOR_CONTRIBUTION_RESERVE_RATE = 0.2;
export const CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL = 0.5;

/** 출연금 C — 도메인 정의만 (다른 화면에서 따로 붙일 때) */
export const CONTRIBUTION_AMOUNT_DEFINITION_KO =
  "출연금은 해당 월에 레벨 1, 2, 3, 4, 5 직원에게 입금할 총 금액입니다.";

/** 설정 화면·도움말에 그대로 쓸 수 있는 정의 + 적립 규칙 요약 */
export const CONTRIBUTION_ADDITIONAL_RESERVE_RULE_SUMMARY_KO =
  `${CONTRIBUTION_AMOUNT_DEFINITION_KO} 법인은 이 출연금(월)마다 20%를 추가 적립하되, 누적 추가 적립이 본사 자본금의 50%에 닿을 때까지이며 도달 후에는 추가 적립이 필요 없습니다. 개인은 매 출연금(월)마다 항상 20%를 추가 적립해야 합니다.`;

export type VendorBusinessType = "INDIVIDUAL" | "CORPORATE";

export type ComputeAdditionalReserveInput = {
  businessType: VendorBusinessType;
  /** 출연금 C — 해당 월 레벨 1~5 직원 입금 총액 */
  contributionAmount: number;
  /** 법인: 사업장 자본금 K. 개인: 0 */
  workplaceCapital: number;
  /** 현재까지 누적된 추가 적립 A */
  accumulatedReserve: number;
};

export type ComputeAdditionalReserveResult = {
  /** 이번 출연금 C에 대해 이론상 20% */
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

/** @see CONTRIBUTION_ADDITIONAL_RESERVE_RULE_SUMMARY_KO */
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
