/**
 * 퇴사월 이후 사복 지급이 어떠한 경로로도 발생하지 않는지 회귀 검증.
 *
 * 시나리오 1: 5월(5월) 퇴사 직원 + accrualCurrentMonthPayNext=true.
 *   - 4월 귀속 → 5월 지급: 활성. 정기 이벤트 발생.
 *   - 5월 귀속 → 6월 지급: 지급월 비활성 → 모든 지급 0.
 *   - 6월 귀속 → 7월 지급: 귀속/지급 모두 비활성 → 0.
 *   - 6월 귀속에 welfareOverrideAmount, eventAmountOverrides 가 남아 있어도 0.
 *
 * 시나리오 2: aggregateWelfareSpendBySource 가 퇴사 이후 월의
 *   welfareOverrideAmount·optionalExtraAmount 를 집계에 포함하지 않음.
 */
import type {
  Employee,
  Level5Override,
  LevelPaymentRule,
  MonthlyEmployeeNote,
  QuarterlyEmployeeConfig,
} from "../src/types/models";
import { buildMonthlyBreakdown } from "../src/lib/domain/schedule";
import { aggregateWelfareSpendBySource } from "../src/lib/domain/operating-welfare-legal-categories";

const YEAR = 2025;
const FOUNDING_MONTH = 1;

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
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
    birthMonth: 3,
    hireMonth: 1,
    resignMonth: 5,
    resignYear: YEAR,
    weddingMonth: null,
    childrenInfant: 0,
    childrenPreschool: 0,
    childrenTeen: 0,
    parentsCount: 0,
    parentsInLawCount: 0,
    flagRepReturn: false,
    /**
     * 이 회귀 테스트의 가정은 "5월 퇴사인 경우 5월 자체는 활성, 6월부터 비활성".
     * → `flagPayWelfareOnResignMonth: true` 로 명시해 기존 시나리오 그대로 유지.
     * OFF(=신규 기본값) 케이스는 별도 회귀(`test-resign-month-pay-toggle.ts`) 에서 검증.
     */
    flagPayWelfareOnResignMonth: true,
    rank: null,
    payDay: null,
    loanPrincipal: null,
    loanInterest: null,
    monthlyRentAmount: null,
    createdAt: null,
    updatedAt: null,
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
  console.log("=== 퇴사월 이후 사복지급 차단 검증 ===");

  /** 시나리오 1: buildMonthlyBreakdown */
  const emp = makeEmployee();
  const rules: LevelPaymentRule[] = [
    rule(3, "NEW_YEAR_FEB", 300_000),
    rule(3, "FAMILY_MAY", 400_000),
    rule(3, "CHUSEOK_AUG", 500_000),
    rule(3, "YEAR_END_NOV", 600_000),
  ];
  const overrides: Level5Override[] = [];
  const quarterly: QuarterlyEmployeeConfig[] = [];

  /** 6월 귀속(=7월 지급)에 override 남김 → 퇴사 이후라 0 이어야 */
  const overrideMap = new Map<number, { welfareOverrideAmount: number | null; levelOverride: number | null; eventAmountOverrides: Record<string, number> | null }>([
    [
      6,
      {
        welfareOverrideAmount: 999_999,
        levelOverride: null,
        eventAmountOverrides: { NEW_YEAR_FEB: 888_888 },
      },
    ],
  ]);

  const rows = buildMonthlyBreakdown(
    emp,
    YEAR,
    FOUNDING_MONTH,
    rules,
    overrides,
    quarterly,
    /* accrualCurrentMonthPayNext */ true,
    [],
    {},
    overrideMap,
  );

  /**
   * 기본 이벤트 월: NEW_YEAR_FEB=2월 귀속, FAMILY_MAY=5월 귀속, CHUSEOK_AUG=8월 귀속, YEAR_END_NOV=11월 귀속.
   * 5월 퇴사 + 익월 지급이므로 FAMILY_MAY 는 귀속 5월 활성이지만 지급 6월 비활성 → 차단.
   */
  const byAccrual = new Map(rows.map((r) => [r.accrualMonth, r]));
  check("2월 귀속(3월 지급) 활성: NEW_YEAR_FEB 300000", byAccrual.get(2)?.totalWelfareMonth ?? 0, 300_000);
  check("5월 귀속(6월 지급) 지급월 비활성 → FAMILY_MAY 차단 0", byAccrual.get(5)?.totalWelfareMonth ?? 0, 0);
  check(
    "6월 귀속(7월 지급) 귀속/지급 모두 비활성 → override 남아있어도 0",
    byAccrual.get(6)?.totalWelfareMonth ?? 0,
    0,
  );
  check("8월 귀속(9월 지급) 비활성 → CHUSEOK_AUG 차단 0", byAccrual.get(8)?.totalWelfareMonth ?? 0, 0);
  check("11월 귀속(12월 지급) 비활성 → YEAR_END_NOV 차단 0", byAccrual.get(11)?.totalWelfareMonth ?? 0, 0);

  /** 시나리오 2: aggregateWelfareSpendBySource */
  const notes: MonthlyEmployeeNote[] = [
    note(5, { optionalExtraAmount: 30_000 }),
    note(6, { optionalExtraAmount: 50_000, welfareOverrideAmount: 100_000 }),
    note(7, { optionalExtraAmount: 70_000 }),
  ];
  const spend = aggregateWelfareSpendBySource(
    [emp],
    YEAR,
    FOUNDING_MONTH,
    /* accrualCurrentMonthPayNext */ true,
    rules,
    overrides,
    quarterly,
    notes,
    [],
    {},
  );

  check(
    "optionalExtraTotal: 활성 월(5월) 30000 만 집계, 6·7월 제외",
    spend.optionalExtraTotal,
    30_000,
  );
  check(
    "MIDYEAR_OVERRIDE: 퇴사 이후(6월) welfareOverride 는 집계 제외",
    spend.regularByEventKey["MIDYEAR_OVERRIDE"] ?? 0,
    0,
  );
  /** NEW_YEAR_FEB 만 통과(2월 귀속/3월 지급). FAMILY_MAY(5월 귀속/6월 지급)·CHUSEOK·YEAR_END 는 퇴사 이후로 차단. */
  check("regular NEW_YEAR_FEB 300000", spend.regularByEventKey["NEW_YEAR_FEB"] ?? 0, 300_000);
  check(
    "regular FAMILY_MAY 차단 0 (5월 귀속·6월 지급 — 지급월 비활성)",
    spend.regularByEventKey["FAMILY_MAY"] ?? 0,
    0,
  );
  check(
    "regular CHUSEOK_AUG 차단 0",
    spend.regularByEventKey["CHUSEOK_AUG"] ?? 0,
    0,
  );
  check(
    "regular YEAR_END_NOV 차단 0",
    spend.regularByEventKey["YEAR_END_NOV"] ?? 0,
    0,
  );

  console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
  if (failed > 0) process.exit(1);
}

main();
