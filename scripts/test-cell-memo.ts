/**
 * 월별 발생 인센 셀 메모(`MonthlyEmployeeNote.optionalWelfareText`) 회귀 검증.
 *
 * `setMonthlyOptionalWelfareTextAction` 본체는 PB(서버) 의존성이라 직접 import 가 어렵다.
 * 대신 액션 안에서 사용하는 두 핵심 동작을 동일 식으로 재현해 회귀 케이스만 본다:
 *
 *   1) 텍스트 정규화: `null/undefined/""/공백만` → `null`, 그 외엔 trim 후 500 자 컷.
 *   2) 다른 필드 보존: 기존 노트가 가진 (incentiveAccrualAmount 등) 다른 필드를 그대로 유지하고,
 *      `optionalWelfareText` 만 갱신하는 upsert payload 가 만들어지는지.
 */

import type { MonthlyEmployeeNote } from "../src/types/models";

const MEMO_MAX_LEN = 500;

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

/**
 * 액션의 정규화 로직 — 빈/공백만 → null. 나머지는 trim 후 길이 상한.
 * `setMonthlyOptionalWelfareTextAction` 의 분기를 그대로 옮긴 것. 둘이 어긋나면 회귀 실패로 잡힌다.
 */
function normalizeMemo(text: string | null | undefined): string | null {
  if (text == null) return null;
  const t = String(text).trim();
  if (t.length === 0) return null;
  return t.length > MEMO_MAX_LEN ? t.slice(0, MEMO_MAX_LEN) : t;
}

/**
 * 액션이 만드는 upsert payload — 다른 필드(incentiveAccrual 등)를 prev 에서 그대로 복사하고
 * `optionalWelfareText` 만 새 값으로 덮는다.
 */
function buildUpsertPayload(
  employeeId: string,
  year: number,
  month: number,
  text: string | null,
  prev: Partial<MonthlyEmployeeNote> | null,
): Record<string, unknown> {
  return {
    employeeId,
    year,
    month,
    optionalWelfareText: text,
    optionalExtraAmount: prev?.optionalExtraAmount ?? null,
    incentiveAccrualAmount: prev?.incentiveAccrualAmount ?? null,
    incentiveWelfarePaymentAmount: prev?.incentiveWelfarePaymentAmount ?? null,
  };
}

console.log("=== 월별 발생 인센 셀 메모 회귀 ===\n");

console.log("[normalizeMemo] 텍스트 정규화");
check("null → null", normalizeMemo(null), null);
check("undefined → null", normalizeMemo(undefined), null);
check("\"\" → null", normalizeMemo(""), null);
check("공백만 → null", normalizeMemo("   "), null);
check("탭/개행만 → null", normalizeMemo("\t\n  \n"), null);
check("일반 문자열 → trim 결과", normalizeMemo("  안녕 메모  "), "안녕 메모");
check("정상 문자열 그대로", normalizeMemo("정산 완료"), "정산 완료");
check("줄바꿈 포함 보존(내부 줄바꿈은 유지)", normalizeMemo("a\nb"), "a\nb");

const long = "ㄱ".repeat(700);
const longTrimmed = normalizeMemo(long);
check("길이 상한 500자 컷", longTrimmed?.length ?? 0, 500);
check("정확히 500자 입력은 그대로", normalizeMemo("ㄱ".repeat(500))?.length ?? 0, 500);
check("499자 입력은 그대로", normalizeMemo("ㄱ".repeat(499))?.length ?? 0, 499);

console.log("\n[buildUpsertPayload] 다른 필드 보존");

const prevWithIncentive: Partial<MonthlyEmployeeNote> = {
  optionalExtraAmount: 50_000,
  incentiveAccrualAmount: 800_000,
  incentiveWelfarePaymentAmount: 800_000,
};

const updated = buildUpsertPayload("emp-1", 2026, 3, "메모 추가", prevWithIncentive);
check(
  "메모 갱신 시 incentive 필드 보존",
  {
    optionalWelfareText: updated.optionalWelfareText,
    incentiveAccrualAmount: updated.incentiveAccrualAmount,
    optionalExtraAmount: updated.optionalExtraAmount,
    incentiveWelfarePaymentAmount: updated.incentiveWelfarePaymentAmount,
  },
  {
    optionalWelfareText: "메모 추가",
    incentiveAccrualAmount: 800_000,
    optionalExtraAmount: 50_000,
    incentiveWelfarePaymentAmount: 800_000,
  },
);

const cleared = buildUpsertPayload("emp-1", 2026, 3, normalizeMemo("   "), prevWithIncentive);
check(
  "메모 빈 입력으로 지워도 다른 필드는 보존",
  {
    optionalWelfareText: cleared.optionalWelfareText,
    incentiveAccrualAmount: cleared.incentiveAccrualAmount,
    optionalExtraAmount: cleared.optionalExtraAmount,
  },
  {
    optionalWelfareText: null,
    incentiveAccrualAmount: 800_000,
    optionalExtraAmount: 50_000,
  },
);

const noPrev = buildUpsertPayload("emp-1", 2026, 5, normalizeMemo("새 메모"), null);
check(
  "기존 노트가 없을 때(메모 단독)",
  {
    optionalWelfareText: noPrev.optionalWelfareText,
    incentiveAccrualAmount: noPrev.incentiveAccrualAmount,
    optionalExtraAmount: noPrev.optionalExtraAmount,
  },
  {
    optionalWelfareText: "새 메모",
    incentiveAccrualAmount: null,
    optionalExtraAmount: null,
  },
);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
