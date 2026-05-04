/**
 * 월별 스케줄 표시(=`welfareByScheduleDisplayMonth`)가
 * 「당월 귀속 · 차월 지급」 / 「당월 귀속 · 당월 지급」 두 모드에서 모두
 * **paidMonth 기준** 칼럼에 일관되게 들어가는지 회귀 검증.
 */
import type {
  Employee,
  Level5Override,
  LevelPaymentRule,
  QuarterlyEmployeeConfig,
} from "../src/types/models";
import {
  buildMonthlyBreakdown,
  welfareByScheduleDisplayMonth,
  welfareScheduleLinesByMonth,
} from "../src/lib/domain/schedule";

const YEAR = 2025;
const FOUNDING_MONTH = 1;

function makeEmployee(): Employee {
  return {
    id: "emp-1",
    tenantId: "tenant-1",
    employeeCode: "E001",
    name: "홍길동",
    position: "사원",
    baseSalary: 3_000_000,
    adjustedSalary: 3_500_000,
    level: 3,
    active: true,
    enrolled: true,
    birthMonth: null,
    hireMonth: null,
    resignMonth: null,
    resignYear: null,
    weddingMonth: null,
    childrenInfant: 0,
    childrenPreschool: 0,
    childrenTeen: 0,
    parentsCount: 0,
    parentsInLawCount: 0,
    flagRepReturn: false,
    rank: null,
    payDay: null,
    loanPrincipal: null,
    loanInterest: null,
    monthlyRentAmount: null,
    createdAt: null,
    updatedAt: null,
    salaryInclusionVarianceMode: null,
  } as unknown as Employee;
}

function rule(eventKey: string, amount: number): LevelPaymentRule {
  return { id: `rule-${eventKey}`, tenantId: "tenant-1", year: YEAR, level: 3, eventKey, amount };
}

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

function run(label: string, accrualCurrentMonthPayNext: boolean) {
  console.log(`\n=== ${label} (accrualCurrentMonthPayNext=${accrualCurrentMonthPayNext}) ===`);
  const emp = makeEmployee();
  const rules: LevelPaymentRule[] = [
    /** 기본 4종(2/5/8/11 귀속) + 1월 귀속 분기 */
    rule("NEW_YEAR_FEB", 200_000),
    rule("FAMILY_MAY", 300_000),
    rule("CHUSEOK_AUG", 400_000),
    rule("YEAR_END_NOV", 500_000),
  ];
  const overrides: Level5Override[] = [];
  /** 1월 귀속 분기(itemKey=INSURANCE) 5만원 — paymentMonths 가 1월 → paidMonth 매핑은 buildMonthlyBreakdown 기준 */
  const quarterly: QuarterlyEmployeeConfig[] = [
    {
      id: "q-1",
      employeeId: emp.id,
      year: YEAR,
      itemKey: "INSURANCE",
      paymentMonths: [1],
      amount: 50_000,
    },
  ];

  const br = buildMonthlyBreakdown(
    emp,
    YEAR,
    FOUNDING_MONTH,
    rules,
    overrides,
    quarterly,
    accrualCurrentMonthPayNext,
    [],
    {},
  );
  const display = welfareByScheduleDisplayMonth(br);
  const lines = welfareScheduleLinesByMonth(br, undefined, []);

  if (accrualCurrentMonthPayNext) {
    /**
     * 차월 지급: **정기**는 paidMonth = accrualMonth + 1 로 자동 이동.
     * 분기는 사용자가 직접 정한 paymentMonths(=paidMonth) 가 그대로 사용 → 모드와 무관.
     * 따라서 paymentMonths=[1] 인 분기는 1월 칼럼에 그대로 남는다.
     */
    check("1월 칼럼 = 1월 paid 분기(50000)", display.get(1) ?? 0, 50_000);
    check("3월 칼럼 = 2월 귀속 NEW_YEAR_FEB(200000)", display.get(3) ?? 0, 200_000);
    check("6월 칼럼 = 5월 귀속 FAMILY_MAY(300000)", display.get(6) ?? 0, 300_000);
    check("9월 칼럼 = 8월 귀속 CHUSEOK_AUG(400000)", display.get(9) ?? 0, 400_000);
    check("12월 칼럼 = 11월 귀속 YEAR_END_NOV(500000)", display.get(12) ?? 0, 500_000);
    check("2월 칼럼 0(차월 정기 1월 귀속이 없으니까)", display.get(2) ?? 0, 0);
    check(
      "라인: 3월 NEW_YEAR_FEB 정기 1건",
      lines.get(3)?.find((l) => l.kind === "regular")?.amount ?? 0,
      200_000,
    );
    check(
      "라인: 1월 분기(INSURANCE) 1건",
      lines.get(1)?.find((l) => l.kind === "quarterly")?.amount ?? 0,
      50_000,
    );
  } else {
    /** 당월 지급: 모든 항목이 귀속월 = 지급월 */
    check("1월 칼럼 = 1월 귀속 분기(50000)", display.get(1) ?? 0, 50_000);
    check("2월 칼럼 = 2월 귀속 NEW_YEAR_FEB(200000)", display.get(2) ?? 0, 200_000);
    check("5월 칼럼 = 5월 귀속 FAMILY_MAY(300000)", display.get(5) ?? 0, 300_000);
    check("8월 칼럼 = 8월 귀속 CHUSEOK_AUG(400000)", display.get(8) ?? 0, 400_000);
    check("11월 칼럼 = 11월 귀속 YEAR_END_NOV(500000)", display.get(11) ?? 0, 500_000);
    check(
      "라인: 2월 NEW_YEAR_FEB 정기 1건",
      lines.get(2)?.find((l) => l.kind === "regular")?.amount ?? 0,
      200_000,
    );
    check(
      "라인: 1월 분기(INSURANCE) 1건",
      lines.get(1)?.find((l) => l.kind === "quarterly")?.amount ?? 0,
      50_000,
    );
  }
}

run("당월 귀속 · 차월 지급", true);
run("당월 귀속 · 당월 지급", false);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
