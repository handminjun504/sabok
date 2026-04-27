"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canEditCompanySettings } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";
import {
  baseAssetAnnualUpsert,
  bizResultAnnualUpsert,
  contribUsageAnnualUpsert,
  fundOperationAnnualUpsert,
  fundSourceAnnualUpsert,
  realEstateHoldingDelete,
  realEstateHoldingUpsert,
  tenantUpdateOperatingReportBasic,
} from "@/lib/pb/repository";
import { BIZ_ITEM_CODES } from "@/lib/domain/operating-report";
import { isIndustryCode } from "@/lib/domain/industry-categories";
import type { BizResultItem } from "@/types/models";

export type OperatingReportActionState = { 오류?: string; 성공?: boolean } | null;

function revalidateOperatingReport() {
  revalidatePath("/dashboard/operating-report");
}

function numOrNull(v: FormDataEntryValue | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? n : null;
}

function yearValue(formData: FormData): number | null {
  const y = Math.round(Number(formData.get("year")));
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return null;
  return y;
}

/** --- ①~⑪ 기본정보 --- */
const basicSchema = z.object({
  approvalNumber: z.string().nullable(),
  businessRegNo: z.string().nullable(),
  ceoName: z.string().nullable(),
  industry: z.string().nullable(),
  phone: z.string().nullable(),
  addressLine: z.string().nullable(),
  incorporationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  accountingYearStartMonth: z.number().int().min(1).max(12).nullable(),
  headOfficeCapital: z.number().int().min(0).nullable(),
});

function cleanText(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function saveOperatingReportTenantBasicAction(
  _: OperatingReportActionState,
  formData: FormData,
): Promise<OperatingReportActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "보고서 기본정보를 수정할 권한이 없습니다." };

  const industryRaw = cleanText(formData.get("industry"));
  const industry = industryRaw && isIndustryCode(industryRaw) ? industryRaw : null;
  const incorpRaw = cleanText(formData.get("incorporationDate"));
  const incorp = incorpRaw ? incorpRaw.slice(0, 10) : null;
  const parsed = basicSchema.safeParse({
    approvalNumber: cleanText(formData.get("approvalNumber")),
    businessRegNo: cleanText(formData.get("businessRegNo")),
    ceoName: cleanText(formData.get("ceoName")),
    industry,
    phone: cleanText(formData.get("phone")),
    addressLine: cleanText(formData.get("addressLine")),
    incorporationDate: incorp,
    accountingYearStartMonth: numOrNull(formData.get("accountingYearStartMonth")),
    headOfficeCapital: numOrNull(formData.get("headOfficeCapital")),
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  try {
    await tenantUpdateOperatingReportBasic(ctx.tenantId, parsed.data);
  } catch (e) {
    console.error("[saveOperatingReportTenantBasicAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { 오류: `저장 실패: ${msg}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "TenantOperatingReportBasic",
    entityId: ctx.tenantId,
    payload: parsed.data,
  });
  revalidateOperatingReport();
  return { 성공: true };
}

/** --- ⑫~⑳ 기본재산 변동 --- */
export async function saveBaseAssetAnnualAction(
  _: OperatingReportActionState,
  formData: FormData,
): Promise<OperatingReportActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "기본재산 변동을 수정할 권한이 없습니다." };

  const year = yearValue(formData);
  if (year == null) return { 오류: "연도가 유효하지 않습니다." };

  const payload = {
    tenantId: ctx.tenantId,
    year,
    prevYearEndTotal: numOrNull(formData.get("prevYearEndTotal")),
    employerContributionOverride: numOrNull(formData.get("employerContributionOverride")),
    investReturnAndCarryover: numOrNull(formData.get("investReturnAndCarryover")),
    nonEmployerContributionOverride: numOrNull(formData.get("nonEmployerContributionOverride")),
    mergerIn: numOrNull(formData.get("mergerIn")),
    splitOut: numOrNull(formData.get("splitOut")),
    currentYearEndTotalOverride: numOrNull(formData.get("currentYearEndTotalOverride")),
  };

  try {
    await baseAssetAnnualUpsert(payload);
  } catch (e) {
    console.error("[saveBaseAssetAnnualAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { 오류: `저장 실패: ${msg}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "BaseAssetAnnual",
    entityId: `${ctx.tenantId}:${year}`,
    payload,
  });
  revalidateOperatingReport();
  return { 성공: true };
}

/** --- ㉑~㉗ 기금 운용방법 --- */
export async function saveFundOperationAnnualAction(
  _: OperatingReportActionState,
  formData: FormData,
): Promise<OperatingReportActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "기금 운용을 수정할 권한이 없습니다." };

  const year = yearValue(formData);
  if (year == null) return { 오류: "연도가 유효하지 않습니다." };

  const payload = {
    tenantId: ctx.tenantId,
    year,
    deposit: numOrNull(formData.get("deposit")),
    trust: numOrNull(formData.get("trust")),
    security: numOrNull(formData.get("security")),
    ownStock: numOrNull(formData.get("ownStock")),
    reit: numOrNull(formData.get("reit")),
    etc: numOrNull(formData.get("etc")),
    loan: numOrNull(formData.get("loan")),
  };

  try {
    await fundOperationAnnualUpsert(payload);
  } catch (e) {
    console.error("[saveFundOperationAnnualAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { 오류: `저장 실패: ${msg}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "FundOperationAnnual",
    entityId: `${ctx.tenantId}:${year}`,
    payload,
  });
  revalidateOperatingReport();
  return { 성공: true };
}

/** --- ㉙~㉟ 기금사업 재원 --- */
export async function saveFundSourceAnnualAction(
  _: OperatingReportActionState,
  formData: FormData,
): Promise<OperatingReportActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "기금사업 재원을 수정할 권한이 없습니다." };

  const year = yearValue(formData);
  if (year == null) return { 오류: "연도가 유효하지 않습니다." };

  const contribRatio = numOrNull(formData.get("contribUsageRatio"));
  const prevRatio = numOrNull(formData.get("prevBaseAssetUsageRatio"));
  if (contribRatio != null && ![50, 80, 90].includes(contribRatio)) {
    return { 오류: "출연금 사용 비율은 50/80/90 중 하나여야 합니다." };
  }
  if (prevRatio != null && ![20, 25, 30].includes(prevRatio)) {
    return { 오류: "직전 기본재산 사용 비율은 20/25/30 중 하나여야 합니다." };
  }

  const payload = {
    tenantId: ctx.tenantId,
    year,
    operationIncome: numOrNull(formData.get("operationIncome")),
    contribUsageRatio: contribRatio,
    contribUsageAmount: numOrNull(formData.get("contribUsageAmount")),
    excessCapitalUsage: numOrNull(formData.get("excessCapitalUsage")),
    prevBaseAssetUsageRatio: prevRatio,
    prevBaseAssetUsageAmount: numOrNull(formData.get("prevBaseAssetUsageAmount")),
    jointFundSupport: numOrNull(formData.get("jointFundSupport")),
    carryover: numOrNull(formData.get("carryover")),
  };

  try {
    await fundSourceAnnualUpsert(payload);
  } catch (e) {
    console.error("[saveFundSourceAnnualAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { 오류: `저장 실패: ${msg}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "FundSourceAnnual",
    entityId: `${ctx.tenantId}:${year}`,
    payload,
  });
  revalidateOperatingReport();
  return { 성공: true };
}

/** --- 사용현황 매트릭스 --- */
export async function saveContribUsageAnnualAction(
  _: OperatingReportActionState,
  formData: FormData,
): Promise<OperatingReportActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "사용현황을 수정할 권한이 없습니다." };

  const year = yearValue(formData);
  if (year == null) return { 오류: "연도가 유효하지 않습니다." };

  const payload = {
    tenantId: ctx.tenantId,
    year,
    u80RecipientCount: numOrNull(formData.get("u80RecipientCount")),
    u80VendorWelfareAmount: numOrNull(formData.get("u80VendorWelfareAmount")),
    u90RecipientCount: numOrNull(formData.get("u90RecipientCount")),
    u90VendorWelfareAmount: numOrNull(formData.get("u90VendorWelfareAmount")),
    u20BaseAssetUsed: numOrNull(formData.get("u20BaseAssetUsed")),
    u20VendorWelfareAmount: numOrNull(formData.get("u20VendorWelfareAmount")),
    u20RecipientCount: numOrNull(formData.get("u20RecipientCount")),
    u25BaseAssetUsed: numOrNull(formData.get("u25BaseAssetUsed")),
    u25VendorWelfareAmount: numOrNull(formData.get("u25VendorWelfareAmount")),
    u25RecipientCount: numOrNull(formData.get("u25RecipientCount")),
    u30BaseAssetUsed: numOrNull(formData.get("u30BaseAssetUsed")),
    u30VendorWelfareAmount: numOrNull(formData.get("u30VendorWelfareAmount")),
    u30RecipientCount: numOrNull(formData.get("u30RecipientCount")),
  };

  try {
    await contribUsageAnnualUpsert(payload);
  } catch (e) {
    console.error("[saveContribUsageAnnualAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { 오류: `저장 실패: ${msg}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "ContribUsageAnnual",
    entityId: `${ctx.tenantId}:${year}`,
    payload,
  });
  revalidateOperatingReport();
  return { 성공: true };
}

/** --- 사업실적 --- */
export async function saveBizResultAnnualAction(
  _: OperatingReportActionState,
  formData: FormData,
): Promise<OperatingReportActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "사업실적을 수정할 권한이 없습니다." };

  const year = yearValue(formData);
  if (year == null) return { 오류: "연도가 유효하지 않습니다." };

  const bizItems: Record<string, BizResultItem> = {};
  for (const code of BIZ_ITEM_CODES) {
    const key = String(code);
    const item: BizResultItem = {
      purposeAmountOverride: numOrNull(formData.get(`biz_${key}_purposeAmountOverride`)),
      purposeCount: numOrNull(formData.get(`biz_${key}_purposeCount`)),
      loanAmount: numOrNull(formData.get(`biz_${key}_loanAmount`)),
      loanCount: numOrNull(formData.get(`biz_${key}_loanCount`)),
    };
    /** 모두 null 이면 키 자체를 생략 — 자동값만 쓰도록 */
    if (
      item.purposeAmountOverride == null &&
      item.purposeCount == null &&
      item.loanAmount == null &&
      item.loanCount == null
    ) {
      continue;
    }
    bizItems[key] = item;
  }

  const payload = {
    tenantId: ctx.tenantId,
    year,
    bizItems,
    operationCost: numOrNull(formData.get("operationCost")),
    optionalAmountOverride: numOrNull(formData.get("optionalAmountOverride")),
    optionalRecipientsOverride: numOrNull(formData.get("optionalRecipientsOverride")),
  };

  try {
    await bizResultAnnualUpsert(payload);
  } catch (e) {
    console.error("[saveBizResultAnnualAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { 오류: `저장 실패: ${msg}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "BizResultAnnual",
    entityId: `${ctx.tenantId}:${year}`,
    payload,
  });
  revalidateOperatingReport();
  return { 성공: true };
}

/** --- 부동산 행 저장 --- */
export async function saveRealEstateHoldingAction(
  _: OperatingReportActionState,
  formData: FormData,
): Promise<OperatingReportActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "부동산 정보를 수정할 권한이 없습니다." };

  const year = yearValue(formData);
  if (year == null) return { 오류: "연도가 유효하지 않습니다." };

  const idRaw = cleanText(formData.get("id"));
  const seq = numOrNull(formData.get("seq")) ?? 1;
  const payload = {
    id: idRaw,
    tenantId: ctx.tenantId,
    year,
    seq,
    name: cleanText(formData.get("name")),
    amount: numOrNull(formData.get("amount")),
    acquiredAt: cleanText(formData.get("acquiredAt"))?.slice(0, 10) ?? null,
  };

  try {
    await realEstateHoldingUpsert(payload);
  } catch (e) {
    console.error("[saveRealEstateHoldingAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { 오류: `저장 실패: ${msg}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: idRaw ? "UPDATE" : "CREATE",
    entity: "RealEstateHolding",
    entityId: idRaw ?? `${ctx.tenantId}:${year}:${seq}`,
    payload,
  });
  revalidateOperatingReport();
  return { 성공: true };
}

export async function deleteRealEstateHoldingAction(
  _: OperatingReportActionState,
  formData: FormData,
): Promise<OperatingReportActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "부동산 정보를 삭제할 권한이 없습니다." };

  const id = cleanText(formData.get("id"));
  if (!id) return { 오류: "삭제할 부동산 ID가 없습니다." };

  try {
    await realEstateHoldingDelete(id, ctx.tenantId);
  } catch (e) {
    console.error("[deleteRealEstateHoldingAction]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { 오류: `삭제 실패: ${msg}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "DELETE",
    entity: "RealEstateHolding",
    entityId: id,
  });
  revalidateOperatingReport();
  return { 성공: true };
}
