"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import {
  normalizeAnnouncementBatchRange,
  parseAnnouncementMode,
  parseTenantClientEntityType,
} from "@/lib/domain/tenant-profile";
import {
  companySettingsCreateForTenant,
  tenantCreate,
  tenantDeleteCascade,
  tenantFindByCode,
  tenantGetById,
  tenantUpdateActive,
} from "@/lib/pb/repository";
import { isSingleTenantMode, singleTenantIdFromEnv } from "@/lib/single-tenant";

export type TenantActionState = { 오류?: string; 성공?: boolean; 경고?: string } | null;
export type TenantDeleteState = { 오류?: string; 성공?: boolean } | null;

const tenantCreateSchema = z.object({
  code: z.string().min(1, "업체 코드를 입력하세요."),
  name: z.string().min(1, "업체명을 입력하세요."),
  clientEntityType: z.preprocess(
    (v) => parseTenantClientEntityType(v),
    z.enum(["INDIVIDUAL", "CORPORATE"])
  ),
  operationMode: z.enum(["GENERAL", "SALARY_WELFARE", "INCENTIVE_WELFARE", "COMBINED"]),
  memo: z.string().optional(),
  approvalNumber: z.string().optional(),
  businessRegNo: z.string().optional(),
  headOfficeCapital: z.string().optional(),
  announcementMode: z.preprocess(
    (v) => parseAnnouncementMode(v),
    z.enum(["SINGLE", "BATCHED"]),
  ),
  announcementBatchFromMonth: z.string().optional(),
  announcementBatchToMonth: z.string().optional(),
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
    announcementMode: formData.get("announcementMode"),
    announcementBatchFromMonth: String(formData.get("announcementBatchFromMonth") ?? "").trim() || undefined,
    announcementBatchToMonth: String(formData.get("announcementBatchToMonth") ?? "").trim() || undefined,
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

  /** 묶음 모드 시작·끝 월 정규화 (단일월 모드면 저장은 하되 UI 에서 무시) */
  const batchRange = normalizeAnnouncementBatchRange(
    parsed.data.announcementBatchFromMonth ? Number(parsed.data.announcementBatchFromMonth) : null,
    parsed.data.announcementBatchToMonth ? Number(parsed.data.announcementBatchToMonth) : null,
  );

  const existing = await tenantFindByCode(parsed.data.code);
  if (existing) {
    return { 오류: "같은 코드의 업체가 이미 있습니다." };
  }

  let tenant;
  try {
    tenant = await tenantCreate({
      name: parsed.data.name,
      code: parsed.data.code,
      active: true,
      clientEntityType: parsed.data.clientEntityType,
      operationMode: parsed.data.operationMode,
      memo: parsed.data.memo ?? null,
      approvalNumber: parsed.data.approvalNumber?.trim() ? parsed.data.approvalNumber.trim() : null,
      businessRegNo: parsed.data.businessRegNo?.trim() ? parsed.data.businessRegNo.trim() : null,
      headOfficeCapital,
      announcementMode: parsed.data.announcementMode,
      announcementBatchFromMonth: batchRange.fromMonth,
      announcementBatchToMonth: batchRange.toMonth,
    });
  } catch (e) {
    console.error("[createTenantAction] tenantCreate", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      오류: `거래처 레코드 생성 실패. ${detail} · 코드 중복·PB 연결·sabok_tenants 필드(clientEntityType, operationMode 등)를 확인하세요.`,
    };
  }

  const auditPayload = {
    code: parsed.data.code,
    name: parsed.data.name,
    clientEntityType: parsed.data.clientEntityType,
    operationMode: parsed.data.operationMode,
    approvalNumber: parsed.data.approvalNumber?.trim() || null,
    businessRegNo: parsed.data.businessRegNo?.trim() || null,
    headOfficeCapital,
    announcementMode: parsed.data.announcementMode,
    announcementBatchFromMonth: batchRange.fromMonth,
    announcementBatchToMonth: batchRange.toMonth,
  };

  try {
    await companySettingsCreateForTenant(tenant.id);
  } catch (e) {
    console.error("[createTenantAction] companySettingsCreateForTenant", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    await writeAudit({
      userId: session.sub,
      tenantId: tenant.id,
      action: "CREATE_TENANT",
      entity: "Tenant",
      entityId: tenant.id,
      payload: { ...auditPayload, companySettingsCreateFailed: true, companySettingsError: detail },
    });
    revalidatePath("/dashboard/select-tenant");
    return {
      성공: true,
      경고: `거래처는 등록되었습니다. 다만 전사 기본 설정(sabok_company_settings) 생성에만 실패했습니다: ${detail} PocketBase에서 accrualCurrentMonthPayNext 등 스키마를 확인하세요. 해당 업체는 목록에 보이며, 설정이 없으면 앱 기본값으로 동작합니다.`,
    };
  }

  await writeAudit({
    userId: session.sub,
    tenantId: tenant.id,
    action: "CREATE_TENANT",
    entity: "Tenant",
    entityId: tenant.id,
    payload: auditPayload,
  });
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
