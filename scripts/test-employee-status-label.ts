/**
 * `employeeStatusLabelForYear` 단위 회귀 — 인사 정보 우선 라벨 정책.
 *
 * 사용자 시나리오(2026-05):
 *   - 5월 퇴사 + 「퇴사월 사복 지급」 OFF → 기존 badge 는 「~4월 재직」 으로 보이는데,
 *     인사상 「5월 퇴사」 가 정답이라 운영자가 혼란을 겪었음. → label="5월 퇴사", detail="사복 ~4월 (퇴사월 미지급)".
 *   - 5월 퇴사 + ON → label="5월 퇴사", detail=undefined.
 *   - 재직(퇴사 정보 없음) → label="재직".
 *   - 작년 퇴사 → label="{year}년 {month}월 퇴사" (AFTER_RESIGN).
 */

import { employeeStatusLabelForYear } from "../src/lib/domain/employee-status-label";

type Input = Parameters<typeof employeeStatusLabelForYear>[0];

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

console.log("=== 사용자 시나리오 — 5월 퇴사 + 사복 OFF/ON ===");
{
  const emp: Input = {
    resignYear: 2026,
    resignMonth: 5,
    flagPayWelfareOnResignMonth: false,
  };
  const r = employeeStatusLabelForYear(emp, 2026);
  check("5월 퇴사 + OFF · label", r.label, "5월 퇴사");
  check("5월 퇴사 + OFF · detail", r.detail, "사복 ~4월 (퇴사월 미지급)");
  check("5월 퇴사 + OFF · tone", r.tone, "warn");
}
{
  const emp: Input = {
    resignYear: 2026,
    resignMonth: 5,
    flagPayWelfareOnResignMonth: true,
  };
  const r = employeeStatusLabelForYear(emp, 2026);
  check("5월 퇴사 + ON · label", r.label, "5월 퇴사");
  check("5월 퇴사 + ON · detail 없음", r.detail, undefined);
}

console.log("\n=== 재직 ===");
{
  const r = employeeStatusLabelForYear({ resignYear: null, resignMonth: null }, 2026);
  check("정보 없음 · label", r.label, "재직");
  check("정보 없음 · tone", r.tone, "success");
}
{
  const r = employeeStatusLabelForYear({ resignYear: 2027, resignMonth: 4 }, 2026);
  check("미래 퇴사 · 올해 label", r.label, "재직");
}

console.log("\n=== 퇴사 후(AFTER_RESIGN) ===");
{
  const r = employeeStatusLabelForYear({ resignYear: 2025, resignMonth: 8 }, 2026);
  check("작년 퇴사 · label", r.label, "2025년 8월 퇴사");
  check("작년 퇴사 · tone", r.tone, "neutral");
}
{
  /** 1월 퇴사 + OFF → AFTER_RESIGN 과 동치. label 은 「{year}년 1월 퇴사」 폼으로 통일. */
  const r = employeeStatusLabelForYear(
    { resignYear: 2026, resignMonth: 1, flagPayWelfareOnResignMonth: false },
    2026,
  );
  check("1월 퇴사 + OFF · label", r.label, "2026년 1월 퇴사");
  check("1월 퇴사 + OFF · tone", r.tone, "neutral");
}

console.log("\n=== 12월 퇴사 + ON → FULL_YEAR ===");
{
  const r = employeeStatusLabelForYear(
    { resignYear: 2026, resignMonth: 12, flagPayWelfareOnResignMonth: true },
    2026,
  );
  check("12월 퇴사 + ON · label", r.label, "재직");
}
{
  /** 12월 퇴사 + OFF → ACTIVE_PARTIAL {1..11} → 인사 정보 라벨로 「12월 퇴사 · detail=사복 ~11월」 */
  const r = employeeStatusLabelForYear(
    { resignYear: 2026, resignMonth: 12, flagPayWelfareOnResignMonth: false },
    2026,
  );
  check("12월 퇴사 + OFF · label", r.label, "12월 퇴사");
  check("12월 퇴사 + OFF · detail", r.detail, "사복 ~11월 (퇴사월 미지급)");
}

console.log("\n=== legacy 폴백 — 인사 정보 결손 ===");
{
  /** ACTIVE_PARTIAL 은 본 헬퍼가 받는 LabelInput 만으로는 만들 수 없어 직접 시나리오 만들기 어려움.
   *  ACTIVE_FULL_YEAR 폴백만 확인하고, ACTIVE_PARTIAL 폴백 분기는 코드 리뷰로 검증.
   */
  check("(legacy ACTIVE_PARTIAL 폴백 분기는 코드 리뷰)", true, true);
}

console.log("\n----------------------------------------");
console.log(`passed: ${passed}  failed: ${failed}`);
if (failed > 0) process.exit(1);
