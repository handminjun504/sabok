import type { FeeBillingMode, FeeRateBreakpoint } from "@/types/models";
import type { TenantClientEntityType } from "@/lib/domain/tenant-profile";
import type { WelfareTotalsByMonth } from "@/lib/domain/welfare-totals";
import { sumWelfareByMonth } from "@/lib/domain/welfare-totals";

/**
 * 「수수료 base 동결 정책」 — 활성 연도 중 퇴사가 발생해도 수수료가 줄지 않도록,
 * `computeWelfareTotalsForYear` 에 넘길 직원 명단을 「12개월 풀 시뮬레이션」용으로 사본화한다.
 *
 *  - **포함 기준**: 활성 연도 시작 시점에 이미 퇴사한 직원(`resignYear < year`) 만 제외.
 *    그 외(연중 퇴사 예정 / 미퇴사 / 미래 퇴사) 는 모두 포함.
 *  - **풀 시뮬레이션**: 포함된 직원의 `resignMonth` / `resignYear` 를 모두 `null` 로 덮어 사본화 →
 *    `employeeStatusForYear` 가 `ACTIVE_FULL_YEAR` 로 판정해 1~12 월이 모두 활성으로 잡힌다.
 *  - **입사월(`hireMonth`)** 은 손대지 않는다 — 사용자 요구는 「퇴사로 줄이지 마」이며,
 *    중간 입사로 인한 base 증가는 자연스러운 정합으로 유지.
 *
 * 본 helper 는 「수수료 base」(=`feeBaseTotals`) 산정에만 쓰이며, KPI 의 「사복 총 집행」·「선택적복지 합계」
 * 같은 실제 집행액 표시는 그대로 실(實)데이터(`totals`) 를 사용한다.
 */
export function buildFeeBaseEmployeeOverridesForYear<
  T extends { resignMonth: number | null; resignYear: number | null },
>(employees: ReadonlyArray<T>, year: number): T[] {
  const out: T[] = [];
  for (const e of employees) {
    /** 활성 연도 시작 전(=resignYear < year) 에 이미 퇴사한 직원은 base 풀 시뮬에서도 제외. */
    if (e.resignYear != null && e.resignYear < year) continue;
    /** 그 외엔 12개월 풀로 일했다고 가정 — resign* 만 무력화한 사본. */
    out.push({ ...e, resignMonth: null, resignYear: null });
  }
  return out;
}

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

/**
 * 사복 운영 수수료에 적용하는 부가가치세 비율(%) — 한국 표준 10%.
 * 청구서 발행 시 공급가액 외에 별도 표기되는 게 일반적이라 결과 객체에서 net/vat/gross 를 모두 노출한다.
 */
export const FEE_VAT_RATE_PERCENT = 10;

/**
 * 「수수료 변경점」 입력을 구간 계산에 쓸 수 있는 정규형으로 다듬는다.
 *
 *  - 1~12 범위 외 / 비유한 / 비양수 요율은 제거.
 *  - fromMonth 같은 항목이 여럿이면 마지막 입력만 유지(나중 입력이 사용자 의도).
 *  - fromMonth 오름차순 정렬.
 *  - 1월부터 시작하는 항목이 없으면 폴백 요율(`fallbackRatePercent`) 로 자동 prepend.
 *  - 모든 항목이 같은 ratePercent 이고 폴백과 동일하면 빈 배열을 돌려 「변경점 없음」으로 폴백 처리(호출 측 분기 단순화).
 */
export type NormalizedFeeRateSegments = ReadonlyArray<{
  /** 1~12 (포함) — 이 달부터 적용. */
  fromMonth: number;
  /** 1~12 (포함) — 이 달까지 적용. */
  toMonth: number;
  /** 적용 요율 % (소수점 1자리 기준). */
  ratePercent: number;
}>;

export function normalizeFeeRateBreakpoints(
  breakpoints: ReadonlyArray<FeeRateBreakpoint> | null | undefined,
  fallbackRatePercent: number,
): ReadonlyArray<FeeRateBreakpoint> {
  if (!Array.isArray(breakpoints) || breakpoints.length === 0) return [];

  const dedup = new Map<number, FeeRateBreakpoint>();
  for (const b of breakpoints) {
    const fm = Math.round(Number(b?.fromMonth));
    const r = Number(b?.ratePercent);
    if (!Number.isFinite(fm) || fm < 1 || fm > 12) continue;
    if (!Number.isFinite(r) || r <= 0 || r > 100) continue;
    const rate = Math.round(r * 10) / 10;
    dedup.set(fm, { fromMonth: fm, ratePercent: rate });
  }

  if (dedup.size === 0) return [];

  if (!dedup.has(1)) {
    /** 1월 시작 항목이 없으면 폴백으로 채워 넣어 「2월부터 X%」 만 입력해도 의미 있게 동작. */
    const safe = Math.max(0.1, Math.min(100, Math.round(fallbackRatePercent * 10) / 10));
    dedup.set(1, { fromMonth: 1, ratePercent: safe });
  }

  const sorted = [...dedup.values()].sort((a, b) => a.fromMonth - b.fromMonth);

  /** 모든 구간 요율이 동일하면 단일 요율과 같은 결과가 나오므로 빈 배열로 폴백. */
  if (sorted.every((s) => Math.abs(s.ratePercent - sorted[0].ratePercent) < 1e-9)) {
    if (Math.abs(sorted[0].ratePercent - Math.round(fallbackRatePercent * 10) / 10) < 1e-9) {
      return [];
    }
  }
  return sorted;
}

/** 정규화된 breakpoints 를 「fromMonth–toMonth–rate」 형태의 비중첩 구간 목록으로 전개. */
export function expandFeeRateSegments(
  normalized: ReadonlyArray<FeeRateBreakpoint>,
): NormalizedFeeRateSegments {
  if (normalized.length === 0) return [];
  return normalized.map((b, i) => {
    const next = normalized[i + 1];
    const toMonth = next ? next.fromMonth - 1 : 12;
    return { fromMonth: b.fromMonth, toMonth, ratePercent: b.ratePercent };
  });
}

/** 1~12 인덱스(0 기반) 의 「그 달 적용 요율」 을 반환 — breakpoints 가 없으면 폴백 요율. */
export function rateForMonthIndex(
  segments: NormalizedFeeRateSegments,
  monthIndex0: number,
  fallbackRatePercent: number,
): number {
  if (segments.length === 0) return fallbackRatePercent;
  const m = monthIndex0 + 1;
  for (const s of segments) {
    if (m >= s.fromMonth && m <= s.toMonth) return s.ratePercent;
  }
  return fallbackRatePercent;
}

export type FeeBillingResult = {
  /** 연 수수료(공급가액, 부가세 미포함) — 12 개월 청구액의 합 */
  annualFee: number;
  /** 1~12 월 청구액 — 공급가액(인덱스 0 = 1월) */
  monthlyFees: WelfareTotalsByMonth;
  /** 산정 base 의 연합 — 「base × rate%」 의 base 부분이 얼마였는지 노출 */
  annualBase: number;
  /** 1~12 월 부가세 — 매월 공급가 × 10% (소수점 절사). 빈 달이면 0. */
  monthlyVat: WelfareTotalsByMonth;
  /** 1~12 월 부가세 포함 청구액 — `monthlyFees[i] + monthlyVat[i]`. */
  monthlyFeesWithVat: WelfareTotalsByMonth;
  /** 연 부가세 합 — 매월 floor 한 합이라 `floor(annualFee × 10%)` 와는 1~11 원 차이가 날 수 있음(매월 청구 정합 우선). */
  annualVat: number;
  /** 연 수수료(부가세 포함) — `annualFee + annualVat`. */
  annualFeeWithVat: number;
  /** 적용된 부가세율(%) — 표시·테스트 편의를 위한 상수 노출. */
  vatRatePercent: number;
  /**
   * 적용된 요율 구간 목록 — 단일 요율(=breakpoints 폴백)이면 길이 1.
   * 대시보드에서 「1~6월 10% / 7~12월 8%」 같은 라벨링에 사용.
   */
  segments: NormalizedFeeRateSegments;
};

/**
 * 사복 운영 수수료 청구액 산정.
 *
 *  - `EVEN_12`: 연 base 합 × 요율 → 12 등분(소수점 절사). 매월 동일 청구액.
 *    잔여 1 원 단위 오차는 12 개월 합과 「연 base × 요율」 사이에 최대 11 원 차이가 날 수 있으나,
 *    회계 실무상 매달 동일 금액 청구가 우선이라 그대로 둔다.
 *  - `ON_PAY_MONTH`: 각 달 base × 요율(소수점 절사). 그 달 base ≤ 0 이면 0 원.
 *  - `YEAR_END_LUMP`: 1~11월 0원, 12월에 연 base × 요율 합을 일시 청구.
 *    수수료 A(선택적복지) 의 고정 정책. breakpoints 가 있으면 「구간 base × 구간 요율」 합을 12월에 모은다.
 *
 * 음수 base 가 들어오면 그대로 0 원으로 클램프(상위 `welfare-totals` 에서도 클램프됨).
 */
export function computeFeeBilling(
  byMonth: WelfareTotalsByMonth,
  ratePercent: number,
  mode: FeeBillingMode,
  breakpoints?: ReadonlyArray<FeeRateBreakpoint> | null,
): FeeBillingResult {
  const safeFallbackRate = Math.max(0, Number(ratePercent) || 0);
  const annualBase = sumWelfareByMonth(byMonth);

  const normalized = normalizeFeeRateBreakpoints(breakpoints, safeFallbackRate);
  const segments: NormalizedFeeRateSegments =
    normalized.length === 0
      ? [{ fromMonth: 1, toMonth: 12, ratePercent: safeFallbackRate }]
      : expandFeeRateSegments(normalized);

  const monthly: number[] = (() => {
    if (mode === "EVEN_12") {
      /**
       * rolling EVEN_12: 각 구간 단위로 「구간 base × 구간 요율」 을 산정해 그 구간의 개월 수에 균등 분배.
       *  - 변동 시점 이전 구간은 영향 없음(이미 청구된 것 그대로).
       *  - 1원 미만 잔여는 그 구간 「첫 달부터」 1원씩 채워 정확히 segFee 와 일치.
       */
      const arr = new Array<number>(12).fill(0);
      for (const seg of segments) {
        const segMonths = seg.toMonth - seg.fromMonth + 1;
        if (segMonths <= 0) continue;
        let segBase = 0;
        for (let m = seg.fromMonth; m <= seg.toMonth; m++) {
          segBase += Math.max(0, Number(byMonth[m - 1]) || 0);
        }
        const ratio = seg.ratePercent / 100;
        const segFee = Math.floor(Math.max(0, segBase) * ratio);
        const each = Math.floor(segFee / segMonths);
        let remainder = segFee - each * segMonths;
        for (let m = seg.fromMonth; m <= seg.toMonth; m++) {
          arr[m - 1] = each + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
        }
      }
      return arr;
    }
    if (mode === "YEAR_END_LUMP") {
      /**
       * 연말 일시 — 모든 구간의 「구간 base × 구간 요율」 을 합산해 12월(인덱스 11) 한 셀에만 배치.
       * 1~11월은 0원. breakpoints 가 비어 있으면 단일 segment(1~12) 가 적용되어 (annualBase × rate) 와 동일.
       */
      const arr = new Array<number>(12).fill(0);
      let totalFee = 0;
      for (const seg of segments) {
        let segBase = 0;
        for (let m = seg.fromMonth; m <= seg.toMonth; m++) {
          segBase += Math.max(0, Number(byMonth[m - 1]) || 0);
        }
        totalFee += Math.floor(Math.max(0, segBase) * (seg.ratePercent / 100));
      }
      arr[11] = totalFee;
      return arr;
    }
    /** ON_PAY_MONTH — 매달 base × (그 달이 속한 구간의 요율). */
    return Array.from({ length: 12 }, (_, i) => {
      const base = Math.max(0, Number(byMonth[i]) || 0);
      const rate = rateForMonthIndex(segments, i, safeFallbackRate);
      return Math.floor(base * (rate / 100));
    });
  })();

  const vatRatio = FEE_VAT_RATE_PERCENT / 100;
  const monthlyVat = monthly.map((v) => Math.floor(v * vatRatio));
  const monthlyFeesWithVat = monthly.map((v, i) => v + monthlyVat[i]);

  let annualFee = 0;
  for (const v of monthly) annualFee += v;
  let annualVat = 0;
  for (const v of monthlyVat) annualVat += v;
  const annualFeeWithVat = annualFee + annualVat;

  return {
    annualFee,
    monthlyFees: monthly.slice(0, 12) as unknown as WelfareTotalsByMonth,
    annualBase,
    monthlyVat: monthlyVat.slice(0, 12) as unknown as WelfareTotalsByMonth,
    monthlyFeesWithVat: monthlyFeesWithVat.slice(0, 12) as unknown as WelfareTotalsByMonth,
    annualVat,
    annualFeeWithVat,
    vatRatePercent: FEE_VAT_RATE_PERCENT,
    segments,
  };
}

/** 청구 방식 한국어 라벨 — 카드·라디오 라벨에 동일하게 사용 */
export function feeBillingModeLabel(mode: FeeBillingMode): string {
  if (mode === "ON_PAY_MONTH") return "지급월 청구";
  if (mode === "YEAR_END_LUMP") return "연말 일시(12월)";
  return "매월 균등(÷12)";
}
