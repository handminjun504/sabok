/**
 * 조정연봉 감사(audit) 유틸 — “조사표에 올린 조정연봉”(Employee.adjustedSalary) vs
 * “실제 월별 누적 조정연봉”(Σ `resolveEffectiveAdjustedSalaryForMonth` × 12) 의 차이를 진단한다.
 *
 * 배경:
 *   `baseSalary × 12 = adjustedSalary × 12 + 연간 사복 지급합` 불변식을 유지하기 위해
 *   중도 재분배는 월별 `adjustedSalaryOverrideAmount` 를 저장한다. 그러나 재분배는
 *   `Employee.adjustedSalary` 자체를 갱신하지는 않으므로, 조사표 UI 에 노출되는
 *   "연 조정급여" 와 실제 월별 합이 어긋나는 경우가 생긴다.
 *
 *   본 모듈은 그 차이를 수치로 뽑고, 동기화(`Employee.adjustedSalary ← 실제 누적`) 를
 *   안전하게 수행할 수 있도록 보조한다.
 */

import type { Employee, MonthlyEmployeeNote } from "@/types/models";
import { resolveEffectiveAdjustedSalaryForMonth } from "./salary-inclusion";
import { employeeStatusForYear } from "./schedule";

function toNum(v: number | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type AdjustedSalaryAudit = {
  employeeId: string;
  employeeCode: string;
  name: string;
  level: number;
  /** `Employee.adjustedSalary` — 조사표에 올린 값. 0 이하면 baseSalary 로 폴백되므로 별도 표시. */
  surveyAdjustedAnnual: number;
  /** 월 조정급여의 1~12월 합. override 가 있으면 그 값, 없으면 `surveyAdjustedAnnual/12`. */
  actualAdjustedAnnual: number;
  /** `actualAdjustedAnnual − surveyAdjustedAnnual`. 양수 = 실제가 더 큼, 음수 = 실제가 더 작음. */
  diff: number;
  /** 이 연도에 `adjustedSalaryOverrideAmount` 가 저장된 월 목록 (오름차순). */
  overrideMonths: number[];
  /** 활성(재직) 월 범위 — 퇴사자/신규입사자의 부분 범위를 표시용으로 제공. */
  activeRange: { fromMonth: number; toMonth: number } | null;
  /** 퇴사자 여부 — 재직 구간이 전혀 없으면 true. */
  isAfterResign: boolean;
  /**
   * 동기화 시 `Employee.adjustedSalary` 로 쓸 값.
   * - overrideMonths.length > 0 이면 `actualAdjustedAnnual` (월별 합).
   * - 그렇지 않으면 현재 값 유지(null).
   */
  resyncTo: number | null;
};

/**
 * 단일 직원에 대해 조사표/실제 누적 조정연봉 진단을 계산한다.
 *
 * - `baseSalary` 만 있고 `adjustedSalary` 가 0 이면 조사표 값은 `baseSalary` 로 간주한다
 *   (`resolveEffectiveAdjustedSalaryForMonth` 의 폴백과 일치).
 * - 모든 12개월을 합산한다. 월별 override 가 없는 월은 자연스럽게 `조사표/12` 가 반영된다.
 */
export function computeAdjustedSalaryAudit(
  employee: Employee,
  year: number,
  notes: ReadonlyArray<MonthlyEmployeeNote>,
): AdjustedSalaryAudit {
  const empNotes = notes.filter((n) => n.employeeId === employee.id && n.year === year);
  const status = employeeStatusForYear(employee, year);
  const activeRange =
    status.kind === "ACTIVE_FULL_YEAR"
      ? { fromMonth: 1, toMonth: 12 }
      : status.kind === "ACTIVE_PARTIAL"
        ? { fromMonth: status.range.fromMonth, toMonth: status.range.toMonth }
        : null;
  const isAfterResign = status.kind === "AFTER_RESIGN";

  const adj = toNum(employee.adjustedSalary);
  const base = toNum(employee.baseSalary);
  const surveyAdjustedAnnual = Math.round(adj > 0 ? adj : base);

  let actual = 0;
  const overrideMonths: number[] = [];
  for (let m = 1; m <= 12; m++) {
    actual += resolveEffectiveAdjustedSalaryForMonth(employee, year, m, empNotes);
    const note = empNotes.find((n) => n.month === m);
    if (note?.adjustedSalaryOverrideAmount != null) overrideMonths.push(m);
  }

  const diff = actual - surveyAdjustedAnnual;
  const resyncTo = overrideMonths.length > 0 ? actual : null;

  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    name: employee.name,
    level: Math.max(1, Math.min(5, Math.round(Number(employee.level) || 1))),
    surveyAdjustedAnnual,
    actualAdjustedAnnual: actual,
    diff,
    overrideMonths,
    activeRange,
    isAfterResign,
    resyncTo,
  };
}

/**
 * 테넌트 전체 직원 감사 — 퇴사자 포함(조사표 값과 어긋나면 과거 연도라도 보여주는 게 안전).
 * 결과는 진단상 "유의미한" 순서(`diff` 큰 순, 다음으로 코드) 로 정렬.
 */
export function computeAdjustedSalaryAuditList(
  employees: ReadonlyArray<Employee>,
  year: number,
  notes: ReadonlyArray<MonthlyEmployeeNote>,
): AdjustedSalaryAudit[] {
  const rows = employees.map((e) => computeAdjustedSalaryAudit(e, year, notes));
  return rows.sort((a, b) => {
    const ad = Math.abs(a.diff);
    const bd = Math.abs(b.diff);
    if (ad !== bd) return bd - ad;
    return a.employeeCode.localeCompare(b.employeeCode, "ko-KR");
  });
}

/** 진단 결과 중 "중도 변동이 있어 동기화 대상인" 직원만 필터. */
export function listMismatchedEmployees(
  audits: ReadonlyArray<AdjustedSalaryAudit>,
): AdjustedSalaryAudit[] {
  return audits.filter((a) => a.overrideMonths.length > 0 && a.diff !== 0);
}
