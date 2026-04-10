/**
 * 직원 직급 선택지. `대표이사`는 직원 코드 0번 규칙과 연동됩니다.
 * DB에 저장된 값이 목록에 없으면 폼에서 그 값을 맨 위 옵션으로만 보여 줍니다.
 */
export const EMPLOYEE_POSITION_OPTIONS = [
  "대표이사",
  "부사장",
  "전무",
  "상무",
  "이사",
  "부장",
  "차장",
  "과장",
  "대리",
  "주임",
  "사원",
  "수습",
  "계약직",
  "기타",
] as const;

export type EmployeePositionPreset = (typeof EMPLOYEE_POSITION_OPTIONS)[number];

export function employeePositionSelectValues(currentPosition: string | null | undefined): string[] {
  const cur = (currentPosition ?? "").trim();
  const presets = [...EMPLOYEE_POSITION_OPTIONS];
  if (cur && !presets.includes(cur as EmployeePositionPreset)) {
    return [cur, ...presets];
  }
  return presets;
}
