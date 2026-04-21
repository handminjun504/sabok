"use server";

import { z } from "zod";
import {
  employeeFindFirst,
  monthlyNoteListByEmployeeYear,
  monthlyNoteUpsert,
  monthlyPaymentStatusSet,
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

export type IncentiveAccrualCellResult = { ok: true } | { ok: false; 오류: string };

/**
 * 월별 발생 인센 그리드 — 한 직원·한 월 셀 한 칸만 자동 저장.
 *
 * - 권한: `canEditEmployees`.
 * - 보안: employeeId → tenantId 검증(IDOR 방지).
 * - amount === null/0/빈값 이면 그 달 노트의 incentiveAccrualAmount 만 비움. 다른 필드(인센→사복, 선택 복지, 메모)는 보존.
 * - month 는 1~12 만 허용.
 */
export async function setMonthlyIncentiveAccrualCellAction(
  employeeId: string,
  year: number,
  month: number,
  amount: number | null,
): Promise<IncentiveAccrualCellResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) {
    return { ok: false, 오류: "수정 권한이 없습니다." };
  }

  const yearN = Math.round(Number(year));
  if (!Number.isFinite(yearN) || yearN < 2000 || yearN > 2100) {
    return { ok: false, 오류: "연도가 올바르지 않습니다." };
  }
  const monthN = Math.round(Number(month));
  if (!Number.isFinite(monthN) || monthN < 1 || monthN > 12) {
    return { ok: false, 오류: "월(1~12)이 올바르지 않습니다." };
  }
  const empId = String(employeeId ?? "").trim();
  if (!empId) return { ok: false, 오류: "직원 ID 가 없습니다." };

  const emp = await employeeFindFirst(empId, ctx.tenantId);
  if (!emp) return { ok: false, 오류: "직원을 찾을 수 없습니다." };

  /** 0 또는 빈값(null) 이면 해당 셀 제거 의도로 본다. monthlyNoteUpsert 가 이미 다른 필드를 보존해서 안전. */
  const amtNorm =
    amount == null || !Number.isFinite(Number(amount)) || Number(amount) <= 0
      ? null
      : Math.round(Number(amount));

  /** 같은 월 노트가 이미 있으면 다른 필드를 그대로 보존하고 incentiveAccrualAmount 만 갱신 */
  const existingList = await monthlyNoteListByEmployeeYear(emp.id, yearN);
  const prev = existingList.find((n) => n.month === monthN);

  if (!prev && amtNorm == null) {
    /** 빈값을 빈 노트에 또 빈값으로 저장할 필요 없음 — no-op */
    return { ok: true };
  }

  try {
    await monthlyNoteUpsert({
      employeeId: emp.id,
      year: yearN,
      month: monthN,
      optionalWelfareText: prev?.optionalWelfareText ?? null,
      optionalExtraAmount: prev?.optionalExtraAmount ?? null,
      incentiveAccrualAmount: amtNorm,
      incentiveWelfarePaymentAmount: prev?.incentiveWelfarePaymentAmount ?? null,
    });
  } catch (e) {
    console.error(e);
    return { ok: false, 오류: "저장에 실패했습니다." };
  }

  revalidateScheduleArtifacts();
  return { ok: true };
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

export type PaidConfirmedToggleResult = { ok: true } | { ok: false; 오류: string };

/**
 * 월별 스케줄 — **테넌트·연·월 단위** ‘지급완료 확인’ 토글.
 *
 * 직원별이 아니라 한 달 전체에 대한 한 번의 체크. 단일 책임으로 다른 도메인 데이터(인센·노트·금액)는 건드리지 않는다.
 *
 * - 권한: `canEditEmployees` (스케줄 데이터 갱신 동일 권한).
 * - month 는 1~12 범위만 허용. 그 밖이면 오류 반환.
 */
export async function setMonthPaidConfirmedAction(
  year: number,
  month: number,
  paidConfirmed: boolean,
): Promise<PaidConfirmedToggleResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) {
    return { ok: false, 오류: "스케줄을 수정할 권한이 없습니다." };
  }

  const yearN = Math.round(Number(year));
  if (!Number.isFinite(yearN) || yearN < 2000 || yearN > 2100) {
    return { ok: false, 오류: "연도가 올바르지 않습니다." };
  }
  const monthN = Math.round(Number(month));
  if (!Number.isFinite(monthN) || monthN < 1 || monthN > 12) {
    return { ok: false, 오류: "월(1~12)이 올바르지 않습니다." };
  }

  try {
    await monthlyPaymentStatusSet({
      tenantId: ctx.tenantId,
      year: yearN,
      month: monthN,
      paidConfirmed: Boolean(paidConfirmed),
    });
  } catch (e) {
    console.error(e);
    return { ok: false, 오류: "지급완료 상태 저장에 실패했습니다." };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: paidConfirmed ? "MARK_MONTH_PAID" : "UNMARK_MONTH_PAID",
    entity: "MonthlyPaymentStatus",
    entityId: `${ctx.tenantId}:${yearN}:${monthN}`,
  });
  revalidateScheduleArtifacts();
  return { ok: true };
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
