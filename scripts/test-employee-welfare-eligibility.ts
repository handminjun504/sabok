/**
 * `employeeWelfareIneligible` / `employeeWelfareEligible` / `welfareEligibleEmployees` 단위 회귀.
 *
 * 정책(2026-05): 「레벨 0 = 사복 미대상 = 0원」 정책 단일화.
 *   - level === 0 또는 flagWelfareIneligible === true 중 하나라도 true → 미대상.
 *   - 폼 저장 시 level=0 이면 flag=true 가 자동 동기화되지만, 헬퍼는 그 보장이 깨져도 안전하게 동작해야 한다.
 */

import {
  employeeWelfareEligible,
  employeeWelfareIneligible,
} from "../src/lib/domain/employee-welfare-eligibility";
import { welfareEligibleEmployees } from "../src/lib/domain/schedule";

type Min = { level: number; flagWelfareIneligible: boolean };

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

console.log("=== employeeWelfareIneligible — 단일 케이스 ===");
{
  const r = employeeWelfareIneligible({ level: 0, flagWelfareIneligible: false });
  check("level=0 + flag=false → 미대상", r, true);
}
{
  const r = employeeWelfareIneligible({ level: 3, flagWelfareIneligible: true });
  check("level=3 + flag=true → 미대상(legacy flag 인정)", r, true);
}
{
  const r = employeeWelfareIneligible({ level: 0, flagWelfareIneligible: true });
  check("level=0 + flag=true → 미대상(동기화 정상)", r, true);
}
{
  const r = employeeWelfareIneligible({ level: 3, flagWelfareIneligible: false });
  check("level=3 + flag=false → 대상", r, false);
}
{
  const r = employeeWelfareIneligible({ level: 1, flagWelfareIneligible: false });
  check("level=1 + flag=false → 대상", r, false);
}
{
  const r = employeeWelfareIneligible({ level: 5, flagWelfareIneligible: false });
  check("level=5 + flag=false → 대상", r, false);
}

console.log("\n=== 비정상 입력 안전 폴백 ===");
{
  /** level 이 NaN/문자열로 들어와도 0 만 미대상으로 인정 */
  const r = employeeWelfareIneligible({ level: NaN as unknown as number, flagWelfareIneligible: false });
  check("level=NaN + flag=false → 대상(0 아니므로 안전 폴백)", r, false);
}
{
  const r = employeeWelfareIneligible({ level: "0" as unknown as number, flagWelfareIneligible: false });
  check("level='0'(문자열) + flag=false → 미대상", r, true);
}
{
  const r = employeeWelfareIneligible({ level: 0.4 as unknown as number, flagWelfareIneligible: false });
  check("level=0.4 → 미대상(round 후 0)", r, true);
}
{
  const r = employeeWelfareIneligible({ level: 0.6 as unknown as number, flagWelfareIneligible: false });
  check("level=0.6 → 대상(round 후 1)", r, false);
}

console.log("\n=== employeeWelfareEligible — 부정 형태 ===");
{
  check("level=3 → eligible=true", employeeWelfareEligible({ level: 3, flagWelfareIneligible: false }), true);
  check("level=0 → eligible=false", employeeWelfareEligible({ level: 0, flagWelfareIneligible: false }), false);
}

console.log("\n=== welfareEligibleEmployees — 필터 회귀 ===");
{
  const list: Min[] = [
    { level: 1, flagWelfareIneligible: false }, // 대상
    { level: 0, flagWelfareIneligible: false }, // 미대상(레벨 0)
    { level: 3, flagWelfareIneligible: true },  // 미대상(legacy flag)
    { level: 5, flagWelfareIneligible: false }, // 대상
    { level: 0, flagWelfareIneligible: true },  // 미대상(동기화)
  ];
  const out = welfareEligibleEmployees(list);
  check("필터 결과 개수 = 2", out.length, 2);
  check("필터 결과 [0] level = 1", out[0]?.level, 1);
  check("필터 결과 [1] level = 5", out[1]?.level, 5);
}
{
  /** 빈 입력 안전 */
  check("빈 입력 → 빈 출력", welfareEligibleEmployees([]).length, 0);
}

console.log("\n----------------------------------------");
console.log(`passed: ${passed}  failed: ${failed}`);
if (failed > 0) process.exit(1);
