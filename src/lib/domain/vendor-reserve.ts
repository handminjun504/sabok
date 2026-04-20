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

/** “지금 통장 입금 시 +20% 추가 적립이 필요한가” 판정 결과 */
export type AdditionalReserveStatus = {
  /** true 면 안내 멘트의 입금액에 20% 가산을 자동 적용해야 함 */
  active: boolean;
  /** 판정 사유 — UI 라벨 분기에 사용 */
  reason:
    | "INDIVIDUAL" // 개인사업자: 항상 활성
    | "CORPORATE_BELOW_CAP" // 법인: 자본금 50% 한도 미달
    | "CORPORATE_NO_VENDORS" // 법인: 출연처 미등록(보수적으로 활성)
    | "CORPORATE_NO_CAPITAL" // 법인: 자본금 미입력으로 한도 산정 불가(보수적으로 활성)
    | "CORPORATE_COMPLETE"; // 법인: 자본금 50% 적립 완료 → 추가 적립 종료
};

/**
 * 거래처 타입(개인/법인) + 자본금 50% 적립 진행도를 보고
 * “현재 통장 입금 시 +20% 추가 적립이 필요한지”를 단일 결과로 알려준다.
 *
 * 규칙:
 *   1) 개인사업자          → 항상 활성 (+20% 적립 무기한)
 *   2) 법인 + 자본금 50% 미달 → 활성 (개인과 동일하게 +20%)
 *   3) 법인 + 50% 적립 완료 → 비활성 (일반 입금)
 *   4) 법인 + 자본금 정보 없음 / 출연처 없음 → 보수적으로 활성
 *      (안내 멘트가 “필요 없는데 가산”되는 것보다 “모자라게 입금”되는 게 더 큰 사고이므로 안전한 쪽으로)
 */
export function additionalReserveStatus(
  tenant: { clientEntityType: "INDIVIDUAL" | "CORPORATE" },
  summary: TenantAdditionalReserveSummary,
): AdditionalReserveStatus {
  if (tenant.clientEntityType === "INDIVIDUAL") {
    return { active: true, reason: "INDIVIDUAL" };
  }
  // CORPORATE
  if (summary.kind === "NO_VENDORS") {
    return { active: true, reason: "CORPORATE_NO_VENDORS" };
  }
  if (summary.kind === "INDIVIDUAL") {
    /** 거래처는 법인인데 요약은 개인으로 잡힌 모순 — 보수적으로 활성 처리 */
    return { active: true, reason: "CORPORATE_NO_CAPITAL" };
  }
  if (summary.cannotAssess) {
    return { active: true, reason: "CORPORATE_NO_CAPITAL" };
  }
  if (summary.isComplete) {
    return { active: false, reason: "CORPORATE_COMPLETE" };
  }
  return { active: true, reason: "CORPORATE_BELOW_CAP" };
}

/** 안내 멘트·카드 라벨용 한 줄 요약 */
export function additionalReserveStatusLabel(status: AdditionalReserveStatus): string {
  switch (status.reason) {
    case "INDIVIDUAL":
      return "개인사업자 — 입금액에 적립금 20% 포함";
    case "CORPORATE_BELOW_CAP":
      return "법인 — 자본금 50% 적립 진행 중 (입금액에 적립금 20% 포함)";
    case "CORPORATE_NO_VENDORS":
      return "법인 — 출연처 미등록, 입금액에 적립금 20% 포함(자본금 50% 도달 시 종료)";
    case "CORPORATE_NO_CAPITAL":
      return "법인 — 본사 자본금 미입력, 안전하게 적립금 20% 포함(자본금 입력 시 자동 갱신)";
    case "CORPORATE_COMPLETE":
      return "법인 — 자본금 50% 적립 완료, 적립금 가산 없음(일반 입금)";
  }
}
