"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEditEmployees, canEditLevelRules } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { QUARTERLY_ITEM, type QuarterlyItemKey } from "@/lib/business-rules";
import { validateQuarterlyMonth } from "@/lib/domain/schedule";
import { resolveActionTenant } from "@/lib/tenant-context";

function dec(s: string) {
  return new Prisma.Decimal(s.replace(/,/g, "") || "0");
}

function optDec(s: string | null): Prisma.Decimal | null {
  if (s === null || s === "") return null;
  return new Prisma.Decimal(s.replace(/,/g, ""));
}

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

export async function saveQuarterlyRatesAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  if (!Number.isFinite(year)) return { 오류: "연도 오류" };

  const items = Object.values(QUARTERLY_ITEM) as QuarterlyItemKey[];
  try {
    for (const itemKey of items) {
      await prisma.quarterlyRate.upsert({
        where: { tenantId_year_itemKey: { tenantId: ctx.tenantId, year, itemKey } },
        create: {
          tenantId: ctx.tenantId,
          year,
          itemKey,
          amountPerInfant: optDec(String(formData.get(`${itemKey}_infant`) ?? "")),
          amountPerPreschool: optDec(String(formData.get(`${itemKey}_pre`) ?? "")),
          amountPerTeen: optDec(String(formData.get(`${itemKey}_teen`) ?? "")),
          amountPerParent: optDec(String(formData.get(`${itemKey}_par`) ?? "")),
          amountPerInLaw: optDec(String(formData.get(`${itemKey}_inlaw`) ?? "")),
          flatAmount: optDec(String(formData.get(`${itemKey}_flat`) ?? "")),
          percentInsurance: optDec(String(formData.get(`${itemKey}_pins`) ?? "")),
          percentLoanInterest: optDec(String(formData.get(`${itemKey}_ploan`) ?? "")),
        },
        update: {
          amountPerInfant: optDec(String(formData.get(`${itemKey}_infant`) ?? "")),
          amountPerPreschool: optDec(String(formData.get(`${itemKey}_pre`) ?? "")),
          amountPerTeen: optDec(String(formData.get(`${itemKey}_teen`) ?? "")),
          amountPerParent: optDec(String(formData.get(`${itemKey}_par`) ?? "")),
          amountPerInLaw: optDec(String(formData.get(`${itemKey}_inlaw`) ?? "")),
          flatAmount: optDec(String(formData.get(`${itemKey}_flat`) ?? "")),
          percentInsurance: optDec(String(formData.get(`${itemKey}_pins`) ?? "")),
          percentLoanInterest: optDec(String(formData.get(`${itemKey}_ploan`) ?? "")),
        },
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
  revalidatePath("/dashboard/quarterly");
  revalidatePath("/dashboard/schedule");
  return { 성공: true };
}

const cfgSchema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number(),
  itemKey: z.string().min(1),
  paymentMonth: z.coerce.number().min(1).max(12),
  amount: z.string(),
});

export async function saveQuarterlyEmployeeConfigAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "권한이 없습니다." };

  const parsed = cfgSchema.safeParse({
    employeeId: formData.get("employeeId"),
    year: formData.get("year"),
    itemKey: formData.get("itemKey"),
    paymentMonth: formData.get("paymentMonth"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { 오류: "입력값을 확인하세요." };

  const v = validateQuarterlyMonth(parsed.data.paymentMonth);
  if (!v.ok) return { 오류: v.message ?? "지급 월 오류" };

  const emp = await prisma.employee.findFirst({
    where: { id: parsed.data.employeeId, tenantId: ctx.tenantId },
  });
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  const amount = dec(parsed.data.amount);
  await prisma.quarterlyEmployeeConfig.upsert({
    where: {
      employeeId_year_itemKey: {
        employeeId: emp.id,
        year: parsed.data.year,
        itemKey: parsed.data.itemKey,
      },
    },
    create: {
      employeeId: emp.id,
      year: parsed.data.year,
      itemKey: parsed.data.itemKey,
      paymentMonth: parsed.data.paymentMonth,
      amount,
    },
    update: {
      paymentMonth: parsed.data.paymentMonth,
      amount,
    },
  });
  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "QuarterlyEmployeeConfig",
    entityId: `${emp.id}:${parsed.data.year}:${parsed.data.itemKey}`,
  });
  revalidatePath("/dashboard/quarterly");
  revalidatePath("/dashboard/schedule");
  return { 성공: true };
}

export async function applyQuarterlyTemplateAction(_: QState, formData: FormData): Promise<QState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) return { 오류: "권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const employeeId = String(formData.get("employeeId") ?? "");
  const paymentMonth = parseInt(String(formData.get("paymentMonth") ?? "3"), 10);
  if (!Number.isFinite(year) || !employeeId) return { 오류: "연도·직원을 확인하세요." };

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: ctx.tenantId },
  });
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  const rates = await prisma.quarterlyRate.findMany({
    where: { tenantId: ctx.tenantId, year },
  });
  const rateMap = new Map(rates.map((r) => [r.itemKey, r]));

  const { computeQuarterlyAmountFromRates } = await import("@/lib/domain/schedule");
  const items = Object.values(QUARTERLY_ITEM) as QuarterlyItemKey[];

  for (const itemKey of items) {
    const r = rateMap.get(itemKey) ?? null;
    const amountN = computeQuarterlyAmountFromRates(emp, itemKey, r);
    if (amountN <= 0) continue;
    await prisma.quarterlyEmployeeConfig.upsert({
      where: { employeeId_year_itemKey: { employeeId: emp.id, year, itemKey } },
      create: {
        employeeId: emp.id,
        year,
        itemKey,
        paymentMonth,
        amount: new Prisma.Decimal(amountN),
      },
      update: {
        paymentMonth,
        amount: new Prisma.Decimal(amountN),
      },
    });
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "BULK_APPLY",
    entity: "QuarterlyEmployeeConfig",
    entityId: emp.id,
    payload: { year, paymentMonth },
  });
  revalidatePath("/dashboard/quarterly");
  revalidatePath("/dashboard/schedule");
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
  const extra = String(formData.get("optionalExtraAmount") ?? "").replace(/,/g, "");
  const optionalExtraAmount = extra === "" ? null : new Prisma.Decimal(extra);

  if (!employeeId || !Number.isFinite(year) || month < 1 || month > 12) {
    return { 오류: "입력 오류" };
  }

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: ctx.tenantId },
  });
  if (!emp) return { 오류: "직원을 찾을 수 없습니다." };

  await prisma.monthlyEmployeeNote.upsert({
    where: { employeeId_year_month: { employeeId: emp.id, year, month } },
    create: {
      employeeId: emp.id,
      year,
      month,
      optionalWelfareText,
      optionalExtraAmount,
    },
    update: { optionalWelfareText, optionalExtraAmount },
  });
  revalidatePath("/dashboard/schedule");
  return { 성공: true };
}
