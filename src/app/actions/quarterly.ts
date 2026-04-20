"use server";

import { z } from "zod";
import {
  employeeFindFirst,
  monthlyNoteListByEmployeeYear,
  monthlyNoteUpsert,
  quarterlyEmployeeConfigUpsert,
  quarterlyRateList,
  quarterlyRateUpsert,
} from "@/lib/pb/repository";
import { canEditEmployees, canEditLevelRules } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { QUARTERLY_ITEM, type QuarterlyItemKey } from "@/lib/business-rules";
import { normalizeQuarterlyPaymentMonths, validateQuarterlyPaymentMonths } from "@/lib/domain/schedule";
import { resolveActionTenant } from "@/lib/tenant-context";
import { toNum0, toNumOrNull } from "@/lib/util/number";
import { revalidateQuarterlyArtifacts, revalidateScheduleArtifacts } from "@/lib/util/revalidate";

export type QState = { 오류?: string; 성공?: boolean } | null;

export async function saveQuarterlyRatesFormAction(formData: FormData): Promise<void> {
  await saveQuarterlyRatesAction(null, formData);
}

export async function saveQuarterlyEmployeeConfigFormAction(formData: FormData): Promise<void> {
  await saveQuarterlyEmployeeConfigAction(null, formData);
}

export async function applyQuarterlyTemplateFormAction(formData: FormData): Promise<void> {
  await applyQuarterlyTemplateAction(null, formData);
}

export async function saveMonthlyNoteFormAction(formData: FormData): Promise<void> {
  await saveMonthlyNoteAction(null, formData);
}

export async function saveMonthlyIncentiveAccrualYearFormAction(formData: FormData): Promise<void> {
  await saveMonthlyIncentiveAccrualYearAction(null, formData);
}

function parseOptionalWonField(raw: string): number | null {
  const n = toNumOrNull(raw);
  return n == null ? null : Math.round(n);
}

export async function saveMonthlyIncentiveAccrualYearAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "권한이 없습니다." };

  const employeeId = String(formData.get("employeeId") ?? "");
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  if (!employeeId || !Number.isFinite(year)) {
    return { 오류: "입력 오류" };
  }

  const emp = await employeeFindFirst(employeeId, ctx.tenantId);
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  const existingList = await monthlyNoteListByEmployeeYear(emp.id, year);
  const byMonth = new Map(existingList.map((n) => [n.month, n]));

  try {
    for (let month = 1; month <= 12; month++) {
      const raw = String(formData.get(`incentiveAccrual_${month}`) ?? "");
      const incentiveAccrualAmount = parseOptionalWonField(raw);
      const prev = byMonth.get(month);
      const optionalWelfareText = prev?.optionalWelfareText ?? null;
      const optionalExtraAmount = prev?.optionalExtraAmount ?? null;
      const incentiveWelfarePaymentAmount = prev?.incentiveWelfarePaymentAmount ?? null;

      if (!prev && incentiveAccrualAmount == null) {
        continue;
      }

      await monthlyNoteUpsert({
        employeeId: emp.id,
        year,
        month,
        optionalWelfareText,
        optionalExtraAmount,
        incentiveWelfarePaymentAmount,
        incentiveAccrualAmount,
      });
    }
  } catch (e) {
    console.error(e);
    return { 오류: "저장 실패" };
  }

  revalidateScheduleArtifacts();
  return { 성공: true };
}

export async function saveQuarterlyRatesAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  if (!Number.isFinite(year)) return { 오류: "연도 오류" };

  const items = Object.values(QUARTERLY_ITEM) as QuarterlyItemKey[];
  try {
    for (const itemKey of items) {
      await quarterlyRateUpsert({
        tenantId: ctx.tenantId,
        year,
        itemKey,
        amountPerInfant: toNumOrNull(formData.get(`${itemKey}_infant`)),
        amountPerPreschool: toNumOrNull(formData.get(`${itemKey}_pre`)),
        amountPerTeen: toNumOrNull(formData.get(`${itemKey}_teen`)),
        amountPerParent: toNumOrNull(formData.get(`${itemKey}_par`)),
        amountPerInLaw: toNumOrNull(formData.get(`${itemKey}_inlaw`)),
        flatAmount: toNumOrNull(formData.get(`${itemKey}_flat`)),
        percentInsurance: toNumOrNull(formData.get(`${itemKey}_pins`)),
        percentLoanInterest: toNumOrNull(formData.get(`${itemKey}_ploan`)),
      });
    }
  } catch (e) {
    console.error(e);
    return { 오류: "요율 저장 실패" };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "QuarterlyRate",
    entityId: String(year),
  });
  revalidateQuarterlyArtifacts();
  return { 성공: true };
}

const cfgSchema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number(),
  itemKey: z.string().min(1),
  amount: z.string(),
});

function paymentMonthsFromForm(formData: FormData): number[] {
  return normalizeQuarterlyPaymentMonths(
    formData.getAll("payMonth").map((v) => parseInt(String(v), 10))
  );
}

export async function saveQuarterlyEmployeeConfigAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "권한이 없습니다." };

  const parsed = cfgSchema.safeParse({
    employeeId: formData.get("employeeId"),
    year: formData.get("year"),
    itemKey: formData.get("itemKey"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { 오류: "입력값을 확인하세요." };

  const paymentMonths = paymentMonthsFromForm(formData);
  const v = validateQuarterlyPaymentMonths(paymentMonths);
  if (!v.ok) return { 오류: v.message ?? "지급 월 오류" };

  const emp = await employeeFindFirst(parsed.data.employeeId, ctx.tenantId);
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  const amount = toNum0(parsed.data.amount);
  await quarterlyEmployeeConfigUpsert({
    employeeId: emp.id,
    year: parsed.data.year,
    itemKey: parsed.data.itemKey,
    paymentMonths,
    amount,
  });
  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "QuarterlyEmployeeConfig",
    entityId: `${emp.id}:${parsed.data.year}:${parsed.data.itemKey}`,
  });
  revalidateQuarterlyArtifacts();
  return { 성공: true };
}

export async function applyQuarterlyTemplateAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const employeeId = String(formData.get("employeeId") ?? "");
  const paymentMonths = paymentMonthsFromForm(formData);
  const mv = validateQuarterlyPaymentMonths(paymentMonths);
  if (!mv.ok) return { 오류: mv.message ?? "지급 월 오류" };
  if (!Number.isFinite(year) || !employeeId) return { 오류: "연도·직원을 확인하세요." };

  const emp = await employeeFindFirst(employeeId, ctx.tenantId);
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  const rates = await quarterlyRateList(ctx.tenantId, year);
  const rateMap = new Map(rates.map((r) => [r.itemKey, r]));

  const { computeQuarterlyAmountFromRates } = await import("@/lib/domain/schedule");
  const items = Object.values(QUARTERLY_ITEM) as QuarterlyItemKey[];

  for (const itemKey of items) {
    const r = rateMap.get(itemKey) ?? null;
    const amountN = computeQuarterlyAmountFromRates(emp, itemKey, r);
    if (amountN <= 0) continue;
    await quarterlyEmployeeConfigUpsert({
      employeeId: emp.id,
      year,
      itemKey,
      paymentMonths,
      amount: amountN,
    });
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "BULK_APPLY",
    entity: "QuarterlyEmployeeConfig",
    entityId: emp.id,
    payload: { year, paymentMonths },
  });
  revalidateQuarterlyArtifacts();
  return { 성공: true };
}

export async function saveMonthlyNoteAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "권한이 없습니다." };

  const employeeId = String(formData.get("employeeId") ?? "");
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const month = parseInt(String(formData.get("month") ?? ""), 10);
  const optionalWelfareText = String(formData.get("optionalWelfareText") ?? "") || null;
  const optionalExtraAmount = toNumOrNull(formData.get("optionalExtraAmount"));
  const incentiveAccrualAmount = toNumOrNull(formData.get("incentiveAccrualAmount"));
  const incentiveWelfarePaymentAmount = toNumOrNull(formData.get("incentiveWelfarePaymentAmount"));

  if (!employeeId || !Number.isFinite(year) || month < 1 || month > 12) {
    return { 오류: "입력 오류" };
  }

  const emp = await employeeFindFirst(employeeId, ctx.tenantId);
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  await monthlyNoteUpsert({
    employeeId: emp.id,
    year,
    month,
    optionalWelfareText,
    optionalExtraAmount,
    incentiveAccrualAmount,
    incentiveWelfarePaymentAmount,
  });
  revalidateScheduleArtifacts();
  return { 성공: true };
}
