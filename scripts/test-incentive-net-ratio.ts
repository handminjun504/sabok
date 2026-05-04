/**
 * 월별 발생 인센 자동 세후 변환 회귀 검증 — 그리드 핵심 헬퍼인 `applyNetRatio` 와
 * 비율 정규화 `normalizeNetRatio`(클라이언트 컴포넌트 내부에 동일 로직 존재) 의 셈만 별도로 검증.
 *
 * "use client" 컴포넌트는 직접 import 가 어려우므로, 동일한 정규화·변환 식을 그대로 재현해 케이스만 통과하는지 본다.
 */

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

/** MonthlyIncentiveAccrualGrid.tsx 의 normalizeNetRatio 와 동일 식 — 1~100 외 모두 null. */
function normalizeNetRatio(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : raw;
  if (s === "" || s === null) return null;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return n;
}

/** MonthlyIncentiveAccrualGrid.tsx 의 applyNetRatio 와 동일 식 — null/100 = 변환 비활성. */
function applyNetRatio(grossWon: number, ratioPct: number | null): number {
  if (ratioPct == null || ratioPct === 100) return Math.round(grossWon);
  if (!Number.isFinite(grossWon)) return 0;
  return Math.round((grossWon * ratioPct) / 100);
}

console.log("=== 월별 발생 인센 세후 자동 변환 회귀 ===\n");

console.log("[normalizeNetRatio] 입력 정규화");
check("null → null", normalizeNetRatio(null), null);
check("undefined → null", normalizeNetRatio(undefined), null);
check("\"\" → null", normalizeNetRatio(""), null);
check("0 → null(변환 비활성)", normalizeNetRatio(0), null);
check("음수 → null", normalizeNetRatio(-10), null);
check("101 → null(범위 외)", normalizeNetRatio(101), null);
check("80 → 80", normalizeNetRatio(80), 80);
check("100 → 100", normalizeNetRatio(100), 100);
check("\"80\" → 80(문자열 허용)", normalizeNetRatio("80"), 80);
check("\"  90 \" → 90(트리밍)", normalizeNetRatio("  90 "), 90);
check("\"abc\" → null(파싱 실패)", normalizeNetRatio("abc"), null);
check("80.4 → 80(반올림)", normalizeNetRatio(80.4), 80);
check("80.6 → 81(반올림)", normalizeNetRatio(80.6), 81);

console.log("\n[applyNetRatio] 변환 동작");
check("100만원 × 80% → 80만원", applyNetRatio(1_000_000, 80), 800_000);
check("100만원 × 50% → 50만원", applyNetRatio(1_000_000, 50), 500_000);
check("100만원 × 100% → 100만원(비활성과 동일)", applyNetRatio(1_000_000, 100), 1_000_000);
check("100만원 × null → 100만원(변환 비활성)", applyNetRatio(1_000_000, null), 1_000_000);
check("0원 × 80% → 0원", applyNetRatio(0, 80), 0);
check("123,456원 × 80% → 98,765원(반올림)", applyNetRatio(123_456, 80), 98_765);
check("999원 × 33% → 330원", applyNetRatio(999, 33), 330);
check("NaN × 80% → 0", applyNetRatio(Number.NaN, 80), 0);
check("Infinity × 80% → 0", applyNetRatio(Number.POSITIVE_INFINITY, 80), 0);

console.log("\n[round-trip] 사용자가 다음 회차에 셀로 돌아왔을 때");
/**
 * 회기 외 관찰: round-trip 시 사용자가 보는 값은 "이미 변환된 세후"이고,
 * 사용자가 새 입력을 적으면 그 새 입력에 다시 변환이 적용된다(누적이 아니라 매번 raw → 세후).
 */
const ratio = 80;
const stored = applyNetRatio(1_000_000, ratio); // 800,000
check("최초 저장값", stored, 800_000);
const reEntered = applyNetRatio(800_000, ratio); // 사용자가 셀에 다시 800,000을 입력했을 때
check("저장값을 그대로 다시 적으면 누적 변환이 아니라 1회만 적용", reEntered, 640_000);
const newGross = applyNetRatio(2_000_000, ratio);
check("새 세전 입력은 그 자체로 변환", newGross, 1_600_000);

console.log("\n[활성 판정] 100/null 은 비활성과 동치");
check("ratio=100 입력값 그대로", applyNetRatio(777_777, 100), 777_777);
check("ratio=null 입력값 그대로", applyNetRatio(777_777, null), 777_777);

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
