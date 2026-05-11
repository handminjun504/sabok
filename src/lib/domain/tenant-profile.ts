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
  if (v == null || v === "") return "INDIVIDUAL";
  const raw = String(v).trim();
  if (raw === "법인") return "CORPORATE";
  if (raw === "개인") return "INDIVIDUAL";
  const u = raw.toUpperCase();
  if (u === "CORPORATE" || u === "CORPORATION") return "CORPORATE";
  if (u === "INDIVIDUAL" || u === "PERSON" || u === "SOLE") return "INDIVIDUAL";
  return "INDIVIDUAL";
}

export function parseTenantOperationMode(v: unknown): TenantOperationMode {
  const s = String(v ?? "GENERAL");
  if (s === "SALARY_WELFARE" || s === "INCENTIVE_WELFARE" || s === "COMBINED") return s;
  return "GENERAL";
}

/**
 * 「직원별 운영 모드」 매핑용 — 빈 문자열·null·undefined·잘못된 값은 모두 null 로 정규화.
 *
 * 직원 모드의 의미는 「거래처 모드의 override」 라서, null = 「override 없음 → 거래처 기본 모드 적용」.
 * `parseTenantOperationMode` 와 달리 GENERAL 로 강제 캐스팅하지 않는다 — 운영자가 명시적으로 GENERAL 을 골라
 * 「거래처 모드와 무관하게 일반으로 두기」 의도를 표현할 수 있도록 차원을 보존한다.
 */
export function parseTenantOperationModeOrNull(v: unknown): TenantOperationMode | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  if (s === "GENERAL" || s === "SALARY_WELFARE" || s === "INCENTIVE_WELFARE" || s === "COMBINED") return s;
  return null;
}

/**
 * 직원 모드(있으면 우선) → 거래처 모드 폴백 → 최종 GENERAL.
 *
 * 이 함수는 「실제 운영에 적용될 effective 모드」 를 계산하는 단일 진실 함수다.
 * 직원 모드가 null/undefined 면 거래처 모드를 그대로 따른다.
 */
export function effectiveEmployeeOperationMode(
  employeeMode: TenantOperationMode | null | undefined,
  tenantMode: TenantOperationMode | null | undefined,
): TenantOperationMode {
  if (employeeMode === "GENERAL" || employeeMode === "SALARY_WELFARE" || employeeMode === "INCENTIVE_WELFARE" || employeeMode === "COMBINED") {
    return employeeMode;
  }
  if (tenantMode === "GENERAL" || tenantMode === "SALARY_WELFARE" || tenantMode === "INCENTIVE_WELFARE" || tenantMode === "COMBINED") {
    return tenantMode;
  }
  return "GENERAL";
}

/** 카드·목록용 — 거래처 최초 등록 시 정한 개인·법인 적립 구분 */
export function tenantClientEntityLabel(t: TenantClientEntityType): string {
  return t === "CORPORATE" ? "법인 적립" : "개인 적립";
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

/**
 * 거래처별 기본 안내 멘트 방식.
 * - SINGLE: 매 달 하나씩 안내 (대부분 법인). 안내 패널은 단일월 카드/멘트를 강조한다.
 * - BATCHED: 여러 달을 한 번에 묶어서 안내 (대부분 개인사업자). 안내 패널은 묶음 카드/멘트를 강조하고
 *   `announcementBatchFromMonth` ~ `announcementBatchToMonth` 를 기본 구간으로 미리 채운다.
 */
export type AnnouncementMode = "SINGLE" | "BATCHED";

export function parseAnnouncementMode(v: unknown): AnnouncementMode {
  const s = String(v ?? "SINGLE").trim().toUpperCase();
  if (s === "BATCHED") return "BATCHED";
  return "SINGLE";
}

export function announcementModeLabel(m: AnnouncementMode): string {
  return m === "BATCHED" ? "묶음 안내(여러 달 한 번에)" : "단일월 안내(매 달)";
}

export const ANNOUNCEMENT_MODES: { value: AnnouncementMode; label: string; hint: string }[] = [
  {
    value: "SINGLE",
    label: "단일월 안내",
    hint: "매 달 하나씩 안내(법인 등 일반 운영).",
  },
  {
    value: "BATCHED",
    label: "묶음 안내",
    hint: "여러 달을 한 번에 묶어서 안내(개인사업자 등). 기본 시작·끝 월을 함께 저장.",
  },
];

/** 묶음 모드의 기본 시작·끝 월을 [1..12] 안으로 정규화. 시작 > 끝 이면 자동 swap. */
export function normalizeAnnouncementBatchRange(
  fromRaw: number | null | undefined,
  toRaw: number | null | undefined,
): { fromMonth: number; toMonth: number } {
  const clamp = (n: number | null | undefined, fallback: number) => {
    if (n == null || !Number.isFinite(Number(n))) return fallback;
    const v = Math.round(Number(n));
    if (v < 1) return 1;
    if (v > 12) return 12;
    return v;
  };
  const a = clamp(fromRaw, 1);
  const b = clamp(toRaw, 3);
  return { fromMonth: Math.min(a, b), toMonth: Math.max(a, b) };
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
