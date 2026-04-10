/** 시급 최저임금 → 월 209h 연환산. 연도별 시급은 고시에 맞게 수정. */
const HOURLY_KRW_BY_YEAR: Record<number, number> = {
  2024: 9860,
  2025: 10030,
  2026: 10320,
};

const MONTHLY_HOURS_209 = 209;

/** 해당 연도 시급이 없으면 가장 최근 고시 연도(내림) 시급을 사용 */
export function koreaMinimumHourlyWon(year: number): number {
  const keys = Object.keys(HOURLY_KRW_BY_YEAR)
    .map(Number)
    .sort((a, b) => a - b);
  let y = year;
  while (y >= 2000 && HOURLY_KRW_BY_YEAR[y] == null) y -= 1;
  if (HOURLY_KRW_BY_YEAR[y] != null) return HOURLY_KRW_BY_YEAR[y];
  return HOURLY_KRW_BY_YEAR[keys[keys.length - 1]!]!;
}

/** 주 40시간·월 209시간 환산 기준 연간 최저임금 상당액(원, 세전) */
export function koreaMinimumAnnualSalaryWon(year: number): number {
  return Math.round(koreaMinimumHourlyWon(year) * MONTHLY_HOURS_209 * 12);
}
