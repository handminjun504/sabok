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
  { employeeCode: "A001", name: "홍길동", welfareMonth: 0, salaryMonth: 0, flagRepReturn: false, repReturnAmount: 0, spouseReceiptAmount: 0, discretionaryAmount: 0 },
  { employeeCode: "A002", name: "김철수", welfareMonth: 0, salaryMonth: 0, flagRepReturn: false, repReturnAmount: 0, spouseReceiptAmount: 0, discretionaryAmount: 0 },
];
check(
  "buildWelfareFundNotice 합계 0 → 단문",
  buildWelfareFundNotice(4, noneRows),
  "안녕하세요. 4월 사내근로복지기금 지급분은 없습니다!",
);

/** 단일월: 한 명이라도 양수 → 기존 양식(인사 + 통장 이체) */
const someRows: AnnouncementRowInput[] = [
  { employeeCode: "A001", name: "홍길동", welfareMonth: 100_000, salaryMonth: 0, flagRepReturn: false, repReturnAmount: 0, spouseReceiptAmount: 0, discretionaryAmount: 0 },
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

/** 통장·반환 상세: 합계 0 + 대표반환·배우자수령·알아서금액 모두 0 → 단문 */
const transferEmptyRows: AnnouncementRowInput[] = [
  { employeeCode: "A001", name: "홍길동", welfareMonth: 0, salaryMonth: 0, flagRepReturn: false, repReturnAmount: 0, spouseReceiptAmount: 0, discretionaryAmount: 0 },
];
check(
  "buildTransferAndDetailNotice 전부 0 → 단문",
  buildTransferAndDetailNotice(4, transferEmptyRows),
  "안녕하세요. 4월 사내근로복지기금 지급분은 없습니다!",
);

/** 통장·반환 상세: 합계 0 이지만 대표반환 플래그만 있고 금액 미입력 → 「※ 별도 산정」 폴백 */
const transferRepFlagRows: AnnouncementRowInput[] = [
  { employeeCode: "A001", name: "홍길동", welfareMonth: 0, salaryMonth: 0, flagRepReturn: true, repReturnAmount: 0, spouseReceiptAmount: 0, discretionaryAmount: 0 },
];
const transferRepFlagNotice = buildTransferAndDetailNotice(4, transferRepFlagRows);
check(
  "buildTransferAndDetailNotice 플래그만 있을 때 → 「별도 산정 후 기재」 줄 노출",
  transferRepFlagNotice.includes("대표님 반환: ※ 금액은 별도 산정 후 기재"),
  true,
);

/** 통장·반환 상세: 월별 금액(대표반환·배우자수령·알아서) 입력 → 직원 라인 아래 ㄴ 줄 3종 노출 */
const transferDetailRows: AnnouncementRowInput[] = [
  {
    employeeCode: "A001",
    name: "홍길동",
    welfareMonth: 1_234_000,
    salaryMonth: 0,
    flagRepReturn: true,
    repReturnAmount: 300_000,
    spouseReceiptAmount: 500_000,
    discretionaryAmount: 200_000,
  },
];
const transferDetailNotice = buildTransferAndDetailNotice(4, transferDetailRows);
check(
  "buildTransferAndDetailNotice ㄴ배우자수령 라인",
  transferDetailNotice.includes("ㄴ배우자수령: 500,000 원"),
  true,
);
check(
  "buildTransferAndDetailNotice ㄴ대표님 반환 라인 (금액 입력 시 폴백 텍스트 X)",
  transferDetailNotice.includes("ㄴ대표님 반환: 300,000 원"),
  true,
);
check(
  "buildTransferAndDetailNotice ㄴ알아서금액 라인",
  transferDetailNotice.includes("ㄴ알아서금액: 200,000 원"),
  true,
);

/** 「+ 반환 추가」 사용자 정의 카테고리 — ㄴ{라벨}: {금액} 원 노출 + 라벨 가나다 정렬 */
const transferCustomReturnsRows: AnnouncementRowInput[] = [
  {
    employeeCode: "A001",
    name: "홍길동",
    welfareMonth: 1_000_000,
    salaryMonth: 0,
    flagRepReturn: false,
    repReturnAmount: 0,
    spouseReceiptAmount: 0,
    discretionaryAmount: 0,
    customReturns: [
      { label: "퇴직 반환", amount: 250_000 },
      { label: "경조금 반환", amount: 100_000 },
      { label: "0원 카테고리", amount: 0 },
    ],
  },
];
const transferCustomReturnsNotice = buildTransferAndDetailNotice(5, transferCustomReturnsRows);
check(
  "buildTransferAndDetailNotice 커스텀 반환 ㄴ경조금 반환 라인",
  transferCustomReturnsNotice.includes("ㄴ경조금 반환: 100,000 원"),
  true,
);
check(
  "buildTransferAndDetailNotice 커스텀 반환 ㄴ퇴직 반환 라인",
  transferCustomReturnsNotice.includes("ㄴ퇴직 반환: 250,000 원"),
  true,
);
check(
  "buildTransferAndDetailNotice 커스텀 반환 0 원 카테고리는 노출하지 않음",
  transferCustomReturnsNotice.includes("0원 카테고리"),
  false,
);
/** 가나다 정렬: 「경조금 반환」 → 「퇴직 반환」 순으로 등장해야 한다. */
check(
  "buildTransferAndDetailNotice 커스텀 반환 라벨 한국어 정렬",
  transferCustomReturnsNotice.indexOf("ㄴ경조금 반환") < transferCustomReturnsNotice.indexOf("ㄴ퇴직 반환"),
  true,
);

/** 사복 0 원 + 커스텀 반환만 있어도 단문 폴백이 아닌 상세 양식이 나와야 한다(기금 base A 차감 안내). */
const transferOnlyCustomRows: AnnouncementRowInput[] = [
  {
    employeeCode: "A001",
    name: "홍길동",
    welfareMonth: 0,
    salaryMonth: 0,
    flagRepReturn: false,
    repReturnAmount: 0,
    spouseReceiptAmount: 0,
    discretionaryAmount: 0,
    customReturns: [{ label: "기타 반환", amount: 50_000 }],
  },
];
const transferOnlyCustomNotice = buildTransferAndDetailNotice(5, transferOnlyCustomRows);
check(
  "buildTransferAndDetailNotice 커스텀 반환만 있어도 단문 폴백 X",
  transferOnlyCustomNotice.startsWith("5월 사내근로복지기금 안내드립니다."),
  true,
);
check(
  "buildTransferAndDetailNotice 커스텀 반환만 있을 때 ㄴ기타 반환 라인",
  transferOnlyCustomNotice.includes("ㄴ기타 반환: 50,000 원"),
  true,
);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
