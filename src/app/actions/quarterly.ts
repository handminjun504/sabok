"use server";

import { z } from "zod";
import {
  employeeFindFirst,
  monthlyNoteListByEmployeeYear,
  monthlyNoteUpsert,
  quarterlyEmployeeConfigDelete,
  quarterlyEmployeeConfigGetById,
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

export type QState = { 오류?: string; 경고?: string; 성공?: boolean } | null;

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

export async function deleteQuarterlyEmployeeConfigFormAction(formData: FormData): Promise<void> {
  await deleteQuarterlyEmployeeConfigAction(null, formData);
}

/**
 * “직원별 분기 항목” 한 줄 삭제.
 *  - 권한: canEditEmployees
 *  - 보안: 설정의 employeeId 가 현재 활성 테넌트에 속한 직원인지 다시 확인 (IDOR 방지)
 */
export async function deleteQuarterlyEmployeeConfigAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "권한이 없습니다." };

  const id = String(formData.get("configId") ?? "").trim();
  if (!id) return { 오류: "삭제할 항목 ID 가 없습니다." };

  const cfg = await quarterlyEmployeeConfigGetById(id);
  if (!cfg) return { 오류: "이미 삭제되었거나 찾을 수 없습니다." };

  /** 다른 업체의 분기 설정을 지우지 못하도록 employeeId → tenantId 검증 */
  const emp = await employeeFindFirst(cfg.employeeId, ctx.tenantId);
  if (!emp) return { 오류: "이 업체의 분기 설정이 아닙니다." };

  try {
    await quarterlyEmployeeConfigDelete(id);
  } catch (e) {
    console.error(e);
    return { 오류: "삭제에 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "DELETE",
    entity: "QuarterlyEmployeeConfig",
    entityId: `${emp.id}:${cfg.year}:${cfg.itemKey}`,
  });
  revalidateQuarterlyArtifacts();
  return { 성공: true };
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
  let 경고: string | undefined;
  try {
    await quarterlyEmployeeConfigUpsert({
      employeeId: emp.id,
      year: parsed.data.year,
      itemKey: parsed.data.itemKey,
      paymentMonths,
      amount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    /** repository 에서 “첫 달만 저장됨” 경고 throw — 저장 자체는 부분 성공이라 사용자에게 경고로 통지 */
    if (/첫 달|paymentMonths/.test(msg)) {
      경고 = msg;
    } else {
      console.error(e);
      return { 오류: "분기 지급 저장 실패." };
    }
  }
  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "QuarterlyEmployeeConfig",
    entityId: `${emp.id}:${parsed.data.year}:${parsed.data.itemKey}`,
    payload: { paymentMonths, partialOnly: 경고 != null },
  });
  revalidateQuarterlyArtifacts();
  return 경고 ? { 성공: true, 경고 } : { 성공: true };
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

  let 경고: string | undefined;
  for (const itemKey of items) {
    const r = rateMap.get(itemKey) ?? null;
    const amountN = computeQuarterlyAmountFromRates(emp, itemKey, r);
    if (amountN <= 0) continue;
    try {
      await quarterlyEmployeeConfigUpsert({
        employeeId: emp.id,
        year,
        itemKey,
        paymentMonths,
        amount: amountN,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/첫 달|paymentMonths/.test(msg)) {
        /** 같은 PB 환경에서 모든 항목이 동일하게 부분 저장됨 — 메시지 한 번만 보여줌 */
        경고 = msg;
      } else {
        console.error(e);
        return { 오류: `분기 일괄 적용 실패: ${msg}` };
      }
    }
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "BULK_APPLY",
    entity: "QuarterlyEmployeeConfig",
    entityId: emp.id,
    payload: { year, paymentMonths, partialOnly: 경고 != null },
  });
  revalidateQuarterlyArtifacts();
  return 경고 ? { 성공: true, 경고 } : { 성공: true };
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
