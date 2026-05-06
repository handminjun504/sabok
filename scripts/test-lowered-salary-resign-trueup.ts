/**
 * 급여인하 + 당해 퇴사(부분 재직) 시 조정연봉 월분·마지막 달 보정 회귀.
 * 예: 기존 64,800,000 / 조정 48,800,000, 5월 퇴사, ~5월 사복 누적 5,500,000 → 5월 급여 보정.
 */
import assert from "node:assert/strict";
import {
  computeLoweredSalaryPartialYearTrueUpWon,
  MONTHS_FULL_YEAR_ORDERED,
  resolveEffectiveAdjustedSalaryForMonth,
} from "../src/lib/domain/salary-inclusion";

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

const empScenario = { adjustedSalary: 48_800_000, baseSalary: 64_800_000 };
const activeJanMay = [1, 2, 3, 4, 5] as const;
const notes: Parameters<typeof resolveEffectiveAdjustedSalaryForMonth>[3] = [];

const bump = computeLoweredSalaryPartialYearTrueUpWon({
  employee: empScenario,
  activeMonthsSorted: activeJanMay,
  welfareYtdThroughLastPaidMonth: 5_500_000,
  hasAdjustedSalaryOverride: false,
});
assert.equal(bump, 1_166_667);
ok("보정액 = 27,000,000 − 조정기간합(round) − 사복누적 = 1,166,667원");

let sumPartial = 0;
for (const m of activeJanMay) {
  sumPartial += resolveEffectiveAdjustedSalaryForMonth(empScenario, 2026, m, notes, activeJanMay);
}
assert.equal(sumPartial, 20_333_333);
ok("부분 재직 5개월 조정연봉 월분 합 = round(48,800,000×5/12)");

const mayPortion = resolveEffectiveAdjustedSalaryForMonth(empScenario, 2026, 5, notes, activeJanMay);
assert.equal(mayPortion + bump, 5_233_336);
ok("5월 표시 급여 = 마지막 달 월분 + 보정 = 5,233,336원");

assert.equal(
  resolveEffectiveAdjustedSalaryForMonth(
    empScenario,
    2026,
    12,
    notes,
    MONTHS_FULL_YEAR_ORDERED,
  ),
  4_066_674,
);
ok("만근 연도 12월 잔차 분배(48,800,000원) 유지");

console.log("\n결과: 급여인하 퇴사 보정 회귀 통과");
