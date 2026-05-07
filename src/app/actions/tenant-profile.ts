"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import {
  normalizeAnnouncementBatchRange,
  parseAnnouncementMode,
  parseTenantClientEntityType,
} from "@/lib/domain/tenant-profile";
import { isIndustryCode } from "@/lib/domain/industry-categories";
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
  accumulatedReserveTotalWon: z.string().optional(),
  announcementMode: z.preprocess(
    (v) => parseAnnouncementMode(v),
    z.enum(["SINGLE", "BATCHED"]),
  ),
  announcementBatchFromMonth: z.string().optional(),
  announcementBatchToMonth: z.string().optional(),
  /** 운영상황 보고 기본정보 ③~⑧ — 거래처 정보에서 직접 편집 가능 */
  ceoName: z.string().optional(),
  industry: z.string().optional(),
  phone: z.string().optional(),
  addressLine: z.string().optional(),
  incorporationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "설립등기일은 YYYY-MM-DD 형식이어야 합니다.")
    .optional(),
  accountingYearStartMonth: z.string().optional(),
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
  const reserveRaw = String(formData.get("accumulatedReserveTotalWon") ?? "")
    .replace(/,/g, "")
    .trim();
  const ceoRaw = String(formData.get("ceoName") ?? "").trim();
  const industryRaw = String(formData.get("industry") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const addressRaw = String(formData.get("addressLine") ?? "").trim();
  const incorpRaw = String(formData.get("incorporationDate") ?? "").trim().slice(0, 10);
  const startMonthRaw = String(formData.get("accountingYearStartMonth") ?? "").trim();

  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    clientEntityType: formData.get("clientEntityType"),
    operationMode: formData.get("operationMode"),
    memo: memoRaw.length > 0 ? memoRaw : undefined,
    approvalNumber: approvalRaw.length > 0 ? approvalRaw : undefined,
    businessRegNo: businessRegRaw.length > 0 ? businessRegRaw : undefined,
    headOfficeCapital: capitalRaw.length > 0 ? capitalRaw : undefined,
    accumulatedReserveTotalWon: reserveRaw.length > 0 ? reserveRaw : undefined,
    announcementMode: formData.get("announcementMode"),
    announcementBatchFromMonth: String(formData.get("announcementBatchFromMonth") ?? "").trim() || undefined,
    announcementBatchToMonth: String(formData.get("announcementBatchToMonth") ?? "").trim() || undefined,
    ceoName: ceoRaw.length > 0 ? ceoRaw : undefined,
    industry: industryRaw.length > 0 ? industryRaw : undefined,
    phone: phoneRaw.length > 0 ? phoneRaw : undefined,
    addressLine: addressRaw.length > 0 ? addressRaw : undefined,
    incorporationDate: incorpRaw.length > 0 ? incorpRaw : undefined,
    accountingYearStartMonth: startMonthRaw.length > 0 ? startMonthRaw : undefined,
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

  let accumulatedReserveTotalWon: number | null = null;
  if (
    parsed.data.accumulatedReserveTotalWon != null &&
    parsed.data.accumulatedReserveTotalWon !== ""
  ) {
    const n = Number(parsed.data.accumulatedReserveTotalWon);
    if (!Number.isFinite(n) || n < 0) {
      return { 오류: "누적 추가 적립금은 0 이상의 숫자로 입력하세요." };
    }
    accumulatedReserveTotalWon = Math.round(n);
  }

  const industryCode = parsed.data.industry && isIndustryCode(parsed.data.industry) ? parsed.data.industry : null;
  let startMonth: number | null = null;
  if (parsed.data.accountingYearStartMonth) {
    const n = Math.round(Number(parsed.data.accountingYearStartMonth));
    if (!Number.isFinite(n) || n < 1 || n > 12) {
      return { 오류: "회계연도 시작 월은 1~12 사이여야 합니다." };
    }
    startMonth = n;
  }

  const batchRange = normalizeAnnouncementBatchRange(
    parsed.data.announcementBatchFromMonth ? Number(parsed.data.announcementBatchFromMonth) : null,
    parsed.data.announcementBatchToMonth ? Number(parsed.data.announcementBatchToMonth) : null,
  );

  try {
    await tenantUpdateProfile(ctx.tenantId, {
      name: parsed.data.name,
      memo: parsed.data.memo ?? null,
      clientEntityType: parsed.data.clientEntityType,
      operationMode: parsed.data.operationMode,
      approvalNumber: parsed.data.approvalNumber?.trim() ? parsed.data.approvalNumber.trim() : null,
      businessRegNo: parsed.data.businessRegNo?.trim() ? parsed.data.businessRegNo.trim() : null,
      headOfficeCapital,
      accumulatedReserveTotalWon,
      announcementMode: parsed.data.announcementMode,
      announcementBatchFromMonth: batchRange.fromMonth,
      announcementBatchToMonth: batchRange.toMonth,
      ceoName: parsed.data.ceoName?.trim() || null,
      industry: industryCode,
      phone: parsed.data.phone?.trim() || null,
      addressLine: parsed.data.addressLine?.trim() || null,
      incorporationDate: parsed.data.incorporationDate ?? null,
      accountingYearStartMonth: startMonth,
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
