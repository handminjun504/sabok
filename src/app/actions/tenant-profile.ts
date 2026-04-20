"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { parseTenantClientEntityType } from "@/lib/domain/tenant-profile";
import { tenantUpdateProfile } from "@/lib/pb/repository";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

export type TenantProfileState = { 오류?: string; 성공?: boolean } | null;

const schema = z.object({
  name: z.string().min(1, "거래처명을 입력하세요."),
  clientEntityType: z.preprocess(
    (v) => parseTenantClientEntityType(v),
    z.enum(["INDIVIDUAL", "CORPORATE"])
  ),
  operationMode: z.enum(["GENERAL", "SALARY_WELFARE", "INCENTIVE_WELFARE", "COMBINED"]),
  memo: z.string().optional(),
  approvalNumber: z.string().optional(),
  businessRegNo: z.string().optional(),
  headOfficeCapital: z.string().optional(),
});

export async function updateTenantProfileAction(
  _: TenantProfileState,
  formData: FormData
): Promise<TenantProfileState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };

  const memoRaw = String(formData.get("memo") ?? "").trim();
  const approvalRaw = String(formData.get("approvalNumber") ?? "").trim();
  const businessRegRaw = String(formData.get("businessRegNo") ?? "").trim();
  const capitalRaw = String(formData.get("headOfficeCapital") ?? "")
    .replace(/,/g, "")
    .trim();

  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    clientEntityType: formData.get("clientEntityType"),
    operationMode: formData.get("operationMode"),
    memo: memoRaw.length > 0 ? memoRaw : undefined,
    approvalNumber: approvalRaw.length > 0 ? approvalRaw : undefined,
    businessRegNo: businessRegRaw.length > 0 ? businessRegRaw : undefined,
    headOfficeCapital: capitalRaw.length > 0 ? capitalRaw : undefined,
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  let headOfficeCapital: number | null = null;
  if (parsed.data.headOfficeCapital != null && parsed.data.headOfficeCapital !== "") {
    const n = Number(parsed.data.headOfficeCapital);
    if (!Number.isFinite(n) || n < 0) {
      return { 오류: "본사 자본금은 0 이상의 숫자로 입력하세요." };
    }
    headOfficeCapital = n;
  }

  try {
    await tenantUpdateProfile(ctx.tenantId, {
      name: parsed.data.name,
      memo: parsed.data.memo ?? null,
      clientEntityType: parsed.data.clientEntityType,
      operationMode: parsed.data.operationMode,
      approvalNumber: parsed.data.approvalNumber?.trim() ? parsed.data.approvalNumber.trim() : null,
      businessRegNo: parsed.data.businessRegNo?.trim() ? parsed.data.businessRegNo.trim() : null,
      headOfficeCapital,
    });
  } catch (e) {
    console.error("[updateTenantProfileAction]", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      오류: `${detail} · sabok_tenants 필드(approvalNumber, businessRegNo, headOfficeCapital 등)를 확인하세요.`,
    };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "Tenant",
    entityId: ctx.tenantId,
    payload: { name: parsed.data.name },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/select-tenant");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/employees");
  return { 성공: true };
}
