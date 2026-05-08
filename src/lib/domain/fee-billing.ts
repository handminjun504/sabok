import type { FeeBillingMode } from "@/types/models";
import type { TenantClientEntityType } from "@/lib/domain/tenant-profile";
import type { WelfareTotalsByMonth } from "@/lib/domain/welfare-totals";
import { sumWelfareByMonth } from "@/lib/domain/welfare-totals";

/**
 * 거래처 구분별 수수료 디폴트 요율 — 「전사 설정」 의 `feeRatePercent` 가 비어 있을 때 폴백.
 *  - INDIVIDUAL(개인): 10%
 *  - CORPORATE(법인): 2%
 *
 * 운영자가 능동적으로 다른 값을 쓰고 싶으면 「전사 설정 ▸ 사복 운영 수수료」 의 `feeRatePercent` 를 입력.
 */
export function defaultFeeRate(t: TenantClientEntityType): number {
  return t === "CORPORATE" ? 2 : 10;
}

/**
 * 「전사 설정」 의 `feeRatePercent` 와 거래처 구분으로 실제 적용 요율을 결정.
 * 입력이 비어 있거나 0 이하/100 초과인 경우 디폴트 폴백.
 */
export function resolveFeeRate(
  ratePercent: number | null | undefined,
  clientEntityType: TenantClientEntityType,
): number {
  const n = Number(ratePercent);
  if (Number.isFinite(n) && n > 0 && n <= 100) return Math.round(n * 10) / 10;
  return defaultFeeRate(clientEntityType);
}

export type FeeBillingResult = {
  /** 연 수수료 — 12 개월 청구액의 합 */
  annualFee: number;
  /** 1~12 월 청구액 (인덱스 0 = 1월) */
  monthlyFees: WelfareTotalsByMonth;
  /** 산정 base 의 연합 — 「base × rate%」 의 base 부분이 얼마였는지 노출 */
  annualBase: number;
};

/**
 * 사복 운영 수수료 청구액 산정.
 *
 *  - `EVEN_12`: 연 base 합 × 요율 → 12 등분(소수점 절사). 매월 동일 청구액.
 *    잔여 1 원 단위 오차는 12 개월 합과 「연 base × 요율」 사이에 최대 11 원 차이가 날 수 있으나,
 *    회계 실무상 매달 동일 금액 청구가 우선이라 그대로 둔다.
 *  - `ON_PAY_MONTH`: 각 달 base × 요율(소수점 절사). 그 달 base ≤ 0 이면 0 원.
 *
 * 음수 base 가 들어오면 그대로 0 원으로 클램프(상위 `welfare-totals` 에서도 클램프됨).
 */
export function computeFeeBilling(
  byMonth: WelfareTotalsByMonth,
  ratePercent: number,
  mode: FeeBillingMode,
): FeeBillingResult {
  const safeRate = Math.max(0, Number(ratePercent) || 0);
  const ratio = safeRate / 100;

  const annualBase = sumWelfareByMonth(byMonth);

  if (mode === "EVEN_12") {
    const annualFee = Math.floor(Math.max(0, annualBase) * ratio);
    const each = Math.floor(annualFee / 12);
    const monthly = Array.from({ length: 12 }, () => each) as unknown as number[];
    /** 잔여 분배: 12 등분 시 1~11 원 잔여를 1월부터 차례로 1 원씩 더해 정확히 annualFee 와 일치. */
    let remainder = annualFee - each * 12;
    for (let i = 0; i < 12 && remainder > 0; i++) {
      monthly[i] += 1;
      remainder -= 1;
    }
    return {
      annualFee,
      monthlyFees: monthly.slice(0, 12) as unknown as WelfareTotalsByMonth,
      annualBase,
    };
  }

  /** ON_PAY_MONTH */
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const base = Math.max(0, Number(byMonth[i]) || 0);
    return Math.floor(base * ratio);
  });
  let annualFee = 0;
  for (const v of monthly) annualFee += v;
  return {
    annualFee,
    monthlyFees: monthly.slice(0, 12) as unknown as WelfareTotalsByMonth,
    annualBase,
  };
}

/** 청구 방식 한국어 라벨 — 카드·라디오 라벨에 동일하게 사용 */
export function feeBillingModeLabel(mode: FeeBillingMode): string {
  return mode === "ON_PAY_MONTH" ? "지급월 청구" : "매월 균등(÷12)";
}
