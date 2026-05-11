import type { TenantOperationMode } from "@/types/models";

/**
 * 발생 인센 한도(=「초과」/「임박」 판정 기준) 계산기.
 *
 * 모드별 정책:
 *   - `INCENTIVE_WELFARE` (인센티브 지급): 이 직원의 사복 지급액은 인센티브로만 흘러나간다.
 *     발생 인센 합계가 「연 사복 스케줄 합계(정기+분기+선택적복지+월별 오버라이드)」 를 넘으면
 *     초과분은 사복으로 처리할 수 없다 → 한도 = welfareScheduleTotalWon.
 *
 *   - 그 외(`GENERAL`, `SALARY_WELFARE`, `COMBINED`): 발생 인센은 사복 안에서 인센 항목 한도와만 비교.
 *     한도 = incentiveAmount(직원 마스터의 「예상 인센」). 0/null 이면 한도 비교 비활성.
 *
 * 음수·NaN·과대 입력은 모두 정상화하여 호출부가 분기 없이 잔여/초과를 계산할 수 있도록 한다.
 *
 * @returns
 *   - `limitWon`: 비교 한도(원). `null` 이면 한도 산정 불가(잔여/초과 라벨 비활성).
 *   - `source`: 어떤 기준을 썼는지(분석/툴팁/디버깅용).
 */
export function effectiveIncentiveAccrualLimitWon(args: {
  mode: TenantOperationMode;
  incentiveAmount: number | null | undefined;
  welfareScheduleTotalWon: number | null | undefined;
}): { limitWon: number | null; source: "incentive_amount" | "welfare_schedule" | "none" } {
  const { mode, incentiveAmount, welfareScheduleTotalWon } = args;

  if (mode === "INCENTIVE_WELFARE") {
    const v = normalizeWon(welfareScheduleTotalWon);
    return v != null
      ? { limitWon: v, source: "welfare_schedule" }
      : { limitWon: null, source: "none" };
  }

  const v = normalizeWon(incentiveAmount);
  return v != null
    ? { limitWon: v, source: "incentive_amount" }
    : { limitWon: null, source: "none" };
}

function normalizeWon(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/**
 * 한도 라벨/툴팁의 「기준이 무엇인지」 사용자에게 알리는 짧은 한글 라벨.
 * - INCENTIVE_WELFARE: 「사복 한도」 — 인센 합계가 사복 스케줄 합계를 넘으면 안 됨.
 * - 그 외: 「예상 인센 한도」 — 발생 인센이 예상 인센을 넘으면 안 됨.
 */
export function incentiveAccrualLimitBasisLabel(source: "incentive_amount" | "welfare_schedule" | "none"): string {
  if (source === "welfare_schedule") return "사복 한도";
  if (source === "incentive_amount") return "예상 인센 한도";
  return "한도 미설정";
}
