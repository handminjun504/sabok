"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import {
  companySettingsCreateForTenant,
  tenantCreate,
  tenantDeleteCascade,
  tenantFindByCode,
  tenantGetById,
  tenantUpdateActive,
} from "@/lib/pb/repository";
import { isSingleTenantMode, singleTenantIdFromEnv } from "@/lib/single-tenant";

export type TenantActionState = { 오류?: string; 성공?: boolean } | null;
export type TenantDeleteState = { 오류?: string; 성공?: boolean } | null;

const tenantCreateSchema = z.object({
  code: z.string().min(1, "업체 코드를 입력하세요."),
  name: z.string().min(1, "업체명을 입력하세요."),
  clientEntityType: z.enum(["INDIVIDUAL", "CORPORATE"]),
  operationMode: z.enum(["GENERAL", "SALARY_WELFARE", "INCENTIVE_WELFARE", "COMBINED"]),
  memo: z.string().optional(),
  approvalNumber: z.string().optional(),
  businessRegNo: z.string().optional(),
  headOfficeCapital: z.string().optional(),
});

/** 플랫폼 관리자 전용. 거래처(테넌트) 생성 — TenantCreateForm과 동일한 useActionState 패턴. */
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

  const memoRaw = String(formData.get("memo") ?? "").trim();
  const approvalRaw = String(formData.get("approvalNumber") ?? "").trim();
  const businessRegRaw = String(formData.get("businessRegNo") ?? "").trim();
  const capitalRaw = String(formData.get("headOfficeCapital") ?? "")
    .replace(/,/g, "")
    .trim();

  const parsed = tenantCreateSchema.safeParse({
    code: String(formData.get("code") ?? "").trim(),
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

  const existing = await tenantFindByCode(parsed.data.code);
  if (existing) {
    return { 오류: "같은 코드의 업체가 이미 있습니다." };
  }

  try {
    const tenant = await tenantCreate({
      name: parsed.data.name,
      code: parsed.data.code,
      active: true,
      clientEntityType: parsed.data.clientEntityType,
      operationMode: parsed.data.operationMode,
      memo: parsed.data.memo ?? null,
      approvalNumber: parsed.data.approvalNumber?.trim() ? parsed.data.approvalNumber.trim() : null,
      businessRegNo: parsed.data.businessRegNo?.trim() ? parsed.data.businessRegNo.trim() : null,
      headOfficeCapital,
    });
    await companySettingsCreateForTenant(tenant.id);
    await writeAudit({
      userId: session.sub,
      tenantId: tenant.id,
      action: "CREATE_TENANT",
      entity: "Tenant",
      entityId: tenant.id,
      payload: {
        code: parsed.data.code,
        name: parsed.data.name,
        clientEntityType: parsed.data.clientEntityType,
        operationMode: parsed.data.operationMode,
        approvalNumber: parsed.data.approvalNumber?.trim() || null,
        businessRegNo: parsed.data.businessRegNo?.trim() || null,
        headOfficeCapital,
      },
    });
  } catch (e) {
    console.error("[createTenantAction]", e);
    return {
      오류:
        "생성 실패. 코드 중복·PB 연결·sabok_tenants 필드(clientEntityType, operationMode, approvalNumber, businessRegNo, headOfficeCapital) 확인.",
    };
  }

  revalidatePath("/dashboard/select-tenant");
  return { 성공: true };
}

/** 플랫폼 관리자: 거래처 및 소속 데이터 전부 삭제. 확인란에 업체 코드와 동일하게 입력해야 함. */
export async function deleteTenantAction(
  _prev: TenantDeleteState,
  formData: FormData
): Promise<TenantDeleteState> {
  if (isSingleTenantMode()) {
    return { 오류: "단일 업체 모드에서는 거래처를 삭제할 수 없습니다." };
  }
  const session = await getSession();
  if (!session?.isPlatformAdmin) {
    return { 오류: "플랫폼 관리자만 거래처를 삭제할 수 있습니다." };
  }
  const tenantId = String(formData.get("tenantId") ?? "").trim();
  const confirmCode = String(formData.get("confirmCode") ?? "").trim();
  if (!tenantId) return { 오류: "업체가 지정되지 않았습니다." };
  const fixedId = singleTenantIdFromEnv();
  if (fixedId && tenantId === fixedId) {
    return { 오류: "환경 변수로 고정된 단일 업체는 삭제할 수 없습니다." };
  }
  const tenant = await tenantGetById(tenantId);
  if (!tenant) return { 오류: "거래처를 찾을 수 없습니다." };
  if (confirmCode !== tenant.code) {
    return { 오류: `삭제 확인: 업체 코드 "${tenant.code}"를 정확히 입력하세요.` };
  }
  try {
    await tenantDeleteCascade(tenantId);
  } catch (e) {
    console.error("[deleteTenantAction]", e);
    return { 오류: "삭제에 실패했습니다. PocketBase 로그·관계 제약을 확인하세요." };
  }
  await writeAudit({
    userId: session.sub,
    tenantId,
    action: "DELETE_TENANT",
    entity: "Tenant",
    entityId: tenantId,
    payload: { code: tenant.code, name: tenant.name },
  });
  revalidatePath("/dashboard/select-tenant");
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
  revalidatePath("/dashboard/select-tenant");
}
