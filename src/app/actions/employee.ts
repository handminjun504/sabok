"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEditEmployees } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

function d(v: FormDataEntryValue | null): Prisma.Decimal {
  const s = v == null || v === "" ? "0" : String(v).replace(/,/g, "");
  return new Prisma.Decimal(s);
}

function optDec(v: FormDataEntryValue | null): Prisma.Decimal | null {
  const s = v == null || v === "" ? null : String(v).replace(/,/g, "");
  if (s === null) return null;
  return new Prisma.Decimal(s);
}

function chk(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function intOpt(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function int0(v: FormDataEntryValue | null): number {
  const n = parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

const baseSchema = z.object({
  employeeCode: z.string().min(1, "직원 코드 필수"),
  name: z.string().min(1, "이름 필수"),
  position: z.string().min(1, "직급 필수"),
  level: z.coerce.number().min(1).max(5),
});

export type EmployeeActionState = { 오류?: string; 성공?: boolean } | null;

export async function saveEmployeeAction(_prev: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "직원 정보를 수정할 권한이 없습니다." };

  const id = String(formData.get("id") ?? "");
  const parsed = baseSchema.safeParse({
    employeeCode: formData.get("employeeCode"),
    name: formData.get("name"),
    position: formData.get("position"),
    level: formData.get("level"),
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }
  const { employeeCode, name, position, level } = parsed.data;

  const data = {
    employeeCode,
    name,
    position,
    level,
    baseSalary: d(formData.get("baseSalary")),
    adjustedSalary: d(formData.get("adjustedSalary")),
    welfareAllocation: d(formData.get("welfareAllocation")),
    incentiveAmount: optDec(formData.get("incentiveAmount")),
    discretionaryAmount: optDec(formData.get("discretionaryAmount")),
    optionalWelfareAmount: optDec(formData.get("optionalWelfareAmount")),
    monthlyPayAmount: optDec(formData.get("monthlyPayAmount")),
    quarterlyPayAmount: optDec(formData.get("quarterlyPayAmount")),
    birthMonth: intOpt(formData.get("birthMonth")),
    hireMonth: intOpt(formData.get("hireMonth")),
    weddingMonth: intOpt(formData.get("weddingMonth")),
    childrenInfant: int0(formData.get("childrenInfant")),
    childrenPreschool: int0(formData.get("childrenPreschool")),
    childrenTeen: int0(formData.get("childrenTeen")),
    parentsCount: int0(formData.get("parentsCount")),
    parentsInLawCount: int0(formData.get("parentsInLawCount")),
    insurancePremium: d(formData.get("insurancePremium")),
    loanInterest: d(formData.get("loanInterest")),
    payDay: intOpt(formData.get("payDay")),
    flagAutoAmount: chk(formData, "flagAutoAmount"),
    flagRepReturn: chk(formData, "flagRepReturn"),
    flagSpouseReceipt: chk(formData, "flagSpouseReceipt"),
    flagWorkerNet: chk(formData, "flagWorkerNet"),
  };

  try {
    if (id) {
      const emp = await prisma.employee.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!emp) return { 오류: "직원을 찾을 수 없습니다." };
      await prisma.employee.update({
        where: { id: emp.id },
        data,
      });
      await writeAudit({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        action: "UPDATE",
        entity: "Employee",
        entityId: id,
        payload: { employeeCode },
      });
    } else {
      const created = await prisma.employee.create({
        data: { ...data, tenantId: ctx.tenantId },
      });
      await writeAudit({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        action: "CREATE",
        entity: "Employee",
        entityId: created.id,
        payload: { employeeCode },
      });
    }
  } catch (e) {
    console.error(e);
    return { 오류: "저장에 실패했습니다. 직원 코드 중복 여부를 확인하세요." };
  }

  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/schedule");
  return { 성공: true };
}

export async function deleteEmployeeAction(employeeId: string): Promise<EmployeeActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "삭제 권한이 없습니다." };
  try {
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId } });
    if (!emp) return { 오류: "직원을 찾을 수 없습니다." };
    await prisma.employee.delete({ where: { id: emp.id } });
    await writeAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      action: "DELETE",
      entity: "Employee",
      entityId: employeeId,
    });
  } catch (e) {
    console.error(e);
    return { 오류: "삭제에 실패했습니다." };
  }
  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/schedule");
  return { 성공: true };
}
