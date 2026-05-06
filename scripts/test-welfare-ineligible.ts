/**
 * 사복 미대상(`flagWelfareIneligible`) 직원이 사복 화면·집계에서는 빠지고,
 * 직원 명부와 ‘월별 발생 인센’ 그리드에는 그대로 보존되는지 회귀 검증.
 *
 * 시나리오:
 *   - 일반 직원 1명(eligible) + 사복 미대상 직원 1명(ineligible) + 사복 미대상 + 대표반환 직원 1명.
 *   - welfareEligibleEmployees 결과와 aggregateWelfareSpendBySource 결과에 미대상자가 0원으로 누락되는지.
 *   - settings 페이지의 `repReturnEmployees` 필터(미대상 + flagRepReturn → 제외) 시뮬.
 *   - schedule 페이지가 만드는 incentiveAccrualRows 정렬(미대상 행이 끝으로 이동)과
 *     안내문에 들어가는 rows 가 미대상자를 포함하지 않는지.
 */
import type {
  Employee,
  Level5Override,
  LevelPaymentRule,
  MonthlyEmployeeNote,
  QuarterlyEmployeeConfig,
} from "../src/types/models";
import {
  buildMonthlyBreakdown,
  welfareEligibleEmployees,
} from "../src/lib/domain/schedule";
import { aggregateWelfareSpendBySource } from "../src/lib/domain/operating-welfare-legal-categories";

const YEAR = 2026;
const FOUNDING_MONTH = 1;

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-x",
    tenantId: "tenant-1",
    employeeCode: "E000",
    name: "이름",
    position: "사원",
    baseSalary: 3_000_000,
    adjustedSalary: 3_000_000,
    welfareAllocation: 0,
    priorOverpaidWelfareWon: null,
    incentiveAmount: null,
    discretionaryAmount: null,
    optionalWelfareAmount: null,
    monthlyPayAmount: null,
    quarterlyPayAmount: null,
    birthMonth: null,
    hireMonth: 1,
    resignMonth: null,
    resignYear: null,
    weddingMonth: null,
    childrenInfant: 0,
    childrenPreschool: 0,
    childrenTeen: 0,
    parentsCount: 0,
    parentsInLawCount: 0,
    insurancePremium: 0,
    loanInterest: 0,
    monthlyRentAmount: null,
    payDay: null,
    level: 3,
    expectedYearlyWelfare: null,
    flagAutoAmount: false,
    flagRepReturn: false,
    flagSpouseReceipt: false,
    flagWorkerNet: false,
    flagWelfareIneligible: false,
    flagPayWelfareOnResignMonth: false,
    salaryInclusionVarianceMode: null,
    ...overrides,
  } as unknown as Employee;
}

function rule(level: number, eventKey: string, amount: number): LevelPaymentRule {
  return { id: `rule-${level}-${eventKey}`, tenantId: "tenant-1", year: YEAR, level, eventKey, amount };
}

let failed = 0;
let passed = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${label}  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

function main() {
  console.log("=== 사복 미대상 필터 회귀 검증 ===");

  const eligibleEmp = makeEmployee({ id: "emp-1", employeeCode: "E001", name: "정상", flagRepReturn: true });
  const ineligibleEmp = makeEmployee({
    id: "emp-2",
    employeeCode: "E002",
    name: "미대상",
    flagWelfareIneligible: true,
  });
  const ineligibleRepEmp = makeEmployee({
    id: "emp-3",
    employeeCode: "E003",
    name: "미대상+대표반환",
    flagWelfareIneligible: true,
    flagRepReturn: true,
  });

  const all = [eligibleEmp, ineligibleEmp, ineligibleRepEmp];

  /** 1) welfareEligibleEmployees 기본 동작 */
  const eligible = welfareEligibleEmployees(all);
  check("eligible 1명만 통과", eligible.map((e) => e.id), ["emp-1"]);
  check("원본 배열 길이 보존(불변)", all.length, 3);

  /** 2) settings 페이지 시뮬 — 대표반환 입력 행은 (flagRepReturn && !flagWelfareIneligible) */
  const repReturnIds = all.filter((e) => e.flagRepReturn && !e.flagWelfareIneligible).map((e) => e.id);
  check(
    "repReturnEmployees: 미대상은 대표반환 켜져 있어도 제외",
    repReturnIds,
    ["emp-1"],
  );

  /** 3) schedule 페이지 시뮬 — incentiveAccrualRows 정렬: 미대상은 행 끝으로 */
  const sorted = [
    ...all.filter((e) => !e.flagWelfareIneligible),
    ...all.filter((e) => e.flagWelfareIneligible),
  ].map((e) => e.id);
  check("incentiveAccrualRows 정렬: 미대상 끝으로", sorted, ["emp-1", "emp-2", "emp-3"]);

  /** 4) 안내문 rows 시뮬 — 미대상자 노출 금지 */
  const noticeRowIds = welfareEligibleEmployees(all).map((e) => e.id);
  check("안내문 rows 에 미대상 미포함", noticeRowIds.includes("emp-2") || noticeRowIds.includes("emp-3"), false);

  /** 5) buildMonthlyBreakdown 으로 사복 계산 시 — 미대상 직원이 입력으로 들어가도 사용처에서는 eligible 만 사용해야 한다.
   *    여기서는 헬퍼 사용을 가정해 eligible 결과만 비교. 미대상 직원에 대해 직접 호출해도 도메인 로직은 그대로 동작하지만,
   *    정상 운영에서는 절대 호출되지 않아야 한다. 운영 보고가 미대상자를 0원으로 만든다는 사실은 (6) 에서 검증.
   */
  const rules: LevelPaymentRule[] = [
    rule(3, "NEW_YEAR_FEB", 100_000),
    rule(3, "FAMILY_MAY", 200_000),
    rule(3, "CHUSEOK_AUG", 300_000),
    rule(3, "YEAR_END_NOV", 400_000),
  ];
  const overrides: Level5Override[] = [];
  const quarterly: QuarterlyEmployeeConfig[] = [];

  const eligibleRows = buildMonthlyBreakdown(
    eligibleEmp,
    YEAR,
    FOUNDING_MONTH,
    rules,
    overrides,
    quarterly,
    [],
    {},
  );
  const eligibleAnnual = eligibleRows.reduce((s, r) => s + (r.totalWelfareMonth ?? 0), 0);
  check("eligible 직원 정기 합 1,000,000", eligibleAnnual, 1_000_000);

  /** 6) aggregateWelfareSpendBySource 호출은 welfareEligibleEmployees 를 거친 리스트만 받는다는 운영 보고 패턴 시뮬.
   *    미대상자가 섞인 리스트를 그대로 넘기면 도메인은 계산을 수행한다 → 호출부에서 반드시 거르라는 점을 보장하기 위해
   *    eligible 만 넘긴 결과와 전체를 넘긴 결과의 차이를 비교한다.
   */
  const notes: MonthlyEmployeeNote[] = [];
  const spendEligible = aggregateWelfareSpendBySource(
    welfareEligibleEmployees(all),
    YEAR,
    FOUNDING_MONTH,
    rules,
    overrides,
    quarterly,
    notes,
    [],
    {},
  );
  const spendAll = aggregateWelfareSpendBySource(
    all,
    YEAR,
    FOUNDING_MONTH,
    rules,
    overrides,
    quarterly,
    notes,
    [],
    {},
  );

  const eligibleTotal =
    (spendEligible.regularByEventKey["NEW_YEAR_FEB"] ?? 0) +
    (spendEligible.regularByEventKey["FAMILY_MAY"] ?? 0) +
    (spendEligible.regularByEventKey["CHUSEOK_AUG"] ?? 0) +
    (spendEligible.regularByEventKey["YEAR_END_NOV"] ?? 0);
  check("eligible 만 넘긴 운영 보고 정기 합 1,000,000", eligibleTotal, 1_000_000);

  const allTotal =
    (spendAll.regularByEventKey["NEW_YEAR_FEB"] ?? 0) +
    (spendAll.regularByEventKey["FAMILY_MAY"] ?? 0) +
    (spendAll.regularByEventKey["CHUSEOK_AUG"] ?? 0) +
    (spendAll.regularByEventKey["YEAR_END_NOV"] ?? 0);
  /** 호출부에서 안 거르면 미대상자 2명이 더해져 3,000,000. → 호출부 필터 필수임을 보여주는 가드. */
  check(
    "전체 리스트를 그대로 넘기면 미대상까지 합산되어 도메인은 차단해 주지 않음(호출부에서 반드시 필터)",
    allTotal,
    3_000_000,
  );

  /** 7) 미대상 직원의 ‘월별 발생 인센’ 노트 저장은 별개로 가능 — 그리드 데이터 흐름에 영향 없음을 시뮬.
   *    ineligible 직원 ID 가 incentiveAccrualRows 에 들어가는 케이스(=allEmployees 사용)에서 살아남는다.
   */
  const incentiveRowIds = sorted; /** schedule 페이지가 사용하는 정렬 결과는 위에서 구한 sorted */
  check("월별 발생 인센 그리드는 미대상 포함", incentiveRowIds.includes("emp-2"), true);

  console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
  if (failed > 0) process.exit(1);
}

main();
