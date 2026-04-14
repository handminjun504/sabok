"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { companySettingsUpsert } from "@/lib/pb/repository";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { canEditCompanySettings } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

const schema = z.object({
  foundingMonth: z.coerce.number().min(1).max(12),
  defaultPayDay: z.coerce.number().min(1).max(31),
  activeYear: z.coerce.number().min(2000).max(2100),
  accrualCurrentMonthPayNext: z.coerce.boolean(),
  salaryInclusionVarianceMode: z.enum(["BOTH", "OVER_ONLY", "UNDER_ONLY"]),
});

export type SettingsState = { 오류?: string; 성공?: boolean } | null;

export async function saveCompanySettingsAction(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "전사 설정을 수정할 권한이 없습니다." };

  const parsed = schema.safeParse({
    foundingMonth: formData.get("foundingMonth"),
    defaultPayDay: formData.get("defaultPayDay"),
    activeYear: formData.get("activeYear"),
    accrualCurrentMonthPayNext: formData.get("accrualCurrentMonthPayNext") === "on",
    salaryInclusionVarianceMode: formData.get("salaryInclusionVarianceMode"),
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
    return {
      오류: `${detail} · PocketBase sabok_company_settings 스키마(특히 salaryInclusionVarianceMode 필드)를 확인하세요.`,
    };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "CompanySettings",
    entityId: ctx.tenantId,
    payload: parsed.data,
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/salary-inclusion-report");
  return { 성공: true };
}
