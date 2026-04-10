"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import {
  companySettingsByTenant,
  employeeCreate,
  employeeDelete,
  employeeFindFirst,
  employeeNextAutoCodeForTenant,
  employeeUpdate,
} from "@/lib/pb/repository";
import { canEditEmployees } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";
import { koreaMinimumAnnualSalaryWon, koreaMinimumHourlyWon } from "@/lib/domain/korea-minimum-wage";

function d(v: FormDataEntryValue | null): number {
  const s = v == null || v === "" ? "0" : String(v).replace(/,/g, "");
  return Number(s.replace(/,/g, "")) || 0;
}

function optDec(v: FormDataEntryValue | null): number | null {
  const s = v == null || v === "" ? null : String(v).replace(/,/g, "");
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
  name: z.string().min(1, "이름 필수"),
  position: z.string().min(1, "직급 필수"),
  level: z.coerce.number().min(1).max(5),
});

const CEO_POSITION = "대표이사";

function resolvePosition(position: string): string {
  return position.trim();
}

export type EmployeeActionState = { 오류?: string; 성공?: boolean; 경고?: string } | null;

export async function saveEmployeeAction(_prev: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "직원 정보를 수정할 권한이 없습니다." };

  const id = String(formData.get("id") ?? "").trim();
  const parsed = baseSchema.safeParse({
    name: formData.get("name"),
    position: formData.get("position"),
    level: formData.get("level"),
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }
  const { name, position: positionRaw, level } = parsed.data;
  const position = resolvePosition(positionRaw);

  const baseSalary = d(formData.get("baseSalary"));
  const adjustedSalary = d(formData.get("adjustedSalary"));

  if (baseSalary > 0 && adjustedSalary > 0) {
    const minAdj = Math.floor(baseSalary * 0.8);
    if (adjustedSalary < minAdj || adjustedSalary > baseSalary) {
      return {
        오류: `조정급여는 기존연봉의 80%~100% 범위(최대 20% 감액)여야 합니다. 허용: ${minAdj.toLocaleString("ko-KR")}원 ~ ${baseSalary.toLocaleString("ko-KR")}원.`,
      };
    }
  }

  const settings = await companySettingsByTenant(ctx.tenantId);
  const payYear = settings?.activeYear ?? new Date().getFullYear();
  const minAnnual = koreaMinimumAnnualSalaryWon(payYear);
  const effectiveAnnual = adjustedSalary > 0 ? adjustedSalary : baseSalary;
  let 경고: string | undefined;
  if (effectiveAnnual > 0 && effectiveAnnual < minAnnual) {
    const hourly = koreaMinimumHourlyWon(payYear);
    경고 = `${payYear}년 최저시급 ${hourly.toLocaleString("ko-KR")}원·월 209시간 기준 연간 환산 약 ${minAnnual.toLocaleString("ko-KR")}원보다, 적용 연봉(${effectiveAnnual.toLocaleString("ko-KR")}원)이 낮게 잡혀 있습니다. 계약·임금 구조는 노무 전문가 확인을 권장합니다.`;
  }

  const data = {
    name,
    position,
    level,
    baseSalary,
    adjustedSalary,
    welfareAllocation: d(formData.get("welfareAllocation")),
    incentiveAmount: optDec(formData.get("incentiveAmount")),
    discretionaryAmount: optDec(formData.get("discretionaryAmount")),
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
      const emp = await employeeFindFirst(id, ctx.tenantId);
      if (!emp) return { 오류: "직원을 찾을 수 없습니다." };
      await employeeUpdate(emp.id, { ...data, employeeCode: emp.employeeCode });
      await writeAudit({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        action: "UPDATE",
        entity: "Employee",
        entityId: id,
        payload: { employeeCode: emp.employeeCode },
      });
    } else {
      const employeeCode =
        position === CEO_POSITION ? "0" : await employeeNextAutoCodeForTenant(ctx.tenantId);
      const created = await employeeCreate({ ...data, tenantId: ctx.tenantId, employeeCode });
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
    const pbMsg = e instanceof ClientResponseError ? e.message : null;
    const suffix = pbMsg && pbMsg !== "Something went wrong." ? ` ${pbMsg}` : "";
    return {
      오류:
        position === CEO_POSITION
          ? `저장에 실패했습니다. 이미 코드 0번(대표이사) 직원이 있을 수 있습니다.${suffix}`
          : `저장에 실패했습니다. 직원 코드 중복·필수 필드·PocketBase 스키마를 확인하세요.${suffix}`,
    };
  }

  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/schedule");
  return 경고 ? { 성공: true, 경고 } : { 성공: true };
}

export async function deleteEmployeeAction(employeeId: string): Promise<EmployeeActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "삭제 권한이 없습니다." };
  try {
    const emp = await employeeFindFirst(employeeId, ctx.tenantId);
    if (!emp) return { 오류: "직원을 찾을 수 없습니다." };
    await employeeDelete(emp.id);
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
