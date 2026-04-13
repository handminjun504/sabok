/**
 * 참고 스프레드시트의 「취합」 탭과 같은 의미의 테넌트 단위 요약(시트 API 연동 없음).
 * 세부 월별 계산은 schedule.ts 를 사용한다.
 */
import type { Employee, Level5Override, LevelPaymentRule, MonthlyEmployeeNote, QuarterlyEmployeeConfig } from "@/types/models";
import {
  type CustomPaymentScheduleDef,
  computeActualYearlyWelfareForEmployee,
} from "./schedule";

export type LevelWelfareAggregate = {
  level: number;
  count: number;
  yearlyWelfareSum: number;
};

export type TenantOperatingSummary = {
  year: number;
  foundingMonth: number;
  accrualCurrentMonthPayNext: boolean;
  employeeCount: number;
  byLevel: LevelWelfareAggregate[];
  totalYearlyWelfare: number;
  sumBaseSalary: number;
  sumAdjustedSalary: number;
  sumWelfareAllocation: number;
  sumIncentiveAmount: number;
};

function toInt(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(Number(n))) return 0;
  return Math.round(Number(n));
}

/**
 * 취합·LEVEL별 합과 동일한 의미: 레벨별 인원·연간 기금(정기+분기+선택 복지) 합.
 */
export function computeTenantOperatingSummary(
  employees: Employee[],
  year: number,
  foundingMonth: number,
  accrualCurrentMonthPayNext: boolean,
  rules: LevelPaymentRule[],
  overrides: Level5Override[],
  quarterly: QuarterlyEmployeeConfig[],
  notes: MonthlyEmployeeNote[],
  customPaymentEvents: CustomPaymentScheduleDef[] = []
): TenantOperatingSummary {
  const byLevelMap = new Map<number, { count: number; sum: number }>();
  for (let lv = 1; lv <= 5; lv++) {
    byLevelMap.set(lv, { count: 0, sum: 0 });
  }

  let totalYearlyWelfare = 0;
  let sumBaseSalary = 0;
  let sumAdjustedSalary = 0;
  let sumWelfareAllocation = 0;
  let sumIncentiveAmount = 0;

  for (const emp of employees) {
    sumBaseSalary += toInt(emp.baseSalary);
    sumAdjustedSalary += toInt(emp.adjustedSalary);
    sumWelfareAllocation += toInt(emp.welfareAllocation);
    if (emp.incentiveAmount != null && Number(emp.incentiveAmount) > 0) {
      sumIncentiveAmount += toInt(emp.incentiveAmount);
    }

    const ovr = overrides.filter((x) => x.employeeId === emp.id);
    const qcfg = quarterly.filter((x) => x.employeeId === emp.id);
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const yearly = computeActualYearlyWelfareForEmployee(
      emp,
      year,
      foundingMonth,
      accrualCurrentMonthPayNext,
      rules,
      ovr,
      qcfg,
      empNotes,
      customPaymentEvents
    );
    totalYearlyWelfare += yearly;

    const lv = emp.level >= 1 && emp.level <= 5 ? emp.level : 3;
    const bucket = byLevelMap.get(lv)!;
    bucket.count += 1;
    bucket.sum += yearly;
    byLevelMap.set(lv, bucket);
  }

  const byLevel: LevelWelfareAggregate[] = [1, 2, 3, 4, 5].map((level) => {
    const b = byLevelMap.get(level)!;
    return { level, count: b.count, yearlyWelfareSum: Math.round(b.sum) };
  });

  return {
    year,
    foundingMonth,
    accrualCurrentMonthPayNext,
    employeeCount: employees.length,
    byLevel,
    totalYearlyWelfare: Math.round(totalYearlyWelfare),
    sumBaseSalary,
    sumAdjustedSalary,
    sumWelfareAllocation,
    sumIncentiveAmount,
  };
}
