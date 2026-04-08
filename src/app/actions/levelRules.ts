"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canEditLevelRules } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { PAYMENT_EVENT, type PaymentEventKey } from "@/lib/business-rules";
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

  const events = Object.values(PAYMENT_EVENT) as PaymentEventKey[];
  try {
    for (let level = 1; level <= 5; level++) {
      for (const eventKey of events) {
        const raw = formData.get(`amt_${level}_${eventKey}`);
        const s = raw == null || raw === "" ? "0" : String(raw).replace(/,/g, "");
        const amount = new Prisma.Decimal(s);
        await prisma.levelPaymentRule.upsert({
          where: { tenantId_year_level_eventKey: { tenantId: ctx.tenantId, year, level, eventKey } },
          create: { tenantId: ctx.tenantId, year, level, eventKey, amount },
          update: { amount },
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

  try {
    for (let level = 1; level <= 5; level++) {
      const raw = formData.get(`target_${level}`);
      const s = raw == null || raw === "" ? "0" : String(raw).replace(/,/g, "");
      const targetAmount = new Prisma.Decimal(s);
      await prisma.levelTarget.upsert({
        where: { tenantId_year_level: { tenantId: ctx.tenantId, year, level } },
        create: { tenantId: ctx.tenantId, year, level, targetAmount },
        update: { targetAmount },
      });
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
  });
  revalidatePath("/dashboard/levels");
  revalidatePath("/dashboard/schedule");
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

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: ctx.tenantId },
  });
  if (!emp || emp.level !== 5) return { 오류: "레벨 5 직원만 오버라이드할 수 있습니다." };

  const s = rawAmt == null || rawAmt === "" ? "0" : String(rawAmt).replace(/,/g, "");
  const amount = new Prisma.Decimal(s);

  await prisma.level5Override.upsert({
    where: {
      employeeId_year_eventKey: { employeeId, year, eventKey },
    },
    create: { employeeId, year, eventKey, amount },
    update: { amount },
  });
  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "Level5Override",
    entityId: `${employeeId}:${year}:${eventKey}`,
  });
  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/schedule");
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

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: ctx.tenantId },
  });
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  try {
    await prisma.level5Override.delete({
      where: {
        employeeId_year_eventKey: { employeeId: emp.id, year, eventKey },
      },
    });
  } catch {
    return { 오류: "삭제할 항목이 없습니다." };
  }
  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/schedule");
  return { 성공: true };
}
