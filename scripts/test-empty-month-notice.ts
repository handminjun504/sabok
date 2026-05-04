/**
 * 지급분이 없는 달의 안내 멘트가 사용자 양식
 * "안녕하세요. {N}월 사내근로복지기금 지급분은 없습니다!" 로 정확히 나오는지 회귀 검증.
 */
import {
  buildEmptyMonthNotice,
  buildEmptyMonthRangeNotice,
  buildTransferAndDetailNotice,
  buildWelfareFundBatchedNotice,
  buildWelfareFundNotice,
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

console.log("=== 지급분 없음 안내 멘트 회귀 ===\n");

/** 단문 헬퍼 */
check("buildEmptyMonthNotice(4) 양식", buildEmptyMonthNotice(4), "안녕하세요. 4월 사내근로복지기금 지급분은 없습니다!");
check("buildEmptyMonthRangeNotice(1,3) 양식", buildEmptyMonthRangeNotice(1, 3), "안녕하세요. 1월~3월 사내근로복지기금 지급분은 없습니다!");
check("buildEmptyMonthRangeNotice(4,4) → 단월", buildEmptyMonthRangeNotice(4, 4), "안녕하세요. 4월 사내근로복지기금 지급분은 없습니다!");

/** 단일월: 모든 직원 0 → 단문 */
const noneRows: AnnouncementRowInput[] = [
  { employeeCode: "A001", name: "홍길동", welfareMonth: 0, salaryMonth: 0, flagRepReturn: false, discretionaryAmount: null },
  { employeeCode: "A002", name: "김철수", welfareMonth: 0, salaryMonth: 0, flagRepReturn: false, discretionaryAmount: null },
];
check(
  "buildWelfareFundNotice 합계 0 → 단문",
  buildWelfareFundNotice(4, noneRows),
  "안녕하세요. 4월 사내근로복지기금 지급분은 없습니다!",
);

/** 단일월: 한 명이라도 양수 → 기존 양식(인사 + 통장 이체) */
const someRows: AnnouncementRowInput[] = [
  { employeeCode: "A001", name: "홍길동", welfareMonth: 100_000, salaryMonth: 0, flagRepReturn: false, discretionaryAmount: null },
];
const someNotice = buildWelfareFundNotice(4, someRows);
check(
  "buildWelfareFundNotice 합계 양수 → 인사·통장 이체 양식",
  someNotice.startsWith("안녕하세요! 4월 사내근로복지기금 안내드립니다."),
  true,
);

/** 묶음: 전 구간 0 → 단문(범위) */
const batchedNoneRows = [
  { employeeCode: "A001", name: "홍길동", welfareByMonth: { 1: 0, 2: 0, 3: 0 } },
];
check(
  "buildWelfareFundBatchedNotice 전 구간 0 → 범위 단문",
  buildWelfareFundBatchedNotice(1, 3, batchedNoneRows),
  "안녕하세요. 1월~3월 사내근로복지기금 지급분은 없습니다!",
);

/** 묶음: 일부 월 양수 → 기존 양식(인사 + 직원 블록) */
const batchedSomeRows = [
  { employeeCode: "A001", name: "홍길동", welfareByMonth: { 1: 0, 2: 50_000, 3: 0 } },
];
const batchedSomeNotice = buildWelfareFundBatchedNotice(1, 3, batchedSomeRows);
check(
  "buildWelfareFundBatchedNotice 일부 월 양수 → 기존 양식",
  batchedSomeNotice.startsWith("안녕하세요~"),
  true,
);

/** 통장·반환 상세: 합계 0 + 대표반환·알아서금액 모두 0 → 단문 */
const transferEmptyRows: AnnouncementRowInput[] = [
  { employeeCode: "A001", name: "홍길동", welfareMonth: 0, salaryMonth: 0, flagRepReturn: false, discretionaryAmount: null },
];
check(
  "buildTransferAndDetailNotice 전부 0 → 단문",
  buildTransferAndDetailNotice(4, transferEmptyRows),
  "안녕하세요. 4월 사내근로복지기금 지급분은 없습니다!",
);

/** 통장·반환 상세: 합계 0 이지만 대표반환 있는 직원 → 기존 양식 유지 */
const transferRepRows: AnnouncementRowInput[] = [
  { employeeCode: "A001", name: "홍길동", welfareMonth: 0, salaryMonth: 0, flagRepReturn: true, discretionaryAmount: null },
];
const transferRepNotice = buildTransferAndDetailNotice(4, transferRepRows);
check(
  "buildTransferAndDetailNotice 대표반환만 있을 때 → 상세 양식 유지(단문 아님)",
  transferRepNotice.includes("대표님 반환"),
  true,
);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
