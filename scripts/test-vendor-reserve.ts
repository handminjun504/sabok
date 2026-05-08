/**
 * vendor-reserve 도메인 회귀 테스트 — 「현재 통장 잔고」 우선·폴백 동작 검증.
 *
 * 검증 포인트
 *   1. `tenantReserveTotalSumWon`
 *      - balance 가 0 이상 정수면 그 값을 그대로 반환(맵·legacy 무시).
 *      - balance 가 null/undefined 면 byYear 합 + legacy 합산.
 *      - balance 가 음수/NaN 이면 폴백 활성.
 *      - balance 0 은 명시적 입력으로 폴백 비활성화.
 *   2. `tenantReserveBalanceAsOfLabel`
 *      - YYYY-MM 정규 입력은 「YYYY년 M월 기준」.
 *      - 비정규/빈 입력은 빈 문자열.
 */

import {
  tenantReserveBalanceAsOfLabel,
  tenantReserveTotalSumWon,
} from "../src/lib/domain/vendor-reserve";

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

console.log("\n=== vendor-reserve: tenantReserveTotalSumWon ===");
const monthly: Record<number, readonly number[]> = {
  2025: [100_000, 100_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  2026: [50_000, 50_000, 50_000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

check("balance 양의 정수 → 잔고만 반영(맵·legacy 무시)", tenantReserveTotalSumWon(monthly, 999_999, 12_500_000), 12_500_000);
check("balance 0 → 0(명시적, 폴백 차단)", tenantReserveTotalSumWon(monthly, 999_999, 0), 0);
check("balance null + 맵·legacy 합산", tenantReserveTotalSumWon(monthly, 999_999, null), 100_000 + 100_000 + 50_000 * 3 + 999_999);
check("balance undefined → 폴백 활성", tenantReserveTotalSumWon(monthly, 1_000, undefined), 100_000 + 100_000 + 150_000 + 1_000);
check("balance 미지정 인자 → 폴백 활성", tenantReserveTotalSumWon(monthly, 1_000), 100_000 + 100_000 + 150_000 + 1_000);
check("balance 음수 → 무효 → 폴백", tenantReserveTotalSumWon(monthly, 1_000, -5), 100_000 + 100_000 + 150_000 + 1_000);
check("balance NaN → 무효 → 폴백", tenantReserveTotalSumWon(monthly, 1_000, Number.NaN), 100_000 + 100_000 + 150_000 + 1_000);
check("balance 소수 → 반올림 후 반환", tenantReserveTotalSumWon(null, null, 1_500_000.4), 1_500_000);
check("balance 1원 정밀 — 0 은 폴백 안 함", tenantReserveTotalSumWon({ 2025: [1_000_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 0, 0), 0);
check("byYear/legacy 모두 비고 balance 만 → balance", tenantReserveTotalSumWon(null, null, 7_777_777), 7_777_777);
check("byYear/legacy/balance 모두 비면 0", tenantReserveTotalSumWon(null, null, null), 0);
check("byYear 안의 음수·NaN 은 0 보정", tenantReserveTotalSumWon({ 2025: [-100, Number.NaN, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, null, null), 100);

console.log("\n=== vendor-reserve: tenantReserveBalanceAsOfLabel ===");
check("YYYY-MM 정규 입력", tenantReserveBalanceAsOfLabel("2026-05"), "2026년 5월 기준");
check("월 두 자리 정규 입력(10월)", tenantReserveBalanceAsOfLabel("2025-10"), "2025년 10월 기준");
check("월 두 자리 정규 입력(12월)", tenantReserveBalanceAsOfLabel("2024-12"), "2024년 12월 기준");
check("월 0 패딩 누락 → 비정규(빈 문자열)", tenantReserveBalanceAsOfLabel("2026-5"), "");
check("월 13 → 비정규", tenantReserveBalanceAsOfLabel("2026-13"), "");
check("null", tenantReserveBalanceAsOfLabel(null), "");
check("undefined", tenantReserveBalanceAsOfLabel(undefined), "");
check("빈 문자열", tenantReserveBalanceAsOfLabel(""), "");
check("쓰레기 문자열", tenantReserveBalanceAsOfLabel("foo"), "");

console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
