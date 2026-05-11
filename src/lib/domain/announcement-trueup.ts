/**
 * 「퇴사자 안내 멘트 — 급여 추가 지급(true-up) 정산」 도메인 헬퍼.
 *
 * 사용자 시나리오(2026-05 김남규 원장님 예시):
 *   - 5월 퇴사, 「퇴사월 사복 지급」 OFF, SALARY_WELFARE 운영.
 *   - [지급항목] 낮춘급여 7,000,000 + 인센 2,982,400(+5월 인센)
 *   - [차감항목] 사복 지급 누적 6,000,000 + 주4일 차감 1,000,000
 *   - [차액] 2,582,400(+5월 인센) — 5월 귀속 급여에 달아서 지급.
 *
 * 정책:
 *   1. 「낮춘 급여」 = (base − adjusted) / 12 × 활성 개월 수.
 *      - 운영자 표현: "월 540만 받아야 하는데 140만 낮추고 사복으로 지급" → 차액 140만/월.
 *      - adjusted ≥ base 거나 adjusted 가 비어 있으면 0(낮춤 의도 없음).
 *   2. 「인센 누적」 = 활성 월의 incentiveAccrualAmount 합 (세후 변환이 적용된 저장값).
 *   3. 「사복 지급 누적」 = computeActualWelfareThroughPaidMonth 등으로 계산된 실지급 사복.
 *   4. 「차감」 = Employee.salaryTrueUpDeductionWon (null/0 → 0). 메모는 안내 라인에 함께 노출.
 *   5. 「차액」 = max(0, (1)+(2) − (3)+(4)).  음수면 0(이미 충분히 받음).
 *
 * 적용 범위는 호출부(announcement/page.tsx) 에서 「퇴사자 + SALARY_WELFARE/COMBINED」 로 제한한다.
 */

import type { Employee } from "@/types/models";

export type AnnouncementTrueUpDetail = {
  /** (base − adjusted)/12 × 활성 개월수, 0 이상 정수. */
  loweredSalaryAccumulatedWon: number;
  /** 활성 월의 incentiveAccrualAmount 합. */
  incentiveAccrualYtdWon: number;
  /** 실지급 사복 누적(마지막 활성 월까지). */
  welfarePaidYtdWon: number;
  /** Employee.salaryTrueUpDeductionWon 정규화값(0 이상). */
  manualDeductionWon: number;
  /** 위 차감의 사유 메모(빈 문자열이면 null). */
  deductionMemo: string | null;
  /** 최종 차액 = max(0, lowered + incentive − welfarePaid − manualDeduction). */
  trueUpWon: number;
};

function n0(v: number | null | undefined): number {
  if (v == null) return 0;
  const num = Number(v);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

/**
 * 위 정책의 단일 진실 함수. 호출부가 인센·사복 누적은 별도로 계산해 넘긴다(테스트 가능성·중복 계산 회피).
 */
export function computeAnnouncementTrueUpDetail(args: {
  employee: Pick<Employee, "baseSalary" | "adjustedSalary" | "salaryTrueUpDeductionWon" | "salaryTrueUpDeductionMemo">;
  activeMonthsCount: number;
  incentiveAccrualYtdWon: number | null | undefined;
  welfarePaidYtdWon: number | null | undefined;
}): AnnouncementTrueUpDetail {
  const base = Math.max(0, n0(args.employee.baseSalary));
  const adj = Math.max(0, n0(args.employee.adjustedSalary));
  const n = Math.max(0, Math.min(12, Math.round(args.activeMonthsCount)));

  /**
   * 「낮춘 급여 분담분」 = (base − adj)/12 × n.
   * adj ≥ base 거나 adj=0(낮춤 의도 없음/미입력) 이면 0 으로 떨어뜨려 정상 직원에 0 영향.
   */
  const loweredPerMonth = adj > 0 && adj < base ? (base - adj) / 12 : 0;
  const loweredSalaryAccumulatedWon = Math.round(loweredPerMonth * n);

  const incentiveAccrualYtdWon = Math.max(0, n0(args.incentiveAccrualYtdWon));
  const welfarePaidYtdWon = Math.max(0, n0(args.welfarePaidYtdWon));
  const manualDeductionWon = Math.max(0, n0(args.employee.salaryTrueUpDeductionWon));
  const rawMemo = (args.employee.salaryTrueUpDeductionMemo ?? "").trim();
  const deductionMemo = rawMemo.length > 0 ? rawMemo : null;

  const trueUpWon = Math.max(
    0,
    loweredSalaryAccumulatedWon + incentiveAccrualYtdWon - welfarePaidYtdWon - manualDeductionWon,
  );

  return {
    loweredSalaryAccumulatedWon,
    incentiveAccrualYtdWon,
    welfarePaidYtdWon,
    manualDeductionWon,
    deductionMemo,
    trueUpWon,
  };
}

/**
 * 안내 메시지에 들어갈 「내역 요약」 1줄. 0 인 항목은 라인에서 생략해 잡음을 줄인다.
 * 예: "내역: 낮춘급여 7,000,000 + 인센 2,982,400 − 사복지급 6,000,000 − 차감 1,000,000(주4일 차감)"
 *
 * trueUp > 0 인 케이스에서만 의미가 있으므로 호출부에서 조건 분기 후 사용한다.
 */
export function formatAnnouncementTrueUpBreakdownLine(detail: AnnouncementTrueUpDetail): string {
  const parts: string[] = [];
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  if (detail.loweredSalaryAccumulatedWon > 0) parts.push(`낮춘급여 ${fmt(detail.loweredSalaryAccumulatedWon)}`);
  if (detail.incentiveAccrualYtdWon > 0) parts.push(`+ 인센 ${fmt(detail.incentiveAccrualYtdWon)}`);
  if (detail.welfarePaidYtdWon > 0) parts.push(`− 사복지급 ${fmt(detail.welfarePaidYtdWon)}`);
  if (detail.manualDeductionWon > 0) {
    const memoTail = detail.deductionMemo ? `(${detail.deductionMemo})` : "";
    parts.push(`− 차감 ${fmt(detail.manualDeductionWon)}${memoTail}`);
  }
  return parts.length > 0 ? `내역: ${parts.join(" ")}` : "";
}
