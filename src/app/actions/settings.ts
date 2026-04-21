"use server";

import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { companySettingsUpsert } from "@/lib/pb/repository";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { canEditCompanySettings } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";
import { revalidateSettingsArtifacts } from "@/lib/util/revalidate";

const schema = z.object({
  foundingMonth: z.coerce.number().min(1).max(12),
  defaultPayDay: z.coerce.number().min(1).max(31),
  activeYear: z.coerce.number().min(2000).max(2100),
  accrualCurrentMonthPayNext: z.coerce.boolean(),
  salaryInclusionVarianceMode: z.enum(["BOTH", "OVER_ONLY", "UNDER_ONLY"]),
  surveyShowRepReturn: z.boolean(),
  surveyShowSpouseReceipt: z.boolean(),
  surveyShowWorkerNet: z.boolean(),
  /**
   * 내장 정기 4종(NEW_YEAR_FEB / FAMILY_MAY / CHUSEOK_AUG / YEAR_END_NOV) 의 귀속 월 오버라이드.
   * 비어 있는 값(`""`) 은 “기본값 사용”으로 간주.
   */
  fixedEventMonths: z
    .object({
      NEW_YEAR_FEB: z.coerce.number().int().min(1).max(12).optional(),
      FAMILY_MAY: z.coerce.number().int().min(1).max(12).optional(),
      CHUSEOK_AUG: z.coerce.number().int().min(1).max(12).optional(),
      YEAR_END_NOV: z.coerce.number().int().min(1).max(12).optional(),
    })
    .nullable(),
  quarterlyPayMonths: z
    .record(z.string(), z.array(z.number().int().min(1).max(12)))
    .nullable(),
  repReturnSchedule: z
    .record(z.string(), z.record(z.string(), z.number().int().min(0)))
    .nullable(),
});

const QUARTERLY_ITEM_KEYS = [
  "INFANT_SCHOLARSHIP",
  "PRESCHOOL_SCHOLARSHIP",
  "TEEN_SCHOLARSHIP",
  "PARENT_SUPPORT",
  "HEALTH_INSURANCE",
  "HOUSING_INTEREST",
  "HOUSING_RENT",
] as const;

/** 폼에서 항목별 지급 월 체크박스를 읽어 정규화. 기본값([3,6,9,12])과 동일하면 저장 생략. */
function pickQuarterlyPayMonths(formData: FormData): Record<string, number[]> | null {
  const DEFAULT = [3, 6, 9, 12];
  const out: Record<string, number[]> = {};
  for (const k of QUARTERLY_ITEM_KEYS) {
    const raw = formData.getAll(`quarterlyPayMonth_${k}`).map((v) => {
      const n = Math.round(Number(String(v)));
      return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
    }).filter((n): n is number => n != null);
    const sorted = [...new Set(raw)].sort((a, b) => a - b);
    if (sorted.join(",") === DEFAULT.join(",")) continue;
    if (sorted.length > 0) out[k] = sorted;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 대표반환 월별 금액 폼 파싱.
 * 입력 name 형식: `repReturn_${employeeId}_${month}` (1~12)
 * 0 또는 빈값은 저장하지 않는다.
 */
function pickRepReturnSchedule(formData: FormData): Record<string, Partial<Record<string, number>>> | null {
  const out: Record<string, Partial<Record<string, number>>> = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("repReturn_")) continue;
    const parts = name.split("_");
    if (parts.length !== 3) continue;
    const empId = parts[1];
    const monthStr = parts[2];
    const mNum = parseInt(monthStr, 10);
    if (!empId || !Number.isFinite(mNum) || mNum < 1 || mNum > 12) continue;
    const raw = String(value).replace(/,/g, "").trim();
    if (!raw) continue;
    const amt = Math.round(Number(raw));
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (!out[empId]) out[empId] = {};
    out[empId][monthStr] = amt;
  }
  return Object.keys(out).length ? out : null;
}

const FIXED_EVENT_DEFAULTS: Record<"NEW_YEAR_FEB" | "FAMILY_MAY" | "CHUSEOK_AUG" | "YEAR_END_NOV", number> = {
  NEW_YEAR_FEB: 2,
  FAMILY_MAY: 5,
  CHUSEOK_AUG: 8,
  YEAR_END_NOV: 11,
};

/**
 * 폼에서 4개 월 입력을 읽어 1~12 범위 정수만 살리고, 기본값과 같은 키는 굳이 저장하지 않는다(공백 = 기본값 사용).
 * 결과가 비면 null 을 돌려 PB 에 빈 객체 대신 null 을 명시적으로 저장.
 */
function pickFixedEventMonths(formData: FormData): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const k of Object.keys(FIXED_EVENT_DEFAULTS) as (keyof typeof FIXED_EVENT_DEFAULTS)[]) {
    const raw = String(formData.get(`fixedEventMonth_${k}`) ?? "").trim();
    if (!raw) continue;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1 || n > 12) continue;
    if (n === FIXED_EVENT_DEFAULTS[k]) continue;
    out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

export type SettingsState = { 오류?: string; 성공?: boolean } | null;

export async function saveCompanySettingsAction(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "전사 설정을 수정할 권한이 없습니다." };

  const fixedEventMonths = pickFixedEventMonths(formData);
  const quarterlyPayMonths = pickQuarterlyPayMonths(formData);
  const repReturnSchedule = pickRepReturnSchedule(formData);
  const parsed = schema.safeParse({
    foundingMonth: formData.get("foundingMonth"),
    defaultPayDay: formData.get("defaultPayDay"),
    activeYear: formData.get("activeYear"),
    accrualCurrentMonthPayNext: formData.get("accrualCurrentMonthPayNext") === "on",
    salaryInclusionVarianceMode: formData.get("salaryInclusionVarianceMode"),
    surveyShowRepReturn: formData.get("surveyShowRepReturn") === "on",
    surveyShowSpouseReceipt: formData.get("surveyShowSpouseReceipt") === "on",
    surveyShowWorkerNet: formData.get("surveyShowWorkerNet") === "on",
    fixedEventMonths,
    quarterlyPayMonths,
    repReturnSchedule,
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  try {
    await companySettingsUpsert(ctx.tenantId, parsed.data);
  } catch (e) {
    console.error("[saveCompanySettingsAction]", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    const schemaHint =
      /accrualcurrentmonthpaynext|surveyshow|nonempty|cannot be blank|missing required/i.test(detail)
        ? " sabok_company_settings 의 bool·number에 Nonempty가 켜져 있으면 false·0이 거절됩니다. `npm run pb:fix-company-settings-schema` 실행 후 다시 저장하세요."
        : " salaryInclusionVarianceMode 값(BOTH/OVER_ONLY/UNDER_ONLY)·필드 타입·PB 훅을 확인하세요.";
    return { 오류: `${detail} ·${schemaHint}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "CompanySettings",
    entityId: ctx.tenantId,
    payload: parsed.data,
  });
  revalidateSettingsArtifacts();
  return { 성공: true };
}
