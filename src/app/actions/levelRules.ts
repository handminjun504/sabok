"use server";

import { revalidatePath } from "next/cache";
import {
  allPaymentEventKeysForYear,
  splitAnnualTargetToNiceAmounts,
} from "@/lib/domain/payment-events";
import {
  companySettingsByTenant,
  employeeFindFirst,
  level5OverrideDelete,
  level5OverrideUpsert,
  levelPaymentRuleDeleteByTenantYearEventKey,
  level5OverrideDeleteByTenantYearEventKey,
  levelPaymentRuleUpsert,
  levelTargetUpsert,
  paymentEventDefAppend,
  paymentEventDefRemove,
} from "@/lib/pb/repository";
import { canEditLevelRules } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

export type LevelRulesState = { 오류?: string; 성공?: boolean } | null;

export async function saveLevelRulesFormAction(formData: FormData): Promise<void> {
  await saveLevelRulesAction(null, formData);
}

export async function saveLevelTargetFormAction(formData: FormData): Promise<void> {
  await saveLevelTargetAction(null, formData);
}

export async function saveLevelRulesAction(
  _: LevelRulesState,
  formData: FormData
): Promise<LevelRulesState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "레벨 규칙을 수정할 권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  if (!Number.isFinite(year)) return { 오류: "연도가 올바르지 않습니다." };

  const settings = await companySettingsByTenant(ctx.tenantId);
  const eventKeys = allPaymentEventKeysForYear(settings, year);
  try {
    for (let level = 1; level <= 5; level++) {
      for (const eventKey of eventKeys) {
        const raw = formData.get(`amt_${level}_${eventKey}`);
        const s = raw == null || raw === "" ? "0" : String(raw).replace(/,/g, "");
        const amount = Number(s) || 0;
        await levelPaymentRuleUpsert({
          tenantId: ctx.tenantId,
          year,
          level,
          eventKey,
          amount,
        });
      }
    }
  } catch (e) {
    console.error(e);
    return { 오류: "저장에 실패했습니다." };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "LevelPaymentRule",
    entityId: String(year),
    payload: { year },
  });
  revalidatePath("/dashboard/levels");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/salary-inclusion-report");
  return { 성공: true };
}

export async function saveLevelTargetAction(
  _: LevelRulesState,
  formData: FormData
): Promise<LevelRulesState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  if (!Number.isFinite(year)) return { 오류: "연도가 올바르지 않습니다." };

  const settings = await companySettingsByTenant(ctx.tenantId);
  const eventKeys = allPaymentEventKeysForYear(settings, year);

  try {
    for (let level = 1; level <= 5; level++) {
      const raw = formData.get(`target_${level}`);
      const s = raw == null || raw === "" ? "0" : String(raw).replace(/,/g, "");
      const targetAmount = Number(s) || 0;
      await levelTargetUpsert({ tenantId: ctx.tenantId, year, level, targetAmount });
      const amounts = splitAnnualTargetToNiceAmounts(targetAmount, eventKeys.length);
      for (let i = 0; i < eventKeys.length; i++) {
        await levelPaymentRuleUpsert({
          tenantId: ctx.tenantId,
          year,
          level,
          eventKey: eventKeys[i]!,
          amount: amounts[i] ?? 0,
        });
      }
    }
  } catch (e) {
    console.error(e);
    return { 오류: "목표액 저장 실패" };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "LevelTarget",
    entityId: String(year),
    payload: { distributedToRules: true, eventCount: eventKeys.length },
  });
  revalidatePath("/dashboard/levels");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/salary-inclusion-report");
  return { 성공: true };
}

export async function addCustomPaymentEventFormAction(formData: FormData): Promise<void> {
  await addCustomPaymentEventAction(null, formData);
}

export async function addCustomPaymentEventAction(
  _: LevelRulesState,
  formData: FormData
): Promise<LevelRulesState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const label = String(formData.get("label") ?? "").trim();
  const accrualMonth = parseInt(String(formData.get("accrualMonth") ?? ""), 10);
  if (!Number.isFinite(year)) return { 오류: "연도가 올바르지 않습니다." };
  if (!label) return { 오류: "항목명을 입력하세요." };
  if (!Number.isFinite(accrualMonth) || accrualMonth < 1 || accrualMonth > 12) {
    return { 오류: "귀속 월은 1~12여야 합니다." };
  }

  try {
    await paymentEventDefAppend(ctx.tenantId, year, { label, accrualMonth });
  } catch (e) {
    console.error(e);
    return { 오류: "항목 추가에 실패했습니다. 전사 설정이 있는지 확인하세요." };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "CREATE",
    entity: "PaymentEventDef",
    entityId: String(year),
    payload: { label, accrualMonth },
  });
  revalidatePath("/dashboard/levels");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/salary-inclusion-report");
  return { 성공: true };
}

export async function deleteCustomPaymentEventFormAction(formData: FormData): Promise<void> {
  await deleteCustomPaymentEventAction(null, formData);
}

export async function deleteCustomPaymentEventAction(
  _: LevelRulesState,
  formData: FormData
): Promise<LevelRulesState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const eventKey = String(formData.get("eventKey") ?? "").trim();
  if (!Number.isFinite(year) || !eventKey) return { 오류: "입력이 부족합니다." };
  if (!eventKey.startsWith("EXT_")) return { 오류: "삭제할 수 없는 행사 키입니다." };

  try {
    await paymentEventDefRemove(ctx.tenantId, year, eventKey);
    await levelPaymentRuleDeleteByTenantYearEventKey(ctx.tenantId, year, eventKey);
    await level5OverrideDeleteByTenantYearEventKey(ctx.tenantId, year, eventKey);
  } catch (e) {
    console.error(e);
    return { 오류: "항목 삭제에 실패했습니다." };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "DELETE",
    entity: "PaymentEventDef",
    entityId: `${year}:${eventKey}`,
  });
  revalidatePath("/dashboard/levels");
  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/salary-inclusion-report");
  return { 성공: true };
}

export async function saveLevel5OverrideAction(
  _: LevelRulesState,
  formData: FormData
): Promise<LevelRulesState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const employeeId = String(formData.get("employeeId") ?? "");
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const eventKey = String(formData.get("eventKey") ?? "");
  const rawAmt = formData.get("amount");
  if (!employeeId || !Number.isFinite(year) || !eventKey) return { 오류: "입력이 부족합니다." };

  const emp = await employeeFindFirst(employeeId, ctx.tenantId);
  if (!emp || emp.level !== 5) return { 오류: "레벨 5 직원만 오버라이드할 수 있습니다." };

  const s = rawAmt == null || rawAmt === "" ? "0" : String(rawAmt).replace(/,/g, "");
  const amount = Number(s) || 0;

  await level5OverrideUpsert({ employeeId, year, eventKey, amount });
  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "Level5Override",
    entityId: `${employeeId}:${year}:${eventKey}`,
  });
  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/salary-inclusion-report");
  return { 성공: true };
}

export async function saveLevel5OverrideFormAction(formData: FormData): Promise<void> {
  await saveLevel5OverrideAction(null, formData);
}

export async function deleteLevel5OverrideFormAction(formData: FormData): Promise<void> {
  const employeeId = String(formData.get("employeeId") ?? "");
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const eventKey = String(formData.get("eventKey") ?? "");
  await deleteLevel5OverrideAction(employeeId, year, eventKey);
}

export async function deleteLevel5OverrideAction(
  employeeId: string,
  year: number,
  eventKey: string
): Promise<LevelRulesState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const emp = await employeeFindFirst(employeeId, ctx.tenantId);
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  try {
    await level5OverrideDelete(emp.id, year, eventKey);
  } catch {
    return { 오류: "삭제할 항목이 없습니다." };
  }
  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/salary-inclusion-report");
  return { 성공: true };
}
