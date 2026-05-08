import type {
  CompanySettings,
  CustomReturnsSchedule,
  Employee,
  Level5Override,
  LevelPaymentRule,
  MonthlyEmployeeNote,
  QuarterlyEmployeeConfig,
} from "@/types/models";
import type { CustomPaymentScheduleDef } from "@/lib/domain/schedule";
import {
  buildMonthlyBreakdown,
  monthlyOverrideMapFromNotes,
  welfareByScheduleDisplayMonth,
} from "@/lib/domain/schedule";
import { customPaymentScheduleRows } from "@/lib/domain/payment-events";

export type WelfareTotalsByMonth = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

export type WelfareTotalsForYear = {
  /**
   * 정기 + 분기 스케줄 합 (선택적복지·대표반환·커스텀 반환 미포함).
   * 「사복 총 집행 금액(선택적복지X, 대표반환X)」 KPI 와 수수료 base B 의 직접 입력.
   */
  scheduleByMonth: WelfareTotalsByMonth;
  /** 월별 노트 `optionalExtraAmount` 합 — 「선택적복지 합계」 KPI 입력 */
  optionalByMonth: WelfareTotalsByMonth;
  /** `CompanySettings.repReturnSchedule` 직원합 (월별) */
  repReturnByMonth: WelfareTotalsByMonth;
  /** 모든 「+ 반환 추가」 카테고리 합 (월별, 카테고리·직원 통합) */
  customReturnsByMonth: WelfareTotalsByMonth;
  /**
   * 수수료 base A — 선택적복지 포함, 대표반환·커스텀 반환 차감.
   * `scheduleByMonth + optionalByMonth − repReturnByMonth − customReturnsByMonth` (음수는 0 으로 클램프).
   */
  baseAWithOptionalByMonth: WelfareTotalsByMonth;
  /** 수수료 base B — 정기·분기 스케줄만. `scheduleByMonth` 와 동일하지만 의미 명시. */
  baseBScheduleOnlyByMonth: WelfareTotalsByMonth;
};

const ZERO_12: WelfareTotalsByMonth = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;

function arr12<T>(): T[] {
  return Array.from({ length: 12 }, () => 0 as unknown as T);
}

function asTotalsByMonth(arr: number[]): WelfareTotalsByMonth {
  return arr.slice(0, 12) as unknown as WelfareTotalsByMonth;
}

function sumEmployeeMonthlyAmountMap(
  schedule: Record<string, Partial<Record<string, number>>> | null | undefined,
): WelfareTotalsByMonth {
  if (!schedule) return ZERO_12;
  const out = arr12<number>();
  for (const row of Object.values(schedule)) {
    if (!row) continue;
    for (let m = 1; m <= 12; m++) {
      const v = row[String(m)];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[m - 1] += Math.round(v);
      }
    }
  }
  return asTotalsByMonth(out);
}

function sumCustomReturns(schedule: CustomReturnsSchedule | null | undefined): WelfareTotalsByMonth {
  if (!schedule || !Array.isArray(schedule.categories) || schedule.categories.length === 0) return ZERO_12;
  const out = arr12<number>();
  for (const cat of schedule.categories) {
    const partial = sumEmployeeMonthlyAmountMap(cat.byEmployeeMonth);
    for (let i = 0; i < 12; i++) out[i] += partial[i];
  }
  return asTotalsByMonth(out);
}

/**
 * 한 직원의 「정기 + 분기 + 노트 override(welfare/level/event)」 결과를 paidMonth 기준 12-칸으로 환원.
 * `welfareByScheduleDisplayMonth` 와 동일한 규약(=N월 칸 = N월 지급분)으로 모인다.
 *
 * 「선택적 복지(`optionalExtraAmount`)」는 의도적으로 제외 — 별도 KPI 로 따로 합산한다.
 */
function scheduleByMonthForEmployee(
  emp: Employee,
  year: number,
  foundingMonth: number,
  rules: LevelPaymentRule[],
  overridesAll: Level5Override[],
  quarterlyAll: QuarterlyEmployeeConfig[],
  customPaymentEvents: CustomPaymentScheduleDef[],
  fixedEventMonths: Partial<Record<string, number>> | null | undefined,
  notesAll: MonthlyEmployeeNote[],
): WelfareTotalsByMonth {
  const overridesForEmployee = overridesAll.filter((o) => o.employeeId === emp.id);
  const quarterlyForEmployee = quarterlyAll.filter((q) => q.employeeId === emp.id && q.year === year);
  const notesForEmployee = notesAll.filter((n) => n.employeeId === emp.id && n.year === year);
  const noteOverrideMap = monthlyOverrideMapFromNotes(notesForEmployee, year);
  const breakdown = buildMonthlyBreakdown(
    emp,
    year,
    foundingMonth,
    rules,
    overridesForEmployee,
    quarterlyForEmployee,
    customPaymentEvents,
    (fixedEventMonths ?? {}) as Partial<Record<"NEW_YEAR_FEB" | "FAMILY_MAY" | "CHUSEOK_AUG" | "YEAR_END_NOV", number>>,
    noteOverrideMap,
  );
  /**
   * `welfareByScheduleDisplayMonth` 는 노트의 `welfareOverrideAmount` 가 있는 달은 그 값으로 대체한다 —
   * 실제 「그 달 사복 지급액」 으로 일치시키기 위해 동일 함수 사용.
   */
  const welfareOverrideMap = new Map<number, number>();
  for (const n of notesForEmployee) {
    if (n.welfareOverrideAmount != null && Number.isFinite(Number(n.welfareOverrideAmount))) {
      welfareOverrideMap.set(n.month, Math.round(Number(n.welfareOverrideAmount)));
    }
  }
  const map = welfareByScheduleDisplayMonth(breakdown, undefined, welfareOverrideMap);
  const out = arr12<number>();
  for (let m = 1; m <= 12; m++) out[m - 1] = Math.round(Math.max(0, map.get(m) ?? 0));
  return asTotalsByMonth(out);
}

function optionalByMonthForYear(notes: MonthlyEmployeeNote[], year: number): WelfareTotalsByMonth {
  const out = arr12<number>();
  for (const n of notes) {
    if (n.year !== year) continue;
    if (n.month == null || n.month < 1 || n.month > 12) continue;
    const v = Number(n.optionalExtraAmount);
    if (Number.isFinite(v) && v > 0) out[n.month - 1] += Math.round(v);
  }
  return asTotalsByMonth(out);
}

/**
 * 한 해의 직원 전체에 대해 사복 집행 합계를 한 번에 산출.
 *
 * 인자는 「월별 스케줄 페이지」가 이미 가져오는 컬렉션과 같아야 한다 — 호출자(서버 컴포넌트)는
 * `Promise.all` 로 한 번에 묶어 가져온 결과를 그대로 넘기면 된다.
 */
export function computeWelfareTotalsForYear(args: {
  employees: ReadonlyArray<Employee>;
  year: number;
  settings: CompanySettings | null;
  rules: LevelPaymentRule[];
  overrides: Level5Override[];
  quarterly: QuarterlyEmployeeConfig[];
  notes: MonthlyEmployeeNote[];
}): WelfareTotalsForYear {
  const foundingMonth = args.settings?.foundingMonth ?? 1;
  const customPaymentEvents: CustomPaymentScheduleDef[] = customPaymentScheduleRows(
    args.settings ?? null,
    args.year,
  );

  /** 직원별 정기·분기 by month → 회사 전체 합계 */
  const scheduleAcc = arr12<number>();
  for (const emp of args.employees) {
    const empByMonth = scheduleByMonthForEmployee(
      emp,
      args.year,
      foundingMonth,
      args.rules,
      args.overrides,
      args.quarterly,
      customPaymentEvents,
      args.settings?.fixedEventMonths ?? null,
      args.notes,
    );
    for (let i = 0; i < 12; i++) scheduleAcc[i] += empByMonth[i];
  }
  const scheduleByMonth = asTotalsByMonth(scheduleAcc);
  const optionalByMonth = optionalByMonthForYear(args.notes, args.year);
  const repReturnByMonth = sumEmployeeMonthlyAmountMap(args.settings?.repReturnSchedule ?? null);
  const customReturnsByMonth = sumCustomReturns(args.settings?.customReturnsSchedule ?? null);

  const baseAArr = arr12<number>();
  for (let i = 0; i < 12; i++) {
    /** 음수 클램프 — 잘못된 입력으로 base 가 음수가 되어 수수료가 음수로 깎이는 사고를 방지. */
    baseAArr[i] = Math.max(
      0,
      scheduleByMonth[i] + optionalByMonth[i] - repReturnByMonth[i] - customReturnsByMonth[i],
    );
  }
  return {
    scheduleByMonth,
    optionalByMonth,
    repReturnByMonth,
    customReturnsByMonth,
    baseAWithOptionalByMonth: asTotalsByMonth(baseAArr),
    baseBScheduleOnlyByMonth: scheduleByMonth,
  };
}

export function sumWelfareByMonth(arr: WelfareTotalsByMonth): number {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}
