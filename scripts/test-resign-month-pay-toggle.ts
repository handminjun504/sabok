/**
 * `Employee.flagPayWelfareOnResignMonth` 토글이 월별 사복 표시에 정확히 반영되는지 회귀 검증.
 *
 * 기본 정책:
 *   - false(미체크, 기본값): 퇴사월 자체가 비활성 → 그 달 사복 0.
 *   - true(체크):           퇴사월 까지 활성  → 그 달 정기·분기 사복이 그대로 표시.
 *
 * 케이스:
 *   1) 5월 퇴사 + OFF: FAMILY_MAY(5월 귀속) 0, optionalExtra(5월) 0, 4월 분기는 활성.
 *   2) 5월 퇴사 + ON : FAMILY_MAY 정상 지급, optionalExtra(5월) 정상 집계.
 *   3) 1월 퇴사 + OFF: 그 해 전체 비활성(AFTER_RESIGN 동치) — NEW_YEAR_FEB 도 0.
 *   4) 1월 퇴사 + ON : 1월만 활성, 2월 이후 비활성.
 *   5) 12월 퇴사 + OFF: 11월까지 활성(YEAR_END_NOV 11월 귀속·12월 지급 → 지급월 비활성으로 차단).
 *   6) 12월 퇴사 + ON : 12월까지 활성 → YEAR_END_NOV 정상 지급.
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
} from "../src/lib/domain/schedule";
import { aggregateWelfareSpendBySource } from "../src/lib/domain/operating-welfare-legal-categories";

const YEAR = 2026;
const FOUNDING_MONTH = 1;

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    tenantId: "tenant-1",
    employeeCode: "E001",
    name: "홍길동",
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

function annualWelfare(emp: Employee): number {
  const rows = buildMonthlyBreakdown(
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
  return rows.reduce((s, r) => s + (r.totalWelfareMonth ?? 0), 0);
}

function welfareForAccrualMonth(emp: Employee, month: number): number {
  const rows = buildMonthlyBreakdown(
    emp,
    YEAR,
    FOUNDING_MONTH,
    RULES,
    overrides,
    quarterly,
    false,
    [],
    {},
  );
  return rows.find((r) => r.accrualMonth === month)?.totalWelfareMonth ?? 0;
}

console.log("=== 퇴사월 사복 지급 토글 회귀 ===");

/** 1) 5월 퇴사 + OFF — FAMILY_MAY(5월 귀속) 차단 */
const empOff = makeEmployee({ resignMonth: 5, flagPayWelfareOnResignMonth: false });
const statusOff = employeeStatusForYear(empOff, YEAR);
check(
  "5월 퇴사 OFF → ACTIVE_PARTIAL toMonth=4",
  statusOff.kind === "ACTIVE_PARTIAL" ? statusOff.range.toMonth : statusOff.kind,
  4,
);
check("OFF: FAMILY_MAY(5월 귀속) 0", welfareForAccrualMonth(empOff, 5), 0);
check(
  "OFF: NEW_YEAR_FEB(2월) 정상 100,000",
  welfareForAccrualMonth(empOff, 2),
  100_000,
);
check(
  "OFF: 연간 합 100,000 (NEW_YEAR_FEB 만)",
  annualWelfare(empOff),
  100_000,
);

/** 2) 5월 퇴사 + ON — FAMILY_MAY 정상 지급 */
const empOn = makeEmployee({ resignMonth: 5, flagPayWelfareOnResignMonth: true });
const statusOn = employeeStatusForYear(empOn, YEAR);
check(
  "5월 퇴사 ON → ACTIVE_PARTIAL toMonth=5",
  statusOn.kind === "ACTIVE_PARTIAL" ? statusOn.range.toMonth : statusOn.kind,
  5,
);
check("ON: FAMILY_MAY(5월 귀속) 200,000", welfareForAccrualMonth(empOn, 5), 200_000);
check(
  "ON: 연간 합 300,000 (NEW_YEAR_FEB + FAMILY_MAY)",
  annualWelfare(empOn),
  300_000,
);

/** 3) optionalExtra 집계도 같은 방식으로 토글에 반영 */
const notesOnMay = [note(5, { optionalExtraAmount: 30_000 })];
const spendOff = aggregateWelfareSpendBySource(
  [empOff],
  YEAR,
  FOUNDING_MONTH,
  false,
  RULES,
  overrides,
  quarterly,
  notesOnMay,
  [],
  {},
);
const spendOn = aggregateWelfareSpendBySource(
  [empOn],
  YEAR,
  FOUNDING_MONTH,
  false,
  RULES,
  overrides,
  quarterly,
  notesOnMay,
  [],
  {},
);
check("OFF: optionalExtraTotal(5월) 0", spendOff.optionalExtraTotal, 0);
check("ON: optionalExtraTotal(5월) 30,000", spendOn.optionalExtraTotal, 30_000);

/** 4) 1월 퇴사 + OFF → 그 해 전체 비활성(AFTER_RESIGN 동치) */
const empJanOff = makeEmployee({ resignMonth: 1, flagPayWelfareOnResignMonth: false });
const statusJanOff = employeeStatusForYear(empJanOff, YEAR);
check(
  "1월 퇴사 OFF → AFTER_RESIGN(1월도 비활성)",
  statusJanOff.kind,
  "AFTER_RESIGN",
);
check("OFF: 1월 퇴사 → 연간 합 0", annualWelfare(empJanOff), 0);

/** 5) 1월 퇴사 + ON → 1월만 활성 */
const empJanOn = makeEmployee({ resignMonth: 1, flagPayWelfareOnResignMonth: true });
const statusJanOn = employeeStatusForYear(empJanOn, YEAR);
check(
  "1월 퇴사 ON → ACTIVE_PARTIAL toMonth=1",
  statusJanOn.kind === "ACTIVE_PARTIAL" ? statusJanOn.range.toMonth : statusJanOn.kind,
  1,
);
check("ON: 1월 퇴사 → 2월 NEW_YEAR_FEB 차단 0", welfareForAccrualMonth(empJanOn, 2), 0);

/** 6) 12월 퇴사 + ON → 1~12월 전부 활성 (FULL_YEAR 동치) */
const empDecOn = makeEmployee({ resignMonth: 12, flagPayWelfareOnResignMonth: true });
const statusDecOn = employeeStatusForYear(empDecOn, YEAR);
check("12월 퇴사 ON → ACTIVE_FULL_YEAR", statusDecOn.kind, "ACTIVE_FULL_YEAR");
check(
  "ON: 12월 퇴사 → YEAR_END_NOV(11월 귀속) 400,000",
  welfareForAccrualMonth(empDecOn, 11),
  400_000,
);

/** 7) 12월 퇴사 + OFF → 11월까지만 활성 (toMonth=11) → YEAR_END_NOV 11월 귀속도 활성 */
const empDecOff = makeEmployee({ resignMonth: 12, flagPayWelfareOnResignMonth: false });
const statusDecOff = employeeStatusForYear(empDecOff, YEAR);
check(
  "12월 퇴사 OFF → ACTIVE_PARTIAL toMonth=11",
  statusDecOff.kind === "ACTIVE_PARTIAL" ? statusDecOff.range.toMonth : statusDecOff.kind,
  11,
);
check(
  "OFF: 12월 퇴사 → YEAR_END_NOV(11월 귀속·당월 지급) 400,000",
  welfareForAccrualMonth(empDecOff, 11),
  400_000,
);

/** 8) 활성 연도가 퇴사연도보다 이후면 항상 AFTER_RESIGN(토글과 무관) */
const empNextYearOn = makeEmployee({ resignYear: YEAR - 1, resignMonth: 5, flagPayWelfareOnResignMonth: true });
const statusNextYearOn = employeeStatusForYear(empNextYearOn, YEAR);
check(
  "다음 연도 호출 시 토글 ON 이어도 AFTER_RESIGN",
  statusNextYearOn.kind,
  "AFTER_RESIGN",
);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
