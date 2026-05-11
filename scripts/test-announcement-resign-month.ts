/**
 * `announcementStatusForYear` 단위 회귀 — 「퇴사해도 퇴사월 당일까지는 급여안내」 정책.
 *
 * 사용자 시나리오(2026-05):
 *   - 5월 퇴사 + 「퇴사월 사복 지급」 OFF → 사복은 5월에 0 (employeeStatusForYear) 인데,
 *     급여 안내(announcementStatusForYear) 는 5월까지 활성이라 그 달 급여 라인이 노출된다.
 *
 * 분기 의도:
 *   - announcementStatusForYear 는 flagPayWelfareOnResignMonth 와 무관(읽지 않는다).
 *   - employeeStatusForYear 의 기존 정책은 그대로 유지.
 */

import {
  announcementStatusForYear,
  employeeStatusForYear,
  monthIsActive,
} from "../src/lib/domain/schedule";

type Emp = Parameters<typeof employeeStatusForYear>[0];

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

const YEAR = 2026;

console.log("=== announcementStatusForYear — 퇴사월 토글과 무관하게 퇴사월까지 활성 ===\n");

const emp_5월퇴사_OFF: Emp = { resignYear: YEAR, resignMonth: 5, flagPayWelfareOnResignMonth: false };
const emp_5월퇴사_ON: Emp = { resignYear: YEAR, resignMonth: 5, flagPayWelfareOnResignMonth: true };
const emp_재직: Emp = { resignYear: null, resignMonth: null, flagPayWelfareOnResignMonth: false };
const emp_작년퇴사: Emp = { resignYear: YEAR - 1, resignMonth: 8, flagPayWelfareOnResignMonth: false };
const emp_내년퇴사: Emp = { resignYear: YEAR + 1, resignMonth: 3, flagPayWelfareOnResignMonth: true };
const emp_1월퇴사_OFF: Emp = { resignYear: YEAR, resignMonth: 1, flagPayWelfareOnResignMonth: false };
const emp_12월퇴사_OFF: Emp = { resignYear: YEAR, resignMonth: 12, flagPayWelfareOnResignMonth: false };

check(
  "5월 퇴사 + OFF · announcement → ACTIVE_PARTIAL { 1..5 }",
  announcementStatusForYear(emp_5월퇴사_OFF, YEAR),
  { kind: "ACTIVE_PARTIAL", range: { fromMonth: 1, toMonth: 5 } },
);
check(
  "5월 퇴사 + OFF · welfare(empStatus) → ACTIVE_PARTIAL { 1..4 } (기존 정책 유지)",
  employeeStatusForYear(emp_5월퇴사_OFF, YEAR),
  { kind: "ACTIVE_PARTIAL", range: { fromMonth: 1, toMonth: 4 } },
);
check(
  "5월 퇴사 + ON  · announcement → ACTIVE_PARTIAL { 1..5 } (ON/OFF 동일)",
  announcementStatusForYear(emp_5월퇴사_ON, YEAR),
  { kind: "ACTIVE_PARTIAL", range: { fromMonth: 1, toMonth: 5 } },
);
check(
  "재직 · announcement → ACTIVE_FULL_YEAR",
  announcementStatusForYear(emp_재직, YEAR),
  { kind: "ACTIVE_FULL_YEAR" },
);
check(
  "작년 퇴사(8월) · announcement → AFTER_RESIGN",
  announcementStatusForYear(emp_작년퇴사, YEAR),
  { kind: "AFTER_RESIGN", resignYear: YEAR - 1, resignMonth: 8 },
);
check(
  "내년 퇴사 · announcement(올해) → ACTIVE_FULL_YEAR (아직 재직)",
  announcementStatusForYear(emp_내년퇴사, YEAR),
  { kind: "ACTIVE_FULL_YEAR" },
);
check(
  "1월 퇴사 + OFF · announcement → ACTIVE_PARTIAL { 1..1 } (사복 OFF여도 1월 안내는 노출)",
  announcementStatusForYear(emp_1월퇴사_OFF, YEAR),
  { kind: "ACTIVE_PARTIAL", range: { fromMonth: 1, toMonth: 1 } },
);
check(
  "1월 퇴사 + OFF · welfare(empStatus) → AFTER_RESIGN (사복 0, 기존 정책)",
  employeeStatusForYear(emp_1월퇴사_OFF, YEAR),
  { kind: "AFTER_RESIGN", resignYear: YEAR, resignMonth: 1 },
);
check(
  "12월 퇴사 + OFF · announcement → ACTIVE_FULL_YEAR",
  announcementStatusForYear(emp_12월퇴사_OFF, YEAR),
  { kind: "ACTIVE_FULL_YEAR" },
);

console.log("\n=== monthIsActive(announcementStatus) — 퇴사월(5월) 포함 여부 ===\n");
const s = announcementStatusForYear(emp_5월퇴사_OFF, YEAR);
check("5월(퇴사월) 활성 = true", monthIsActive(s, 5), true);
check("4월 활성 = true", monthIsActive(s, 4), true);
check("6월(퇴사월 다음) 활성 = false", monthIsActive(s, 6), false);
check("12월 활성 = false", monthIsActive(s, 12), false);

console.log("\n----------------------------------------");
console.log(`passed: ${passed}  failed: ${failed}`);
if (failed > 0) process.exit(1);
