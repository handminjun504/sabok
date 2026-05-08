/**
 * fee-billing 도메인 회귀 테스트.
 *
 * 검증 포인트
 *  1. `defaultFeeRate` — 거래처 구분에 따라 INDIVIDUAL=10 / CORPORATE=2.
 *  2. `resolveFeeRate` — 입력값이 비거나 범위 밖이면 디폴트로 폴백.
 *  3. `computeFeeBilling`
 *     - EVEN_12: 연 base × 요율 ÷ 12 → 12개월 합과 정확히 일치(잔여 1원 분배)
 *     - ON_PAY_MONTH: 그 달 base × 요율, base ≤ 0 인 달은 0원
 *     - YEAR_END_LUMP: 1~11월 0원, 12월에 연 합계 일시 (수수료 A 전용 정책)
 *  4. `welfare-totals` 의 base 계산 — 「+ 반환 추가」 카테고리 합이 base A 에서 차감되는지.
 *  5. `feeBillingModeLabel` — 3개 모드 라벨링 정확성.
 */

import {
  FEE_VAT_RATE_PERCENT,
  buildFeeBaseEmployeeOverridesForYear,
  computeFeeBilling,
  defaultFeeRate,
  expandFeeRateSegments,
  feeBillingModeLabel,
  normalizeFeeRateBreakpoints,
  rateForMonthIndex,
  resolveFeeRate,
} from "../src/lib/domain/fee-billing";
import type { WelfareTotalsByMonth } from "../src/lib/domain/welfare-totals";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

console.log("=== 사복 운영 수수료 산정 회귀 ===\n");

check("defaultFeeRate(INDIVIDUAL) = 10", defaultFeeRate("INDIVIDUAL"), 10);
check("defaultFeeRate(CORPORATE) = 2", defaultFeeRate("CORPORATE"), 2);

check("resolveFeeRate(null, INDIVIDUAL) → 10", resolveFeeRate(null, "INDIVIDUAL"), 10);
check("resolveFeeRate(null, CORPORATE) → 2", resolveFeeRate(null, "CORPORATE"), 2);
check("resolveFeeRate(0, INDIVIDUAL) → 10 (폴백)", resolveFeeRate(0, "INDIVIDUAL"), 10);
check("resolveFeeRate(150, CORPORATE) → 2 (폴백)", resolveFeeRate(150, "CORPORATE"), 2);
check("resolveFeeRate(2.5, CORPORATE) → 2.5", resolveFeeRate(2.5, "CORPORATE"), 2.5);

const allEqual: WelfareTotalsByMonth = [
  1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000,
  1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000,
] as const;

const evenIndividual = computeFeeBilling(allEqual, 10, "EVEN_12");
check("EVEN_12 · 연 base 12,000,000 × 10% → 1,200,000", evenIndividual.annualFee, 1_200_000);
check(
  "EVEN_12 · 12개월 합 = annualFee",
  evenIndividual.monthlyFees.reduce((s, v) => s + v, 0),
  evenIndividual.annualFee,
);
check("EVEN_12 · 매월 균등 100,000 (12 등분)", evenIndividual.monthlyFees[0], 100_000);

/** 잔여 1원 분배 검증 — 12,345,678 × 10% = 1,234,567 → 12 등분 시 102,880 + 잔여 18 원 */
const allEqualOdd: WelfareTotalsByMonth = [
  1_028_807, 1_028_807, 1_028_807, 1_028_807, 1_028_807, 1_028_807,
  1_028_807, 1_028_807, 1_028_807, 1_028_807, 1_028_807, 1_028_809,
] as const;
const evenOdd = computeFeeBilling(allEqualOdd, 10, "EVEN_12");
check(
  "EVEN_12 · 잔여 분배 후 12개월 합 = annualFee",
  evenOdd.monthlyFees.reduce((s, v) => s + v, 0),
  evenOdd.annualFee,
);
/** 잔여는 1월부터 분배되므로 1월 ≥ 12월 */
check(
  "EVEN_12 · 잔여 1원 분배는 1월부터 채워짐",
  evenOdd.monthlyFees[0] >= evenOdd.monthlyFees[11],
  true,
);

/** ON_PAY_MONTH — 일부 달만 base 양수 */
const sparse: WelfareTotalsByMonth = [
  0, 1_000_000, 0, 0, 2_000_000, 0,
  0, 0, 500_000, 0, 0, 0,
] as const;
const onPay = computeFeeBilling(sparse, 10, "ON_PAY_MONTH");
check("ON_PAY_MONTH · 1월 (base 0) → 0", onPay.monthlyFees[0], 0);
check("ON_PAY_MONTH · 2월 (base 1,000,000) → 100,000", onPay.monthlyFees[1], 100_000);
check("ON_PAY_MONTH · 5월 (base 2,000,000) → 200,000", onPay.monthlyFees[4], 200_000);
check("ON_PAY_MONTH · 9월 (base 500,000) → 50,000", onPay.monthlyFees[8], 50_000);
check(
  "ON_PAY_MONTH · 연 합계 = 350,000",
  onPay.annualFee,
  350_000,
);

/** 법인 2% — 연 base 1,200만 × 2% = 240,000 */
const corp = computeFeeBilling(allEqual, 2, "EVEN_12");
check("법인(EVEN_12) · 연 240,000 / 매월 20,000", corp.annualFee, 240_000);
check("법인(EVEN_12) · 12개월 동일 20,000", corp.monthlyFees[6], 20_000);

/** 음수 base 클램프 — 비정상 입력 보호 */
const negative: WelfareTotalsByMonth = [
  -100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1_000_000,
] as const;
const negFee = computeFeeBilling(negative, 10, "ON_PAY_MONTH");
check(
  "ON_PAY_MONTH · 음수 base 는 0 원 청구",
  negFee.monthlyFees[0],
  0,
);
check(
  "ON_PAY_MONTH · 음수 + 양수 → 양수 base 만 반영",
  negFee.annualFee,
  100_000,
);

console.log("\n=== 부가세 10% — 공급가/부가세/포함액 노출 ===");

check("VAT 상수 10", FEE_VAT_RATE_PERCENT, 10);
check("EVEN_12 · vatRatePercent 노출", evenIndividual.vatRatePercent, 10);

/** EVEN_12, 매월 100,000 → VAT 10,000, 포함액 110,000 (소수점 절사 없음) */
check(
  "EVEN_12 · 매월 VAT = floor(공급가 × 10%) = 10,000",
  evenIndividual.monthlyVat[0],
  10_000,
);
check(
  "EVEN_12 · 매월 포함액 = 110,000",
  evenIndividual.monthlyFeesWithVat[0],
  110_000,
);
check(
  "EVEN_12 · 연 VAT = 매월 VAT 합 = 120,000",
  evenIndividual.annualVat,
  120_000,
);
check(
  "EVEN_12 · 연 포함액 = annualFee + annualVat = 1,320,000",
  evenIndividual.annualFeeWithVat,
  1_320_000,
);
check(
  "EVEN_12 · 12개월 포함액 합 = annualFeeWithVat",
  evenIndividual.monthlyFeesWithVat.reduce((s, v) => s + v, 0),
  evenIndividual.annualFeeWithVat,
);

/** ON_PAY_MONTH, sparse → 각 달 base × 10% × 1.1 */
check(
  "ON_PAY_MONTH · 1월 (공급가 0) → VAT 0",
  onPay.monthlyVat[0],
  0,
);
check(
  "ON_PAY_MONTH · 2월 (공급가 100,000) → VAT 10,000",
  onPay.monthlyVat[1],
  10_000,
);
check(
  "ON_PAY_MONTH · 5월 (공급가 200,000) → 포함액 220,000",
  onPay.monthlyFeesWithVat[4],
  220_000,
);
check(
  "ON_PAY_MONTH · 연 VAT = 35,000",
  onPay.annualVat,
  35_000,
);
check(
  "ON_PAY_MONTH · 연 포함액 = 385,000",
  onPay.annualFeeWithVat,
  385_000,
);

/** 부가세 절사 검증 — 공급가 7원이면 VAT floor(7 × 0.1) = 0 (1원 미만 절사) */
const tinyBase: WelfareTotalsByMonth = [
  70, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
] as const;
const tinyFee = computeFeeBilling(tinyBase, 10, "ON_PAY_MONTH");
check(
  "절사 · 공급가 7원 → VAT floor(0.7) = 0",
  tinyFee.monthlyVat[0],
  0,
);
check(
  "절사 · 공급가 7원 + VAT 0 → 포함액 7원",
  tinyFee.monthlyFeesWithVat[0],
  7,
);

/** 잔여 분배 후 12개월 합 = annualFee 인 경우, 포함액 합도 동일 항등성 보장 */
check(
  "EVEN_12 잔여분배 · 12개월 포함액 합 = annualFeeWithVat",
  evenOdd.monthlyFeesWithVat.reduce((s, v) => s + v, 0),
  evenOdd.annualFeeWithVat,
);

/** 「+ 반환 추가」 차감 — welfare-totals 의 base A 식: schedule + optional - repReturn - customReturns */
import { computeWelfareTotalsForYear } from "../src/lib/domain/welfare-totals";
import type {
  CompanySettings,
  Employee,
  Level5Override,
  LevelPaymentRule,
  MonthlyEmployeeNote,
  QuarterlyEmployeeConfig,
} from "../src/types/models";

const fakeEmployee: Employee = {
  id: "emp1",
  tenantId: "t",
  employeeCode: "A001",
  name: "홍길동",
  position: "사원",
  hireMonth: 1,
  level: 1,
  baseSalary: 50_000_000,
  adjustedSalary: 50_000_000,
  resignYear: null,
  resignMonth: null,
  flagPayWelfareOnResignMonth: false,
  flagWelfareIneligible: false,
  flagRepReturn: false,
  flagSpouseReceipt: false,
  flagAutoAmount: false,
  flagSubsidyChild: false,
  flagSubsidyHealth: false,
  flagSubsidyHousingInterest: false,
  flagSubsidyHousingRent: false,
  flagSubsidyParent: false,
  parentSupportEnabled: false,
  parentSupportSpec: null,
  yearOfBirth: 1980,
  insuranceCarrier: null,
  insurerLast4: null,
  bankAccountLast4: null,
  bankName: null,
  memo: null,
  /** 임의로 빈 값을 채워 타입만 만족시키는 mock — 본 테스트는 base A 차감 산식만 검증한다. */
} as unknown as Employee;

const fakeSettings: CompanySettings = {
  id: "s",
  tenantId: "t",
  foundingMonth: 1,
  defaultPayDay: 25,
  activeYear: 2026,
  salaryInclusionVarianceMode: "BOTH",
  surveyShowRepReturn: true,
  repReturnSchedule: { emp1: { "3": 100_000 } },
  surveyShowSpouseReceipt: false,
  spouseReceiptSchedule: null,
  surveyShowWorkerNet: false,
  discretionarySchedule: null,
  customReturnsSchedule: {
    categories: [
      { key: "r_a", label: "경조금 반환", byEmployeeMonth: { emp1: { "5": 200_000 } } },
      { key: "r_b", label: "기타 반환", byEmployeeMonth: { emp1: { "5": 50_000 } } },
    ],
  },
  paymentEventDefs: null,
  reserveProgressNote: null,
  fixedEventMonths: null,
  quarterlyPayMonths: null,
  vendorWelfareApplied: null,
  vendorWelfareRatio: null,
  incentiveNetRatioPercent: null,
  feeRatePercent: null,
  feeBillingMode: "EVEN_12",
  feeRateBreakpoints: null,
};

const totals = computeWelfareTotalsForYear({
  employees: [fakeEmployee],
  year: 2026,
  settings: fakeSettings,
  rules: [] as LevelPaymentRule[],
  overrides: [] as Level5Override[],
  quarterly: [] as QuarterlyEmployeeConfig[],
  notes: [] as MonthlyEmployeeNote[],
});
check(
  "welfare-totals · 3월 repReturnByMonth = 100,000",
  totals.repReturnByMonth[2],
  100_000,
);
check(
  "welfare-totals · 5월 customReturnsByMonth = 250,000 (전 카테고리 합)",
  totals.customReturnsByMonth[4],
  250_000,
);
/**
 * Fee A base 는 「선택적복지 만」 — 노트 미설정이면 0.
 * 대표반환·사용자 정의 반환은 base 에 영향 없음(표시 전용).
 */
check(
  "welfare-totals · base A = optional only (3월=0)",
  totals.baseAOptionalOnlyByMonth[2],
  0,
);
check(
  "welfare-totals · base A = optional only (5월=0, 반환만 있어도 base 가 0 유지)",
  totals.baseAOptionalOnlyByMonth[4],
  0,
);
check(
  "welfare-totals · base A 항등성 — optionalByMonth 와 동일 객체 의미값",
  totals.baseAOptionalOnlyByMonth,
  totals.optionalByMonth,
);
check(
  "welfare-totals · base B 는 schedule 만 (모두 0)",
  totals.baseBScheduleOnlyByMonth.every((v) => v === 0),
  true,
);

console.log("\n=== welfare-totals: 선택적복지 입력이 있을 때 base A 가 그 값 그대로 ===");

const totalsWithOptional = computeWelfareTotalsForYear({
  employees: [fakeEmployee],
  year: 2026,
  settings: fakeSettings,
  rules: [] as LevelPaymentRule[],
  overrides: [] as Level5Override[],
  quarterly: [] as QuarterlyEmployeeConfig[],
  /**
   * 선택적복지 — 4월에 emp1 이 300,000원 입력. 같은 4월에 대표반환 0, 커스텀 반환 0.
   * 새 정책에서 base A = optional 그대로 → 300,000 이어야 한다(반환은 base 에 영향 없음).
   */
  notes: [
    {
      id: "n1",
      employeeId: "emp1",
      year: 2026,
      month: 4,
      tenantId: "t",
      monthlyPayAmount: null,
      quarterlyPayAmount: null,
      welfareOverrideAmount: null,
      optionalExtraAmount: 300_000,
      memo: null,
      createdAt: null,
      updatedAt: null,
    } as unknown as MonthlyEmployeeNote,
  ],
});
check(
  "welfare-totals · 4월 optionalByMonth = 300,000",
  totalsWithOptional.optionalByMonth[3],
  300_000,
);
check(
  "welfare-totals · 4월 base A = 선택적복지 그대로 (300,000)",
  totalsWithOptional.baseAOptionalOnlyByMonth[3],
  300_000,
);
check(
  "welfare-totals · 5월 base A — customReturn 250k 이 차감되지 않음(여전히 0)",
  totalsWithOptional.baseAOptionalOnlyByMonth[4],
  0,
);

console.log("\n=== 수수료 변경점(breakpoints) — 정규화 / rolling EVEN_12 / ON_PAY_MONTH 월별 요율 ===");

/** 정규화 — 1월 항목 자동 prepend, fromMonth 정렬, 같은 fromMonth 마지막 입력 유지 */
check(
  "normalize · 빈 배열 → []",
  normalizeFeeRateBreakpoints([], 10),
  [],
);
check(
  "normalize · 단일 요율과 동일하면 [] 폴백",
  normalizeFeeRateBreakpoints([{ fromMonth: 1, ratePercent: 10 }], 10),
  [],
);
check(
  "normalize · 1월 누락이면 fallback 으로 prepend",
  normalizeFeeRateBreakpoints([{ fromMonth: 7, ratePercent: 8 }], 10),
  [
    { fromMonth: 1, ratePercent: 10 },
    { fromMonth: 7, ratePercent: 8 },
  ],
);
check(
  "normalize · 같은 fromMonth 가 둘이면 마지막 입력 유지",
  normalizeFeeRateBreakpoints(
    [
      { fromMonth: 7, ratePercent: 8 },
      { fromMonth: 7, ratePercent: 6 },
      { fromMonth: 1, ratePercent: 10 },
    ],
    10,
  ),
  [
    { fromMonth: 1, ratePercent: 10 },
    { fromMonth: 7, ratePercent: 6 },
  ],
);
check(
  "normalize · fromMonth 범위 외(0/13)·ratePercent 0/200 은 제거",
  normalizeFeeRateBreakpoints(
    [
      { fromMonth: 0, ratePercent: 10 } as unknown as { fromMonth: number; ratePercent: number },
      { fromMonth: 13, ratePercent: 10 } as unknown as { fromMonth: number; ratePercent: number },
      { fromMonth: 7, ratePercent: 0 } as unknown as { fromMonth: number; ratePercent: number },
      { fromMonth: 9, ratePercent: 200 } as unknown as { fromMonth: number; ratePercent: number },
      { fromMonth: 5, ratePercent: 8 },
    ],
    10,
  ),
  [
    { fromMonth: 1, ratePercent: 10 },
    { fromMonth: 5, ratePercent: 8 },
  ],
);

const segs = expandFeeRateSegments(
  normalizeFeeRateBreakpoints(
    [
      { fromMonth: 1, ratePercent: 10 },
      { fromMonth: 4, ratePercent: 8 },
      { fromMonth: 9, ratePercent: 5 },
    ],
    10,
  ),
);
check("expand · 3 구간으로 확장 (1-3 / 4-8 / 9-12)", segs, [
  { fromMonth: 1, toMonth: 3, ratePercent: 10 },
  { fromMonth: 4, toMonth: 8, ratePercent: 8 },
  { fromMonth: 9, toMonth: 12, ratePercent: 5 },
]);

check("rateForMonthIndex · 2월 → 10%", rateForMonthIndex(segs, 1, 999), 10);
check("rateForMonthIndex · 4월 → 8%", rateForMonthIndex(segs, 3, 999), 8);
check("rateForMonthIndex · 9월 → 5%", rateForMonthIndex(segs, 8, 999), 5);
check("rateForMonthIndex · 12월 → 5%", rateForMonthIndex(segs, 11, 999), 5);
check("rateForMonthIndex · 빈 segments → fallback", rateForMonthIndex([], 5, 999), 999);

/** EVEN_12 with breakpoints — 1~6월 base 600만 × 10% / 6 = 10만, 7~12월 base 1200만 × 5% / 6 = 10만 */
const baseSplit = [
  1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000,
  2_000_000, 2_000_000, 2_000_000, 2_000_000, 2_000_000, 2_000_000,
] as const as WelfareTotalsByMonth;
const splitFee = computeFeeBilling(
  baseSplit,
  10,
  "EVEN_12",
  [
    { fromMonth: 1, ratePercent: 10 },
    { fromMonth: 7, ratePercent: 5 },
  ],
);
check("EVEN_12 + breakpoint · 1~6월 매월 100,000", splitFee.monthlyFees[0], 100_000);
check("EVEN_12 + breakpoint · 6월 100,000 (구간 종료)", splitFee.monthlyFees[5], 100_000);
check("EVEN_12 + breakpoint · 7월 100,000 (5% 적용)", splitFee.monthlyFees[6], 100_000);
check("EVEN_12 + breakpoint · 12월 100,000", splitFee.monthlyFees[11], 100_000);
check("EVEN_12 + breakpoint · 연 합계 = 1,200,000", splitFee.annualFee, 1_200_000);
check(
  "EVEN_12 + breakpoint · segments 길이 = 2",
  splitFee.segments.length,
  2,
);
check(
  "EVEN_12 + breakpoint · segments[0] = 1~6 / 10%",
  splitFee.segments[0],
  { fromMonth: 1, toMonth: 6, ratePercent: 10 },
);
check(
  "EVEN_12 + breakpoint · segments[1] = 7~12 / 5%",
  splitFee.segments[1],
  { fromMonth: 7, toMonth: 12, ratePercent: 5 },
);

/** EVEN_12 + breakpoint, base 가 후반에 0 인 경우 — 잔여 base 0 → 후반 청구 0 */
const baseFrontLoaded = [
  1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000,
  0, 0, 0, 0, 0, 0,
] as const as WelfareTotalsByMonth;
const frontFee = computeFeeBilling(
  baseFrontLoaded,
  10,
  "EVEN_12",
  [
    { fromMonth: 1, ratePercent: 10 },
    { fromMonth: 7, ratePercent: 5 },
  ],
);
check("EVEN_12 + breakpoint · 후반 구간 base 0 → 7~12월 매월 0", frontFee.monthlyFees[6], 0);
check("EVEN_12 + breakpoint · 후반 구간 base 0 → 12월 0", frontFee.monthlyFees[11], 0);
check("EVEN_12 + breakpoint · 1~6월만 60만 합계 (10% 분배)", frontFee.annualFee, 600_000);

/** ON_PAY_MONTH + breakpoint — 매월 base × 그 달 요율 */
const onPayBp = computeFeeBilling(
  [
    1_000_000, 0, 0, 0, 0, 0,
    1_000_000, 0, 0, 0, 0, 0,
  ] as unknown as WelfareTotalsByMonth,
  10,
  "ON_PAY_MONTH",
  [
    { fromMonth: 1, ratePercent: 10 },
    { fromMonth: 7, ratePercent: 5 },
  ],
);
check("ON_PAY_MONTH + breakpoint · 1월 (10%) → 100,000", onPayBp.monthlyFees[0], 100_000);
check("ON_PAY_MONTH + breakpoint · 7월 (5%) → 50,000", onPayBp.monthlyFees[6], 50_000);
check("ON_PAY_MONTH + breakpoint · 연 합계 = 150,000", onPayBp.annualFee, 150_000);

/** breakpoint 가 없으면 기존 단일 요율 동작과 정확히 동일해야 함 (회귀 보호) */
const same1 = computeFeeBilling(allEqual, 10, "EVEN_12");
const same2 = computeFeeBilling(allEqual, 10, "EVEN_12", null);
const same3 = computeFeeBilling(allEqual, 10, "EVEN_12", []);
const same4 = computeFeeBilling(allEqual, 10, "EVEN_12", [{ fromMonth: 1, ratePercent: 10 }]);
check("회귀 · breakpoints null vs 미전달 동일", same1.annualFee, same2.annualFee);
check("회귀 · breakpoints [] vs 미전달 동일", same1.annualFee, same3.annualFee);
check(
  "회귀 · 단일 1월 항목(요율 동일) vs 미전달 동일",
  same1.annualFee,
  same4.annualFee,
);
check(
  "회귀 · 미전달 segments = [{1, 12, 10%}]",
  same1.segments,
  [{ fromMonth: 1, toMonth: 12, ratePercent: 10 }],
);

/** 부가세는 매월 floor 정책 그대로 작동 — breakpoint 가 있어도 동일 */
check(
  "EVEN_12 + breakpoint · 매월 VAT = floor(공급가 × 10%)",
  splitFee.monthlyVat[0],
  10_000,
);
check(
  "EVEN_12 + breakpoint · 12개월 VAT 합 = annualVat",
  splitFee.monthlyVat.reduce((s, v) => s + v, 0),
  splitFee.annualVat,
);
check(
  "EVEN_12 + breakpoint · 12개월 포함액 합 = annualFeeWithVat",
  splitFee.monthlyFeesWithVat.reduce((s, v) => s + v, 0),
  splitFee.annualFeeWithVat,
);

/* ────────────────────────────────────────────────────────────────────────────
 * YEAR_END_LUMP — 수수료 A 의 「연말 12월 일시 청구」 정책 회귀
 * ──────────────────────────────────────────────────────────────────────────── */
console.log("\n=== YEAR_END_LUMP — 연말 12월 일시 청구 ===");

const lumpFlat = computeFeeBilling(allEqual, 10, "YEAR_END_LUMP");
check("YEAR_END_LUMP · 연 base 12,000,000 × 10% → annualFee 1,200,000", lumpFlat.annualFee, 1_200_000);
check("YEAR_END_LUMP · 1월 0원", lumpFlat.monthlyFees[0], 0);
check("YEAR_END_LUMP · 6월 0원", lumpFlat.monthlyFees[5], 0);
check("YEAR_END_LUMP · 11월 0원", lumpFlat.monthlyFees[10], 0);
check("YEAR_END_LUMP · 12월 = annualFee (1,200,000)", lumpFlat.monthlyFees[11], 1_200_000);
check(
  "YEAR_END_LUMP · 1~11월 합 = 0",
  lumpFlat.monthlyFees.slice(0, 11).reduce((s, v) => s + v, 0),
  0,
);
check(
  "YEAR_END_LUMP · 12개월 합 = annualFee (회계 정합)",
  lumpFlat.monthlyFees.reduce((s, v) => s + v, 0),
  lumpFlat.annualFee,
);
check("YEAR_END_LUMP · annualBase = 12,000,000", lumpFlat.annualBase, 12_000_000);

/** VAT — 12월 한 셀에서만 발생, 1~11월 VAT 0 */
check("YEAR_END_LUMP · VAT 12월 = floor(1,200,000 × 10%) = 120,000", lumpFlat.monthlyVat[11], 120_000);
check("YEAR_END_LUMP · VAT 1월 0", lumpFlat.monthlyVat[0], 0);
check("YEAR_END_LUMP · VAT 11월 0", lumpFlat.monthlyVat[10], 0);
check(
  "YEAR_END_LUMP · annualVat = 12개월 VAT 합 = 120,000",
  lumpFlat.annualVat,
  120_000,
);
check(
  "YEAR_END_LUMP · annualFeeWithVat = 1,200,000 + 120,000",
  lumpFlat.annualFeeWithVat,
  1_320_000,
);
check(
  "YEAR_END_LUMP · 12월 부가세 포함액 = 1,320,000",
  lumpFlat.monthlyFeesWithVat[11],
  1_320_000,
);

/** 사복 미발생(전 연도 base 0) → 12월도 0 */
const lumpZero = computeFeeBilling(
  Array.from({ length: 12 }, () => 0) as unknown as WelfareTotalsByMonth,
  10,
  "YEAR_END_LUMP",
);
check("YEAR_END_LUMP · base 전부 0 → 12월 0", lumpZero.monthlyFees[11], 0);
check("YEAR_END_LUMP · base 전부 0 → annualFee 0", lumpZero.annualFee, 0);
check("YEAR_END_LUMP · base 전부 0 → annualVat 0", lumpZero.annualVat, 0);

/** breakpoint 와 결합 — 구간별 「base × rate」 합이 12월 한 셀에 모임 */
const lumpBp = computeFeeBilling(
  baseSplit,
  10,
  "YEAR_END_LUMP",
  [
    { fromMonth: 1, ratePercent: 10 },
    { fromMonth: 7, ratePercent: 5 },
  ],
);
/** 1~6월 base 6,000,000 × 10% = 600,000, 7~12월 base 12,000,000 × 5% = 600,000 → 합 1,200,000 */
check("YEAR_END_LUMP + breakpoint · 12월 = 구간 합 (600k + 600k)", lumpBp.monthlyFees[11], 1_200_000);
check("YEAR_END_LUMP + breakpoint · 1~11월 모두 0", lumpBp.monthlyFees.slice(0, 11).every((v) => v === 0), true);
check("YEAR_END_LUMP + breakpoint · annualFee = 1,200,000", lumpBp.annualFee, 1_200_000);
check(
  "YEAR_END_LUMP + breakpoint · segments 보존 (구간 시각화용)",
  lumpBp.segments.length,
  2,
);

/** 단일 요율 vs breakpoint 동치 케이스 — 동일 요율 1개 변경점은 빈 배열로 폴백 */
const lumpEquiv = computeFeeBilling(allEqual, 10, "YEAR_END_LUMP", [
  { fromMonth: 1, ratePercent: 10 },
]);
check(
  "YEAR_END_LUMP · 단일 1월 항목(요율 동일) vs 미전달 동일",
  lumpEquiv.annualFee,
  lumpFlat.annualFee,
);

/** YEAR_END_LUMP 는 EVEN_12 / ON_PAY_MONTH 와 「연 합계」 가 동일해야 한다(같은 base × 같은 요율). */
const evenForCompare = computeFeeBilling(allEqual, 10, "EVEN_12");
const onPayForCompare = computeFeeBilling(allEqual, 10, "ON_PAY_MONTH");
check(
  "YEAR_END_LUMP · 연 합계는 EVEN_12 와 동일 (base 동일, 요율 동일)",
  lumpFlat.annualFee,
  evenForCompare.annualFee,
);
check(
  "YEAR_END_LUMP · 연 합계는 ON_PAY_MONTH 와 동일 (base 동일, 요율 동일)",
  lumpFlat.annualFee,
  onPayForCompare.annualFee,
);

/** 라벨 검증 */
check("feeBillingModeLabel(EVEN_12) = 매월 균등(÷12)", feeBillingModeLabel("EVEN_12"), "매월 균등(÷12)");
check("feeBillingModeLabel(ON_PAY_MONTH) = 지급월 청구", feeBillingModeLabel("ON_PAY_MONTH"), "지급월 청구");
check("feeBillingModeLabel(YEAR_END_LUMP) = 연말 일시(12월)", feeBillingModeLabel("YEAR_END_LUMP"), "연말 일시(12월)");

/* ────────────────────────────────────────────────────────────────────────────
 * 수수료 base 동결 — 연중 퇴사로 줄지 않도록 12개월 풀 시뮬레이션
 * ──────────────────────────────────────────────────────────────────────────── */
console.log("\n=== 수수료 base 동결 helper (buildFeeBaseEmployeeOverridesForYear) ===");

type EmpForFee = { id: string; resignMonth: number | null; resignYear: number | null };

const fb1 = buildFeeBaseEmployeeOverridesForYear<EmpForFee>(
  [
    { id: "a", resignMonth: 7, resignYear: 2026 },
    { id: "b", resignMonth: null, resignYear: null },
    { id: "c", resignMonth: 12, resignYear: 2025 },
    { id: "d", resignMonth: null, resignYear: 2024 },
    { id: "e", resignMonth: null, resignYear: 2027 },
  ],
  2026,
);
check("동결 · 활성 연도 전 퇴사자(c, d) 는 제외 — 길이 3", fb1.length, 3);
check("동결 · 남은 직원 ID = [a, b, e]", fb1.map((x) => x.id), ["a", "b", "e"]);
check(
  "동결 · 모든 남은 직원의 resignMonth 가 null 로 무력화",
  fb1.every((x) => x.resignMonth == null),
  true,
);
check(
  "동결 · 모든 남은 직원의 resignYear 가 null 로 무력화",
  fb1.every((x) => x.resignYear == null),
  true,
);

const fb2 = buildFeeBaseEmployeeOverridesForYear<EmpForFee>(
  [
    { id: "x", resignMonth: null, resignYear: null },
    { id: "y", resignMonth: 6, resignYear: 2026 },
  ],
  2026,
);
check("동결 · 미퇴사 직원도 사본화(원본 변형 X)", fb2.length, 2);

/** 원본 보존 — 사본이지 mutate 하지 않는다. */
const original: EmpForFee[] = [
  { id: "z", resignMonth: 4, resignYear: 2026 },
];
const derived = buildFeeBaseEmployeeOverridesForYear(original, 2026);
check("동결 · 원본 직원 객체는 mutate 되지 않음 (resignMonth 보존)", original[0].resignMonth, 4);
check("동결 · 원본 직원 객체는 mutate 되지 않음 (resignYear 보존)", original[0].resignYear, 2026);
check("동결 · 사본은 새 객체 — 참조 비교 X", derived[0] === original[0], false);

/** 빈 입력 / 모두 활성 연도 전 퇴사 → 빈 배열 */
check(
  "동결 · 빈 입력 → 빈 배열",
  buildFeeBaseEmployeeOverridesForYear<EmpForFee>([], 2026).length,
  0,
);
check(
  "동결 · 모두 이전 퇴사자 → 빈 배열",
  buildFeeBaseEmployeeOverridesForYear<EmpForFee>(
    [
      { id: "a", resignMonth: 5, resignYear: 2024 },
      { id: "b", resignMonth: 12, resignYear: 2025 },
    ],
    2026,
  ).length,
  0,
);

/**
 * 통합 시나리오 — 두 직원이 사복기준 동등하게 발생하는 단일 노트 입력에서, 한 직원이 활성 연도 중 퇴사할 때
 * 「실 집행 base」(active 가드 적용) vs 「수수료 base」(동결 사본) 의 차이를 직관적으로 검증.
 *
 * 노트는 직원 status 와 무관하게 합산되므로 base A(선택적복지) 는 동결과 무관하게 동일.
 * 본 helper 는 base B(정기·분기) 의 산출에 차이를 만든다 — 정기·분기는 `welfare-totals` 가 status 가드 적용.
 *
 * 여기서는 helper 의 호출 결과 자체만 단위 검증한다(통합은 dashboard 페이지에서 enforced).
 */
const integrationEmps = buildFeeBaseEmployeeOverridesForYear<EmpForFee>(
  [
    { id: "alpha", resignMonth: 6, resignYear: 2026 },
    { id: "beta", resignMonth: null, resignYear: null },
  ],
  2026,
);
check("통합 · 연중 퇴사자 + 미퇴사자 = 각각 풀로 잡힘 (length=2)", integrationEmps.length, 2);
check(
  "통합 · alpha 의 resignMonth 가 무력화돼 12개월 풀로 잡힘",
  integrationEmps.find((x) => x.id === "alpha")?.resignMonth,
  null,
);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
