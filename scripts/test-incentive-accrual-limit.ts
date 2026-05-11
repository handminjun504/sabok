/**
 * incentive-accrual-limit 도메인 단위 테스트.
 *
 * 검증 포인트:
 *  1. `parseTenantOperationModeOrNull` — 정상값/빈값/null/이상값 → 매핑.
 *  2. `effectiveEmployeeOperationMode` — 직원 우선, 없으면 거래처, 둘 다 없으면 GENERAL.
 *  3. `effectiveIncentiveAccrualLimitWon`
 *     - INCENTIVE_WELFARE → welfareScheduleTotalWon 이 한도, 비면 한도 없음.
 *     - 그 외 → incentiveAmount 가 한도, 비면 한도 없음.
 *     - 0/음수/NaN/문자열 모두 안전하게 정상화.
 *  4. `incentiveAccrualLimitBasisLabel` — 라벨 분기.
 */

import {
  effectiveEmployeeOperationMode,
  parseTenantOperationMode,
  parseTenantOperationModeOrNull,
} from "../src/lib/domain/tenant-profile";
import {
  effectiveIncentiveAccrualLimitWon,
  incentiveAccrualLimitBasisLabel,
} from "../src/lib/domain/incentive-accrual-limit";

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

console.log("=== parseTenantOperationModeOrNull ===\n");
check("null → null", parseTenantOperationModeOrNull(null), null);
check("undefined → null", parseTenantOperationModeOrNull(undefined), null);
check("'' → null", parseTenantOperationModeOrNull(""), null);
check("'   ' → null", parseTenantOperationModeOrNull("   "), null);
check("'GENERAL' → GENERAL", parseTenantOperationModeOrNull("GENERAL"), "GENERAL");
check("'SALARY_WELFARE' → SALARY_WELFARE", parseTenantOperationModeOrNull("SALARY_WELFARE"), "SALARY_WELFARE");
check("'INCENTIVE_WELFARE' → INCENTIVE_WELFARE", parseTenantOperationModeOrNull("INCENTIVE_WELFARE"), "INCENTIVE_WELFARE");
check("'COMBINED' → COMBINED", parseTenantOperationModeOrNull("COMBINED"), "COMBINED");
check("'X' (이상값) → null", parseTenantOperationModeOrNull("X"), null);
check("123 (이상 타입) → null", parseTenantOperationModeOrNull(123), null);

console.log("\n=== effectiveEmployeeOperationMode ===\n");
check("직원=null + 거래처=INCENTIVE_WELFARE → INCENTIVE_WELFARE (거래처 폴백)",
  effectiveEmployeeOperationMode(null, "INCENTIVE_WELFARE"), "INCENTIVE_WELFARE");
check("직원=COMBINED + 거래처=GENERAL → COMBINED (직원 override)",
  effectiveEmployeeOperationMode("COMBINED", "GENERAL"), "COMBINED");
check("직원=GENERAL + 거래처=INCENTIVE_WELFARE → GENERAL (명시적 GENERAL override)",
  effectiveEmployeeOperationMode("GENERAL", "INCENTIVE_WELFARE"), "GENERAL");
check("직원=null + 거래처=null → GENERAL (둘 다 없음)",
  effectiveEmployeeOperationMode(null, null), "GENERAL");
check("직원=null + 거래처=undefined → GENERAL", effectiveEmployeeOperationMode(null, undefined), "GENERAL");

console.log("\n=== effectiveIncentiveAccrualLimitWon — INCENTIVE_WELFARE ===\n");
check("INCENTIVE_WELFARE · welfare=12,000,000, expected=500,000 → 12,000,000(welfare_schedule)",
  effectiveIncentiveAccrualLimitWon({ mode: "INCENTIVE_WELFARE", incentiveAmount: 500_000, welfareScheduleTotalWon: 12_000_000 }),
  { limitWon: 12_000_000, source: "welfare_schedule" });
check("INCENTIVE_WELFARE · welfare=0 → 한도 없음(none)",
  effectiveIncentiveAccrualLimitWon({ mode: "INCENTIVE_WELFARE", incentiveAmount: 500_000, welfareScheduleTotalWon: 0 }),
  { limitWon: null, source: "none" });
check("INCENTIVE_WELFARE · welfare=null → 한도 없음(none)",
  effectiveIncentiveAccrualLimitWon({ mode: "INCENTIVE_WELFARE", incentiveAmount: 500_000, welfareScheduleTotalWon: null }),
  { limitWon: null, source: "none" });
check("INCENTIVE_WELFARE · welfare=NaN → 한도 없음(none)",
  effectiveIncentiveAccrualLimitWon({ mode: "INCENTIVE_WELFARE", incentiveAmount: 500_000, welfareScheduleTotalWon: Number.NaN }),
  { limitWon: null, source: "none" });
check("INCENTIVE_WELFARE · welfare=-1000 → 한도 없음(none)",
  effectiveIncentiveAccrualLimitWon({ mode: "INCENTIVE_WELFARE", incentiveAmount: 500_000, welfareScheduleTotalWon: -1000 }),
  { limitWon: null, source: "none" });

console.log("\n=== effectiveIncentiveAccrualLimitWon — 그 외 모드 ===\n");
const otherModes = ["GENERAL", "SALARY_WELFARE", "COMBINED"] as const;
for (const m of otherModes) {
  check(`${m} · incentive=500,000, welfare=12,000,000 → 500,000(incentive_amount)`,
    effectiveIncentiveAccrualLimitWon({ mode: m, incentiveAmount: 500_000, welfareScheduleTotalWon: 12_000_000 }),
    { limitWon: 500_000, source: "incentive_amount" });
  check(`${m} · incentive=null → 한도 없음(none)`,
    effectiveIncentiveAccrualLimitWon({ mode: m, incentiveAmount: null, welfareScheduleTotalWon: 12_000_000 }),
    { limitWon: null, source: "none" });
  check(`${m} · incentive=0 → 한도 없음(none)`,
    effectiveIncentiveAccrualLimitWon({ mode: m, incentiveAmount: 0, welfareScheduleTotalWon: 12_000_000 }),
    { limitWon: null, source: "none" });
}

console.log("\n=== 한도 라벨 ===\n");
check("welfare_schedule → 사복 한도", incentiveAccrualLimitBasisLabel("welfare_schedule"), "사복 한도");
check("incentive_amount → 예상 인센 한도", incentiveAccrualLimitBasisLabel("incentive_amount"), "예상 인센 한도");
check("none → 한도 미설정", incentiveAccrualLimitBasisLabel("none"), "한도 미설정");

console.log("\n=== 기존 parseTenantOperationMode 회귀 ===\n");
check("'INCENTIVE_WELFARE' → INCENTIVE_WELFARE", parseTenantOperationMode("INCENTIVE_WELFARE"), "INCENTIVE_WELFARE");
check("null → GENERAL (fallback)", parseTenantOperationMode(null), "GENERAL");
check("'' → GENERAL (fallback)", parseTenantOperationMode(""), "GENERAL");

console.log("\n----------------------------------------");
console.log(`passed: ${passed}  failed: ${failed}`);
if (failed > 0) process.exit(1);
