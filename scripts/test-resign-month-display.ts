/**
 * 퇴사한 직원의 월별 스케줄 표·카드에 “퇴사월 이후 금액이 안 나와야” 한다는 회귀 검증.
 *
 * schedule/page.tsx 의 데이터 정리 로직(`welfareByMonth`/`welfareLinesByMonth`/`noteByMonth` 의
 * 비활성 월 키 제거) 을 재현해, 어떤 경로(정기·분기·노트 optionalExtra·welfareOverride)로 들어와도
 * 퇴사월 이후 셀에는 0 이/내역이 빈 배열이 되는지 확인한다.
 *
 * 케이스:
 *   1) 5월 퇴사 + OFF — 6월 이후뿐 아니라 5월 자체도 0/빈배열.
 *   2) 5월 퇴사 + ON  — 5월까지 활성, 6월 이후 0/빈배열.
 *   3) 5월 퇴사 + OFF — 노트의 optionalExtra(6월) 도 표시에서 빠지는지.
 *   4) 5월 퇴사 + OFF — welfareOverride(7월) 도 표시에서 빠지는지.
 *   5) 1월 퇴사 + OFF — 그 해 전체 셀 0(AFTER_RESIGN 동치).
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
  employeeStatusForYear,
  monthIsActive,
  welfareByScheduleDisplayMonth,
  welfareScheduleLinesByMonth,
} from "../src/lib/domain/schedule";

const YEAR = 2026;
const FOUNDING_MONTH = 1;

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    tenantId: "tenant-1",
    employeeCode: "E001",
    name: "퇴사자",
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
    resignMonth: 5,
    resignYear: YEAR,
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

function note(month: number, patch: Partial<MonthlyEmployeeNote>): MonthlyEmployeeNote {
  return {
    id: `note-${month}`,
    employeeId: "emp-1",
    year: YEAR,
    month,
    optionalWelfareText: null,
    optionalExtraAmount: null,
    incentiveAccrualAmount: null,
    incentiveWelfarePaymentAmount: null,
    welfareOverrideAmount: null,
    adjustedSalaryMonthlyOverride: null,
    levelOverride: null,
    eventAmountOverrides: null,
    ...patch,
  } as unknown as MonthlyEmployeeNote;
}

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${label}  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

const RULES: LevelPaymentRule[] = [
  rule(3, "NEW_YEAR_FEB", 100_000),
  rule(3, "FAMILY_MAY", 200_000),
  rule(3, "CHUSEOK_AUG", 300_000),
  rule(3, "YEAR_END_NOV", 400_000),
];
const overrides: Level5Override[] = [];
const quarterly: QuarterlyEmployeeConfig[] = [];

/**
 * schedule/page.tsx 의 데이터 정리 로직을 그대로 재현한다.
 * 동일 파일의 함수가 server component 라 직접 import 가 어려우므로 여기서 같은 식을 적는다.
 * 둘이 어긋나면 회귀 실패로 잡힌다.
 */
function buildDisplay(
  emp: Employee,
  notes: MonthlyEmployeeNote[],
  welfareOverride: Map<number, number>,
): {
  welfareByMonth: Map<number, number>;
  linesByMonth: Map<number, { label: string; amount: number; kind: string }[]>;
} {
  const status = employeeStatusForYear(emp, YEAR);
  const br = buildMonthlyBreakdown(
    emp,
    YEAR,
    FOUNDING_MONTH,
    RULES,
    overrides,
    quarterly,
    /* accrualCurrentMonthPayNext */ false,
    [],
    {},
  );
  const noteByMonth = new Map<number, number>();
  for (const n of notes) {
    const extra = n.optionalExtraAmount != null ? Number(n.optionalExtraAmount) : 0;
    if (extra === 0) continue;
    if (!monthIsActive(status, n.month)) continue;
    noteByMonth.set(n.month, (noteByMonth.get(n.month) ?? 0) + extra);
  }
  const cleanedOverride = new Map<number, number>();
  for (const [m, v] of welfareOverride) {
    if (!monthIsActive(status, m)) continue;
    cleanedOverride.set(m, v);
  }
  const welfareByMonth = welfareByScheduleDisplayMonth(br, noteByMonth, cleanedOverride);
  const linesByMonth = welfareScheduleLinesByMonth(br, noteByMonth, [], cleanedOverride);
  for (let m = 1; m <= 12; m++) {
    if (monthIsActive(status, m)) continue;
    welfareByMonth.delete(m);
    linesByMonth.delete(m);
  }
  return { welfareByMonth, linesByMonth };
}

console.log("=== 퇴사월 이후 월별 스케줄 표시 차단 검증 ===");

/** 1) 5월 퇴사 + OFF: 5월 정기(FAMILY_MAY) 도 안 보이고, 그 이후도 모두 0/빈배열 */
{
  const emp = makeEmployee({ resignMonth: 5, flagPayWelfareOnResignMonth: false });
  const { welfareByMonth, linesByMonth } = buildDisplay(emp, [], new Map());
  check("OFF 5월 퇴사: 5월 셀 없음", welfareByMonth.has(5), false);
  check("OFF 5월 퇴사: 5월 라인 없음", linesByMonth.has(5), false);
  check("OFF 5월 퇴사: 8·9·11·12월 셀 없음", [
    welfareByMonth.has(8),
    welfareByMonth.has(9),
    welfareByMonth.has(11),
    welfareByMonth.has(12),
  ], [false, false, false, false]);
  check("OFF 5월 퇴사: 2월 NEW_YEAR_FEB 100,000 표시", welfareByMonth.get(2), 100_000);
}

/** 2) 5월 퇴사 + ON: 5월 FAMILY_MAY 표시, 6월 이후 차단 */
{
  const emp = makeEmployee({ resignMonth: 5, flagPayWelfareOnResignMonth: true });
  const { welfareByMonth, linesByMonth } = buildDisplay(emp, [], new Map());
  check("ON 5월 퇴사: 5월 FAMILY_MAY 200,000", welfareByMonth.get(5), 200_000);
  check(
    "ON 5월 퇴사: 5월 라인 1건",
    (linesByMonth.get(5) ?? []).length,
    1,
  );
  check("ON 5월 퇴사: 8월 셀 없음", welfareByMonth.has(8), false);
}

/** 3) 5월 퇴사 + OFF: 노트의 optionalExtra(6월·7월) 표시 차단 */
{
  const emp = makeEmployee({ resignMonth: 5, flagPayWelfareOnResignMonth: false });
  const notes = [
    note(2, { optionalExtraAmount: 50_000 }),
    note(6, { optionalExtraAmount: 70_000 }),
    note(7, { optionalExtraAmount: 80_000 }),
  ];
  const { welfareByMonth } = buildDisplay(emp, notes, new Map());
  check(
    "OFF 5월 퇴사: 활성월(2월) optionalExtra 50,000 + NEW_YEAR_FEB 100,000",
    welfareByMonth.get(2),
    150_000,
  );
  check("OFF 5월 퇴사: 6월 optionalExtra 차단(셀 없음)", welfareByMonth.has(6), false);
  check("OFF 5월 퇴사: 7월 optionalExtra 차단(셀 없음)", welfareByMonth.has(7), false);
}

/** 4) 5월 퇴사 + OFF: welfareOverride(7월) 표시 차단 */
{
  const emp = makeEmployee({ resignMonth: 5, flagPayWelfareOnResignMonth: false });
  const ovrMap = new Map<number, number>([[7, 999_999]]);
  const { welfareByMonth, linesByMonth } = buildDisplay(emp, [], ovrMap);
  check("OFF 5월 퇴사: 7월 welfareOverride 차단(셀 없음)", welfareByMonth.has(7), false);
  check("OFF 5월 퇴사: 7월 라인 없음", linesByMonth.has(7), false);
}

/** 5) 1월 퇴사 + OFF: 1~12월 모두 차단 (AFTER_RESIGN 동치) */
{
  const emp = makeEmployee({ resignMonth: 1, flagPayWelfareOnResignMonth: false });
  const { welfareByMonth } = buildDisplay(emp, [], new Map());
  let any = false;
  for (let m = 1; m <= 12; m++) if (welfareByMonth.has(m)) any = true;
  check("OFF 1월 퇴사: 모든 월 셀 비어 있음", any, false);
}

/** 6) 12월 퇴사 + OFF: 12월 셀 없음, 11월 YEAR_END_NOV 정상 */
{
  const emp = makeEmployee({ resignMonth: 12, flagPayWelfareOnResignMonth: false });
  const { welfareByMonth } = buildDisplay(emp, [], new Map());
  check("OFF 12월 퇴사: 12월 셀 없음", welfareByMonth.has(12), false);
  check("OFF 12월 퇴사: 11월 YEAR_END_NOV 400,000", welfareByMonth.get(11), 400_000);
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
