/**
 * fee-billing 도메인 회귀 테스트.
 *
 * 검증 포인트
 *  1. `defaultFeeRate` — 거래처 구분에 따라 INDIVIDUAL=10 / CORPORATE=2.
 *  2. `resolveFeeRate` — 입력값이 비거나 범위 밖이면 디폴트로 폴백.
 *  3. `computeFeeBilling`
 *     - EVEN_12: 연 base × 요율 ÷ 12 → 12개월 합과 정확히 일치(잔여 1원 분배)
 *     - ON_PAY_MONTH: 그 달 base × 요율, base ≤ 0 인 달은 0원
 *  4. `welfare-totals` 의 base 계산 — 「+ 반환 추가」 카테고리 합이 base A 에서 차감되는지.
 */

import {
  computeFeeBilling,
  defaultFeeRate,
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
/** 정기·분기 규칙이 없으므로 schedule = 0. 노트도 없으니 optional = 0. base A = 0 - 100k(3월) - 250k(5월) → 모두 0 클램프 */
check(
  "welfare-totals · base A 음수 클램프 (3월=0)",
  totals.baseAWithOptionalByMonth[2],
  0,
);
check(
  "welfare-totals · base A 음수 클램프 (5월=0)",
  totals.baseAWithOptionalByMonth[4],
  0,
);
check(
  "welfare-totals · base B 는 schedule 만 (모두 0)",
  totals.baseBScheduleOnlyByMonth.every((v) => v === 0),
  true,
);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
