/**
 * PocketBase `sabok_tenants` — 위탁 고객사(사업장·기금 단위). 도메인: `fund-site-model.ts`
 */

import {
  OPERATION_INCENTIVE_SUMMARY,
  OPERATION_SALARY_REDUCTION_SUMMARY,
} from "./welfare-payment-principles";

export type TenantClientEntityType = "INDIVIDUAL" | "CORPORATE";

/** 사내근로복지기금을 어떤 구조로 운용하는지 분류 */
export type TenantOperationMode =
  | "GENERAL"
  | "SALARY_WELFARE"
  | "INCENTIVE_WELFARE"
  | "COMBINED";

export function parseTenantClientEntityType(v: unknown): TenantClientEntityType {
  return String(v) === "CORPORATE" ? "CORPORATE" : "INDIVIDUAL";
}

export function parseTenantOperationMode(v: unknown): TenantOperationMode {
  const s = String(v ?? "GENERAL");
  if (s === "SALARY_WELFARE" || s === "INCENTIVE_WELFARE" || s === "COMBINED") return s;
  return "GENERAL";
}

export function tenantClientEntityLabel(t: TenantClientEntityType): string {
  return t === "CORPORATE" ? "법인사업자" : "개인사업자";
}

export function tenantOperationModeLabel(m: TenantOperationMode): string {
  switch (m) {
    case "SALARY_WELFARE":
      return "급여낮추기 (고위험)";
    case "INCENTIVE_WELFARE":
      return "인센티브 지급";
    case "COMBINED":
      return "복합 (급여낮추기+인센 등)";
    default:
      return "일반·기타";
  }
}

export const TENANT_OPERATION_MODES: { value: TenantOperationMode; label: string; hint: string }[] = [
  {
    value: "GENERAL",
    label: "일반·기타",
    hint: "위 둘이 아니면. 메모에 적기.",
  },
  {
    value: "SALARY_WELFARE",
    label: "급여낮추기(고위험)",
    hint: OPERATION_SALARY_REDUCTION_SUMMARY,
  },
  {
    value: "INCENTIVE_WELFARE",
    label: "인센티브 지급",
    hint: OPERATION_INCENTIVE_SUMMARY,
  },
  {
    value: "COMBINED",
    label: "복합",
    hint: "둘 다 쓸 때.",
  },
];
