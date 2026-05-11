import type { Employee } from "@/types/models";

/**
 * 「사복 미대상」 단일 진실 — 두 신호 중 하나라도 true 면 미대상.
 *
 *   1) `level === 0` (정책): 「레벨 0 = 사복 미대상 = 0원」 — 사용자 정책(2026-05).
 *      직원 폼 셀렉트 0 입력 + saveEmployeeAction 의 자동 동기화로 `flagWelfareIneligible` 도 함께 true 가 박힌다.
 *   2) `flagWelfareIneligible === true` (legacy): 정책 정착 전 입력된 데이터·다른 경로(import/seed) 호환.
 *
 * 둘 중 하나만 true 라도 미대상으로 인정한다 — 폼·마이그레이션·CSV 등 어디서든 들어와도 안전 가드.
 * 사복 화면(스케줄·운영보고·안내·신고) 의 필터는 본 헬퍼만 호출하도록 통일했다.
 */
export function employeeWelfareIneligible(
  e: Pick<Employee, "level" | "flagWelfareIneligible">,
): boolean {
  if (e.flagWelfareIneligible === true) return true;
  const lv = Math.round(Number(e.level));
  if (Number.isFinite(lv) && lv === 0) return true;
  return false;
}

/** 「사복 대상」 — `employeeWelfareIneligible` 의 부정. 명료성을 위한 별칭. */
export function employeeWelfareEligible(
  e: Pick<Employee, "level" | "flagWelfareIneligible">,
): boolean {
  return !employeeWelfareIneligible(e);
}
