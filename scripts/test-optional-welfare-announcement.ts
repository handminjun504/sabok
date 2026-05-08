/**
 * 선택적복지(`optionalExtraAmount`) 가 안내 멘트의 정기분 금액에 자연스럽게 합산되는지 검증.
 *
 * 데이터 흐름
 *   `optionalExtraAmount` (월별 노트)
 *     → schedule/page.tsx 가 noteByMonth(paidMonth → 합) 로 변환
 *     → welfareByScheduleDisplayMonth(br, noteByMonth, override) 가 정기·분기 + 노트를 한 숫자로 합산
 *     → ScheduleAnnouncementPanel 의 `welfareMonth` 로 흘러 들어
 *     → buildTransferAndDetailNotice 가 「{이름} {금액} 원」 한 줄로 출력
 *
 * 본 회귀는 그 핵심 합산 단계 두 곳을 동시 검증한다.
 *   1) `welfareByScheduleDisplayMonth` 가 noteExtras 를 더해 합계를 돌려준다
 *   2) `buildTransferAndDetailNotice` 가 그 합계를 한 줄로 그대로 출력 (별도 「ㄴ선택적복지」 라인 없음)
 */

import {
  type MonthBreakdown,
  welfareByScheduleDisplayMonth,
} from "../src/lib/domain/schedule";
import {
  buildTransferAndDetailNotice,
  type AnnouncementRowInput,
} from "../src/lib/domain/schedule-announcement";

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
function checkContains(label: string, body: string, needle: string): void {
  const ok = body.includes(needle);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    console.log(`     "${needle}" 가 본문에 없음`);
    console.log(`     body: ${body.replace(/\n/g, " ⏎ ")}`);
  }
}
function checkNotContains(label: string, body: string, needle: string): void {
  const ok = !body.includes(needle);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    console.log(`     "${needle}" 가 본문에 포함되면 안 됨`);
    console.log(`     body: ${body.replace(/\n/g, " ⏎ ")}`);
  }
}

console.log("\n=== welfareByScheduleDisplayMonth: 선택적복지가 정기·분기 합에 더해진다 ===");

/** 3월 정기 100,000 / 6월 분기 200,000 / 9월 정기 0 인 가상의 직원 breakdown */
const breakdown: MonthBreakdown[] = [
  {
    accrualMonth: 3,
    paidMonth: 3,
    regularEvents: [{ eventKey: "FAMILY_MAY", amount: 100_000 } as MonthBreakdown["regularEvents"][number]],
    quarterly: [],
    totalWelfareMonth: 100_000,
  } as unknown as MonthBreakdown,
  {
    accrualMonth: 6,
    paidMonth: 6,
    regularEvents: [],
    quarterly: [{ itemKey: "INFANT" as const, amount: 200_000 } as MonthBreakdown["quarterly"][number]],
    totalWelfareMonth: 200_000,
  } as unknown as MonthBreakdown,
  {
    accrualMonth: 9,
    paidMonth: 9,
    regularEvents: [],
    quarterly: [],
    totalWelfareMonth: 0,
  } as unknown as MonthBreakdown,
];

const noteOptional = new Map<number, number>([
  [3, 50_000],
  [9, 70_000],
]);
const merged = welfareByScheduleDisplayMonth(breakdown, noteOptional, undefined);
check("3월 정기 100,000 + 선택적 50,000 = 150,000", merged.get(3), 150_000);
check("6월 분기 200,000 + 선택적 0 = 200,000", merged.get(6), 200_000);
check("9월 정기·분기 0 + 선택적 70,000 = 70,000 (정기 없어도 선택적이 단독 노출)", merged.get(9), 70_000);
check("1월 키 없음(전체 0)", merged.get(1), undefined);

console.log("\n=== welfareByScheduleDisplayMonth: welfareOverride 가 있어도 선택적은 별도 가산 ===");

const overrides = new Map<number, number>([[3, 800_000]]);
const mergedWithOverride = welfareByScheduleDisplayMonth(breakdown, noteOptional, overrides);
check("3월 override 800,000 + 선택적 50,000 = 850,000", mergedWithOverride.get(3), 850_000);
check("6월 분기 + 선택적 0 = 200,000(override 미설정 월은 영향 없음)", mergedWithOverride.get(6), 200_000);

console.log("\n=== buildTransferAndDetailNotice: 한 줄 합계만 출력, 별도 라인 없음 ===");

/** 안내 멘트 빌더는 `welfareMonth` 한 숫자만 사용 — 본 테스트의 입력은 위에서 검증한 합계 그대로. */
const rows: AnnouncementRowInput[] = [
  {
    employeeCode: "E001",
    name: "홍길동",
    welfareMonth: 150_000,
    salaryMonth: 0,
    flagRepReturn: false,
    repReturnAmount: 0,
    spouseReceiptAmount: 0,
    discretionaryAmount: 0,
  },
  {
    employeeCode: "E002",
    name: "이영희",
    welfareMonth: 70_000,
    salaryMonth: 0,
    flagRepReturn: false,
    repReturnAmount: 0,
    spouseReceiptAmount: 0,
    discretionaryAmount: 0,
  },
];
const notice = buildTransferAndDetailNotice(3, rows);
checkContains("홍길동 150,000 원 (정기 100K + 선택적 50K)", notice, "홍길동 150,000 원");
checkContains("이영희 70,000 원 (선택적만 단독)", notice, "이영희 70,000 원");
checkContains("통장 합계 220,000원 (개별 합)", notice, "통장에 220,000원");
checkNotContains("「ㄴ선택적」 별도 라인 없음", notice, "ㄴ선택적");
checkNotContains("「선택적 복지」 별도 라인 없음", notice, "선택적 복지");

console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
