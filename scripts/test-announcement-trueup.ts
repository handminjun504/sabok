/**
 * announcement-trueup 도메인 단위 테스트.
 *
 * 핵심 회귀: 2026-05 사용자 예시(김남규 원장님)의 숫자를 그대로 재현해 차액 2,582,400 이 나오는지.
 *
 *   낮춘 급여 = (base − adj)/12 × 5 = 140만 × 5 = 7,000,000
 *   인센 누적 = 2,982,400
 *   사복 지급 누적 = 6,000,000
 *   주4일 차감 = 1,000,000
 *   차액 = 7,000,000 + 2,982,400 − 6,000,000 − 1,000,000 = 2,982,400  ❌ 사용자 예시는 2,582,400
 *
 * 사용자 예시 식을 분해해 보면:
 *   [지급] 낮춘급여 7,000,000 + 인센 2,982,400 = 9,982,400  ← 사용자 본문엔 9,582,400 으로 표기
 *   합계 표기에서 9,582,400 는 7,000,000 + 2,582,400 으로도 맞춰지지만 인센 합과 충돌.
 *
 * 결과: 본문의 「9,582,400」 표기는 작성자의 산술 표기 오류로 보이고, 우리 도메인 함수는
 *   (7,000,000 + 2,982,400) − (6,000,000 + 1,000,000) = 2,982,400 으로 정확히 계산한다.
 * 이 테스트는 도메인 로직의 일관성을 가드 — 향후 사용자 표기와 동일한 차액이 필요해지면
 * 정책 재논의 후 변경.
 */

import {
  computeAnnouncementTrueUpDetail,
  formatAnnouncementTrueUpBreakdownLine,
} from "../src/lib/domain/announcement-trueup";

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

const empBase = {
  baseSalary: 64_800_000, // 월 540만
  adjustedSalary: 48_000_000, // 월 400만, 차액 140만
  salaryTrueUpDeductionWon: 1_000_000,
  salaryTrueUpDeductionMemo: "주 4일 근무 차감분 (125만원 → 세후)",
} as const;

console.log("=== 사용자 예시(김남규 원장) — 5월 퇴사 + 사복 OFF ===\n");

const r = computeAnnouncementTrueUpDetail({
  employee: empBase,
  activeMonthsCount: 5,
  incentiveAccrualYtdWon: 2_982_400,
  welfarePaidYtdWon: 6_000_000,
});
check("낮춘급여 누적 = 7,000,000", r.loweredSalaryAccumulatedWon, 7_000_000);
check("인센 누적 = 2,982,400", r.incentiveAccrualYtdWon, 2_982_400);
check("사복 지급 누적 = 6,000,000", r.welfarePaidYtdWon, 6_000_000);
check("수동 차감 = 1,000,000", r.manualDeductionWon, 1_000_000);
check("메모 보존", r.deductionMemo, "주 4일 근무 차감분 (125만원 → 세후)");
check("차액 = 2,982,400 (도메인 일관)", r.trueUpWon, 2_982_400);

console.log("\n=== 음수 차액은 0 으로 클램프 ===\n");
const rNeg = computeAnnouncementTrueUpDetail({
  employee: { ...empBase, salaryTrueUpDeductionWon: 50_000_000 },
  activeMonthsCount: 5,
  incentiveAccrualYtdWon: 0,
  welfarePaidYtdWon: 0,
});
check("매우 큰 차감 → 차액 0 클램프", rNeg.trueUpWon, 0);

console.log("\n=== adjusted ≥ base 또는 비어 있음 → 낮춘급여 0 ===\n");
check(
  "adjusted=0 → 낮춘급여 0",
  computeAnnouncementTrueUpDetail({
    employee: { baseSalary: 64_800_000, adjustedSalary: 0, salaryTrueUpDeductionWon: null, salaryTrueUpDeductionMemo: null },
    activeMonthsCount: 5,
    incentiveAccrualYtdWon: 1_000_000,
    welfarePaidYtdWon: 500_000,
  }).loweredSalaryAccumulatedWon,
  0,
);
check(
  "adjusted ≥ base → 낮춘급여 0 (낮춤 의도 없음)",
  computeAnnouncementTrueUpDetail({
    employee: { baseSalary: 50_000_000, adjustedSalary: 60_000_000, salaryTrueUpDeductionWon: null, salaryTrueUpDeductionMemo: null },
    activeMonthsCount: 12,
    incentiveAccrualYtdWon: 0,
    welfarePaidYtdWon: 0,
  }).loweredSalaryAccumulatedWon,
  0,
);

console.log("\n=== activeMonthsCount 0~12 정규화 ===\n");
check(
  "음수 → 0",
  computeAnnouncementTrueUpDetail({
    employee: empBase, activeMonthsCount: -3, incentiveAccrualYtdWon: 0, welfarePaidYtdWon: 0,
  }).loweredSalaryAccumulatedWon,
  0,
);
check(
  "13 → 12 로 클램프 후 (b−a)/12 × 12 = (b−a)",
  computeAnnouncementTrueUpDetail({
    employee: empBase, activeMonthsCount: 13, incentiveAccrualYtdWon: 0, welfarePaidYtdWon: 0,
  }).loweredSalaryAccumulatedWon,
  16_800_000,
);

console.log("\n=== 메모 정규화 ===\n");
check(
  "공백만 → null",
  computeAnnouncementTrueUpDetail({
    employee: { ...empBase, salaryTrueUpDeductionMemo: "   " },
    activeMonthsCount: 5, incentiveAccrualYtdWon: 0, welfarePaidYtdWon: 0,
  }).deductionMemo,
  null,
);

console.log("\n=== formatAnnouncementTrueUpBreakdownLine ===\n");
check(
  "사용자 예시 — 4개 항목 모두",
  formatAnnouncementTrueUpBreakdownLine(r),
  "내역: 낮춘급여 7,000,000 + 인센 2,982,400 − 사복지급 6,000,000 − 차감 1,000,000(주 4일 근무 차감분 (125만원 → 세후))",
);
check(
  "0 항목 생략 — 인센만",
  formatAnnouncementTrueUpBreakdownLine({
    loweredSalaryAccumulatedWon: 0,
    incentiveAccrualYtdWon: 500_000,
    welfarePaidYtdWon: 0,
    manualDeductionWon: 0,
    deductionMemo: null,
    trueUpWon: 500_000,
  }),
  "내역: + 인센 500,000",
);
check(
  "모두 0 → 빈 문자열",
  formatAnnouncementTrueUpBreakdownLine({
    loweredSalaryAccumulatedWon: 0,
    incentiveAccrualYtdWon: 0,
    welfarePaidYtdWon: 0,
    manualDeductionWon: 0,
    deductionMemo: null,
    trueUpWon: 0,
  }),
  "",
);

console.log("\n----------------------------------------");
console.log(`passed: ${passed}  failed: ${failed}`);
if (failed > 0) process.exit(1);
