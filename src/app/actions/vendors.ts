"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { VendorBusinessType } from "@/lib/domain/vendor-reserve";
import {
  vendorAppendContribution,
  vendorCreate,
  vendorFindByTenantCode,
  vendorFindFirst,
  vendorUpdate,
} from "@/lib/pb/repository";
import { canEditCompanySettings } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

export type VendorActionState = { 오류?: string; 성공?: boolean } | null;

const createSchema = z.object({
  code: z.string().min(1, "거래처 코드 필수"),
  name: z.string().min(1, "거래처명 필수"),
  businessType: z.enum(["INDIVIDUAL", "CORPORATE"]),
  workplaceCapital: z.coerce.number().min(0),
  memo: z.string().optional(),
});

function validateCorporateCapital(bt: VendorBusinessType, k: number): string | null {
  if (bt === "CORPORATE" && k <= 0) {
    return "법인사업자는 사업장 자본금(원)을 0보다 크게 입력해야 합니다.";
  }
  return null;
}

export async function createVendorFormAction(formData: FormData): Promise<void> {
  await createVendorAction(null, formData);
}

export async function createVendorAction(_: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "거래처를 등록할 권한이 없습니다." };

  const parsed = createSchema.safeParse({
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    businessType: formData.get("businessType"),
    workplaceCapital: formData.get("workplaceCapital"),
    memo: formData.get("memo"),
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const bt = parsed.data.businessType as VendorBusinessType;
  const capErr = validateCorporateCapital(bt, parsed.data.workplaceCapital);
  if (capErr) return { 오류: capErr };

  const existing = await vendorFindByTenantCode(ctx.tenantId, parsed.data.code);
  if (existing) return { 오류: "같은 코드의 거래처가 이미 있습니다." };

  try {
    const v = await vendorCreate({
      tenantId: ctx.tenantId,
      code: parsed.data.code,
      name: parsed.data.name,
      businessType: bt,
      workplaceCapital: bt === "INDIVIDUAL" ? 0 : parsed.data.workplaceCapital,
      memo: parsed.data.memo ? String(parsed.data.memo) : null,
    });
    await writeAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      action: "CREATE_VENDOR",
      entity: "Vendor",
      entityId: v.id,
      payload: { code: v.code },
    });
  } catch (e) {
    console.error(e);
    return { 오류: "저장에 실패했습니다." };
  }

  revalidatePath("/dashboard/vendors");
  return { 성공: true };
}

const updateSchema = z.object({
  vendorId: z.string().min(1),
  name: z.string().min(1),
  businessType: z.enum(["INDIVIDUAL", "CORPORATE"]),
  workplaceCapital: z.coerce.number().min(0),
  memo: z.string().optional(),
});

export async function updateVendorFormAction(formData: FormData): Promise<void> {
  await updateVendorAction(null, formData);
}

export async function updateVendorAction(_: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "수정 권한이 없습니다." };

  const parsed = updateSchema.safeParse({
    vendorId: formData.get("vendorId"),
    name: String(formData.get("name") ?? "").trim(),
    businessType: formData.get("businessType"),
    workplaceCapital: formData.get("workplaceCapital"),
    memo: formData.get("memo"),
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const active = formData.get("active") === "on";
  const bt = parsed.data.businessType as VendorBusinessType;
  const k = bt === "INDIVIDUAL" ? 0 : parsed.data.workplaceCapital;
  const capErr = validateCorporateCapital(bt, k);
  if (capErr) return { 오류: capErr };

  const v = await vendorFindFirst(parsed.data.vendorId, ctx.tenantId);
  if (!v) return { 오류: "거래처를 찾을 수 없습니다." };

  try {
    await vendorUpdate(parsed.data.vendorId, {
      name: parsed.data.name,
      businessType: bt,
      workplaceCapital: k,
      active,
      memo: parsed.data.memo === undefined ? v.memo : String(parsed.data.memo || "") || null,
    });
    await writeAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      action: "UPDATE_VENDOR",
      entity: "Vendor",
      entityId: v.id,
    });
  } catch (e) {
    console.error(e);
    return { 오류: "수정에 실패했습니다." };
  }

  revalidatePath("/dashboard/vendors");
  revalidatePath(`/dashboard/vendors/${parsed.data.vendorId}`);
  return { 성공: true };
}

const contribSchema = z.object({
  vendorId: z.string().min(1),
  amount: z.coerce.number().positive("출연금은 0보다 커야 합니다."),
  note: z.string().optional(),
  occurredAt: z.string().optional(),
});

export async function recordVendorContributionFormAction(formData: FormData): Promise<void> {
  await recordVendorContributionAction(null, formData);
}

export async function recordVendorContributionAction(
  _: VendorActionState,
  formData: FormData
): Promise<VendorActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "출연금 등록 권한이 없습니다." };

  const parsed = contribSchema.safeParse({
    vendorId: formData.get("vendorId"),
    amount: formData.get("amount"),
    note: formData.get("note"),
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const v = await vendorFindFirst(parsed.data.vendorId, ctx.tenantId);
  if (!v) return { 오류: "거래처를 찾을 수 없습니다." };
  if (!v.active) return { 오류: "비활성 거래처에는 출연금을 등록할 수 없습니다." };

  const verr = validateCorporateCapital(v.businessType, v.workplaceCapital);
  if (verr) return { 오류: `거래처 설정 오류: ${verr}` };

  try {
    await vendorAppendContribution({
      tenantId: ctx.tenantId,
      vendorId: parsed.data.vendorId,
      contributionAmount: parsed.data.amount,
      note: parsed.data.note ? String(parsed.data.note) : null,
      occurredAt: parsed.data.occurredAt ? String(parsed.data.occurredAt) : null,
    });
    await writeAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      action: "VENDOR_CONTRIBUTION",
      entity: "VendorContribution",
      entityId: parsed.data.vendorId,
      payload: { amount: parsed.data.amount },
    });
  } catch (e) {
    console.error(e);
    return { 오류: "출연금 반영에 실패했습니다." };
  }

  revalidatePath("/dashboard/vendors");
  revalidatePath("/dashboard/vendor-contributions");
  revalidatePath(`/dashboard/vendors/${parsed.data.vendorId}`);
  return { 성공: true };
}
