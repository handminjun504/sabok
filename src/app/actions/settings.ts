"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companySettingsUpsert } from "@/lib/pb/repository";
import { canEditCompanySettings } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

const schema = z.object({
  foundingMonth: z.coerce.number().min(1).max(12),
  defaultPayDay: z.coerce.number().min(1).max(31),
  activeYear: z.coerce.number().min(2000).max(2100),
  accrualCurrentMonthPayNext: z.coerce.boolean(),
});

export type SettingsState = { 오류?: string; 성공?: boolean } | null;

export async function saveCompanySettingsFormAction(formData: FormData): Promise<void> {
  await saveCompanySettingsAction(null, formData);
}

export async function saveCompanySettingsAction(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "전사 설정을 수정할 권한이 없습니다." };

  const parsed = schema.safeParse({
    foundingMonth: formData.get("foundingMonth"),
    defaultPayDay: formData.get("defaultPayDay"),
    activeYear: formData.get("activeYear"),
    accrualCurrentMonthPayNext: formData.get("accrualCurrentMonthPayNext") === "on",
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  await companySettingsUpsert(ctx.tenantId, parsed.data);
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
  return { 성공: true };
}
