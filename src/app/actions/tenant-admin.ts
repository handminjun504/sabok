"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import {
  companySettingsCreateForTenant,
  tenantCreate,
  tenantFindByCode,
  tenantUpdateActive,
} from "@/lib/pb/repository";
import { isSingleTenantMode } from "@/lib/single-tenant";

export type TenantActionState = { 오류?: string; 성공?: boolean } | null;

const tenantCreateSchema = z.object({
  code: z.string().min(1, "업체 코드를 입력하세요."),
  name: z.string().min(1, "업체명을 입력하세요."),
});

/** 플랫폼 관리자 전용. 고객사(테넌트) 생성 — 거래처 등록 폼과 동일한 useActionState 패턴. */
export async function createTenantAction(
  _: TenantActionState,
  formData: FormData
): Promise<TenantActionState> {
  if (isSingleTenantMode()) {
    return { 오류: "단일 업체 모드에서는 고객사를 추가할 수 없습니다." };
  }
  const session = await getSession();
  if (!session?.isPlatformAdmin) {
    return { 오류: "플랫폼 관리자만 고객사(위탁 업체)를 등록할 수 있습니다." };
  }

  const parsed = tenantCreateSchema.safeParse({
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const existing = await tenantFindByCode(parsed.data.code);
  if (existing) {
    return { 오류: "같은 코드의 업체가 이미 있습니다." };
  }

  try {
    const tenant = await tenantCreate({ name: parsed.data.name, code: parsed.data.code, active: true });
    await companySettingsCreateForTenant(tenant.id);
    await writeAudit({
      userId: session.sub,
      tenantId: tenant.id,
      action: "CREATE_TENANT",
      entity: "Tenant",
      entityId: tenant.id,
      payload: { code: parsed.data.code, name: parsed.data.name },
    });
  } catch (e) {
    console.error("[createTenantAction]", e);
    return { 오류: "업체를 생성하지 못했습니다. 코드 중복·PB 연결을 확인하세요." };
  }

  revalidatePath("/dashboard/tenants");
  revalidatePath("/dashboard/select-tenant");
  revalidatePath("/dashboard/vendors/onboard");
  return { 성공: true };
}

export async function setTenantActiveFormAction(formData: FormData): Promise<void> {
  if (isSingleTenantMode()) return;
  const session = await getSession();
  if (!session?.isPlatformAdmin) return;

  const tenantId = String(formData.get("tenantId") ?? "");
  const active = formData.get("active") === "true";
  try {
    await tenantUpdateActive(tenantId, active);
  } catch {
    return;
  }
  await writeAudit({
    userId: session.sub,
    tenantId,
    action: active ? "TENANT_ACTIVATE" : "TENANT_DEACTIVATE",
    entity: "Tenant",
    entityId: tenantId,
  });
  revalidatePath("/dashboard/tenants");
}
