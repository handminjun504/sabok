"use server";

import { ClientResponseError } from "pocketbase";
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
import { pocketBaseNonemptyBlankHint, pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { revalidateEmployeeArtifacts, revalidateLevelArtifacts } from "@/lib/util/revalidate";

export type LevelRulesState = { 오류?: string; 성공?: boolean } | null;

export type LevelRuleCellSaveResult = { ok: true } | { ok: false; 오류: string };

/** 레벨·행사 한 칸만 저장 — 자동 저장용 */
export async function saveLevelPaymentRuleCellAction(
  year: number,
  level: number,
  eventKey: string,
  amount: number
): Promise<LevelRuleCellSaveResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { ok: false, 오류: "레벨 규칙을 수정할 권한이 없습니다." };

  const yearN = Math.round(Number(year));
  if (!Number.isFinite(yearN) || yearN < 2000 || yearN > 2100) {
    return { ok: false, 오류: "연도가 올바르지 않습니다." };
  }
  const lv = Math.round(Number(level));
  if (lv < 1 || lv > 5) return { ok: false, 오류: "레벨이 올바르지 않습니다." };
  const key = String(eventKey ?? "").trim();
  if (!key) return { ok: false, 오류: "행사 키가 없습니다." };
  const amt = Number(amount);
  const amountN = Number.isFinite(amt) ? Math.max(0, Math.round(amt)) : 0;

  const settings = await companySettingsByTenant(ctx.tenantId);
  const allowed = allPaymentEventKeysForYear(settings, yearN);
  if (!allowed.includes(key)) return { ok: false, 오류: "유효하지 않은 행사입니다." };

  try {
    await levelPaymentRuleUpsert({
      tenantId: ctx.tenantId,
      year: yearN,
      level: lv,
      eventKey: key,
      amount: amountN,
    });
  } catch (e) {
    console.error(e);
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { ok: false, 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}` };
    }
    return { ok: false, 오류: "저장에 실패했습니다." };
  }

  revalidateLevelArtifacts();
  return { ok: true };
}

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
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}` };
    }
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
  revalidateLevelArtifacts();
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
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}` };
    }
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
  revalidateLevelArtifacts();
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
  revalidateLevelArtifacts();
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
  revalidateLevelArtifacts();
  revalidateEmployeeArtifacts();
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
  revalidateEmployeeArtifacts();
  return { 성공: true };
}

export async function saveLevel5OverrideFormAction(formData: FormData): Promise<void> {
  await saveLevel5OverrideAction(null, formData);
}

export type Level5OverrideCellResult = { ok: true } | { ok: false; 오류: string };

/**
 * 레벨 5 직원의 한 행사 오버라이드 셀 저장.
 * - amount === 0 또는 빈 값(0)이면 기존 오버라이드를 삭제(레벨 공통 금액으로 자동 복귀)
 * - 그 외에는 upsert
 *
 * `LevelRulesMatrixForm` 과 동일한 “셀에 입력 후 자동 저장” 패턴을 위해 만들어졌다.
 */
export async function saveLevel5OverrideCellAction(
  employeeId: string,
  year: number,
  eventKey: string,
  amount: number,
): Promise<Level5OverrideCellResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) {
    return { ok: false, 오류: "레벨 규칙을 수정할 권한이 없습니다." };
  }

  const yearN = Math.round(Number(year));
  if (!Number.isFinite(yearN) || yearN < 2000 || yearN > 2100) {
    return { ok: false, 오류: "연도가 올바르지 않습니다." };
  }
  const key = String(eventKey ?? "").trim();
  if (!key) return { ok: false, 오류: "행사 키가 없습니다." };
  const empId = String(employeeId ?? "").trim();
  if (!empId) return { ok: false, 오류: "직원 ID 가 없습니다." };

  const settings = await companySettingsByTenant(ctx.tenantId);
  const allowed = allPaymentEventKeysForYear(settings, yearN);
  if (!allowed.includes(key)) return { ok: false, 오류: "유효하지 않은 행사입니다." };

  const emp = await employeeFindFirst(empId, ctx.tenantId);
  if (!emp) return { ok: false, 오류: "직원을 찾을 수 없습니다." };
  if (emp.level !== 5) {
    return { ok: false, 오류: "레벨 5 직원만 오버라이드할 수 있습니다." };
  }

  const amt = Number(amount);
  const amountN = Number.isFinite(amt) ? Math.max(0, Math.round(amt)) : 0;

  try {
    if (amountN <= 0) {
      /** 0/빈값 = “레벨 공통 금액으로 복귀” — 기존 오버라이드 있으면 삭제 */
      await level5OverrideDelete(empId, yearN, key);
    } else {
      await level5OverrideUpsert({ employeeId: empId, year: yearN, eventKey: key, amount: amountN });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { ok: false, 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}` };
    }
    return { ok: false, 오류: "저장에 실패했습니다." };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: amountN <= 0 ? "DELETE" : "UPSERT",
    entity: "Level5Override",
    entityId: `${empId}:${yearN}:${key}`,
  });

  revalidateEmployeeArtifacts();
  return { ok: true };
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
  revalidateEmployeeArtifacts();
  return { 성공: true };
}
