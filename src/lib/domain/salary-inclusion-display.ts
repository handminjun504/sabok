/**
 * 급여포함신고·스케줄에서 상한 대비 실지급의 초과/미달을 어떻게 보여줄지(운영 관점).
 * 덜 지급해도 되는 업체는 미달 열을 숨기고, 더 지급하면 안 되는 경우만 초과를 본다 등.
 */

import type { SalaryInclusionVarianceMode } from "@/types/models";

export function parseSalaryInclusionVarianceMode(v: unknown): SalaryInclusionVarianceMode {
  const u = String(v ?? "").trim().toUpperCase().replace(/-/g, "_");
  if (u === "OVER_ONLY" || u === "OVER") return "OVER_ONLY";
  if (u === "UNDER_ONLY" || u === "UNDER") return "UNDER_ONLY";
  return "BOTH";
}

export const SALARY_INCLUSION_VARIANCE_MODES: {
  value: SalaryInclusionVarianceMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "OVER_ONLY",
    label: "초과만 표시",
    hint: "상한보다 많이 지급한 경우만 봅니다. 덜 지급(미달)은 급여포함신고 관점에서 보지 않습니다.",
  },
  {
    value: "UNDER_ONLY",
    label: "미달만 표시",
    hint: "상한보다 적게 지급한 경우만 봅니다. 초과는 표시하지 않습니다.",
  },
  {
    value: "BOTH",
    label: "초과·미달 모두",
    hint: "상한보다 많거나 적은 차이를 모두 표시합니다.",
  },
];

export function salaryInclusionShowOverage(mode: SalaryInclusionVarianceMode): boolean {
  return mode === "BOTH" || mode === "OVER_ONLY";
}

export function salaryInclusionShowShortfall(mode: SalaryInclusionVarianceMode): boolean {
  return mode === "BOTH" || mode === "UNDER_ONLY";
}
