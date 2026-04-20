"use server";

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
import { koreaMinimumAnnualSalaryWon } from "@/lib/domain/korea-minimum-wage";
import {
  logPbClientError,
  pocketBaseNonemptyBlankHint,
  pocketBaseRecordErrorMessage,
} from "@/lib/pb/client-error-log";
import { parseSalaryInclusionVarianceModeOrNull } from "@/lib/domain/salary-inclusion-display";
import { toInt0, toIntOrNull, toNum0, toNumOrNull } from "@/lib/util/number";
import { revalidateEmployeeArtifacts } from "@/lib/util/revalidate";

function chk(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
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

  const baseSalary = toNum0(formData.get("baseSalary"));
  const adjustedSalary = toNum0(formData.get("adjustedSalary"));

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
    경고 = `${payYear}년 최저임금(연 환산 약 ${minAnnual.toLocaleString("ko-KR")}원)보다 적용 연봉(${effectiveAnnual.toLocaleString("ko-KR")}원)이 낮습니다. 확인하세요.`;
  }

  const existingEmp = id ? await employeeFindFirst(id, ctx.tenantId) : null;
  if (id && !existingEmp) return { 오류: "직원을 찾을 수 없습니다." };

  const showSurveyRep = settings?.surveyShowRepReturn ?? false;
  const showSurveySpouse = settings?.surveyShowSpouseReceipt ?? false;
  const showSurveyWorker = settings?.surveyShowWorkerNet ?? false;

  const flagRepReturn = showSurveyRep
    ? chk(formData, "flagRepReturn")
    : (existingEmp?.flagRepReturn ?? false);
  const flagSpouseReceipt = showSurveySpouse
    ? chk(formData, "flagSpouseReceipt")
    : (existingEmp?.flagSpouseReceipt ?? false);
  const flagWorkerNet = showSurveyWorker
    ? chk(formData, "flagWorkerNet")
    : (existingEmp?.flagWorkerNet ?? false);

  const data: Record<string, unknown> = {
    name,
    position,
    level,
    baseSalary,
    adjustedSalary,
    welfareAllocation: toNum0(formData.get("welfareAllocation")),
    incentiveAmount: toNumOrNull(formData.get("incentiveAmount")),
    discretionaryAmount: toNumOrNull(formData.get("discretionaryAmount")),
    monthlyPayAmount: toNumOrNull(formData.get("monthlyPayAmount")),
    quarterlyPayAmount: toNumOrNull(formData.get("quarterlyPayAmount")),
    expectedYearlyWelfare: toNumOrNull(formData.get("expectedYearlyWelfare")),
    birthMonth: toIntOrNull(formData.get("birthMonth")),
    hireMonth: toIntOrNull(formData.get("hireMonth")),
    resignMonth: toIntOrNull(formData.get("resignMonth")),
    weddingMonth: toIntOrNull(formData.get("weddingMonth")),
    childrenInfant: toInt0(formData.get("childrenInfant")),
    childrenPreschool: toInt0(formData.get("childrenPreschool")),
    childrenTeen: toInt0(formData.get("childrenTeen")),
    parentsCount: toInt0(formData.get("parentsCount")),
    parentsInLawCount: toInt0(formData.get("parentsInLawCount")),
    insurancePremium: toNum0(formData.get("insurancePremium")),
    loanInterest: toNum0(formData.get("loanInterest")),
    monthlyRentAmount: toNumOrNull(formData.get("monthlyRentAmount")),
    payDay: toIntOrNull(formData.get("payDay")),
    flagAutoAmount: chk(formData, "flagAutoAmount"),
    flagRepReturn,
    flagSpouseReceipt,
    flagWorkerNet,
    salaryInclusionVarianceMode: parseSalaryInclusionVarianceModeOrNull(formData.get("salaryInclusionVarianceMode")),
  };

  /** 신규 생성 시 선택 필드가 null이면 키 자체를 빼서 PB 검증 오류를 줄임 */
  function bodyForCreate(): Record<string, unknown> {
    const o = { ...data };
    const dropIfNull = [
      "incentiveAmount",
      "discretionaryAmount",
      "monthlyPayAmount",
      "quarterlyPayAmount",
      "expectedYearlyWelfare",
      "monthlyRentAmount",
      "birthMonth",
      "hireMonth",
      "resignMonth",
      "weddingMonth",
      "payDay",
      "salaryInclusionVarianceMode",
    ] as const;
    for (const k of dropIfNull) {
      if (o[k] === null) delete o[k];
    }
    return o;
  }

  function bodyForUpdate(employeeCode: string): Record<string, unknown> {
    const o: Record<string, unknown> = { ...data, employeeCode };
    const dropIfNull = [
      "incentiveAmount",
      "discretionaryAmount",
      "monthlyPayAmount",
      "quarterlyPayAmount",
      "expectedYearlyWelfare",
      "monthlyRentAmount",
      "birthMonth",
      "hireMonth",
      "resignMonth",
      "weddingMonth",
      "payDay",
    ] as const;
    for (const k of dropIfNull) {
      if (o[k] === null) delete o[k];
    }
    return o;
  }

  let employeeDetailPath: string | undefined;
  try {
    if (id && existingEmp) {
      const emp = existingEmp;
      await employeeUpdate(emp.id, ctx.tenantId, bodyForUpdate(emp.employeeCode));
      employeeDetailPath = `/dashboard/employees/${id}`;
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
      const created = await employeeCreate({
        ...bodyForCreate(),
        tenantId: ctx.tenantId,
        employeeCode,
      });
      employeeDetailPath = `/dashboard/employees/${created.id}`;
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
    if (e instanceof ClientResponseError) {
      logPbClientError("saveEmployeeAction", e);
      const detail = pocketBaseRecordErrorMessage(e);
      const hint = pocketBaseNonemptyBlankHint(detail);
      return {
        오류:
          position === CEO_POSITION
            ? `저장 실패. 이미 코드 0번(대표이사) 직원이 있을 수 있습니다. ${detail}${hint}`
            : `저장 실패. ${detail}${hint}`,
      };
    }
    console.error(e);
    return { 오류: "저장에 실패했습니다. 서버 로그를 확인하세요." };
  }

  revalidateEmployeeArtifacts({ detailPath: employeeDetailPath, includeNew: true });
  return 경고 ? { 성공: true, 경고 } : { 성공: true };
}

export async function deleteEmployeeAction(employeeId: string): Promise<EmployeeActionState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "삭제 권한이 없습니다." };
  try {
    const emp = await employeeFindFirst(employeeId, ctx.tenantId);
    if (!emp) return { 오류: "직원을 찾을 수 없습니다." };
    await employeeDelete(emp.id, ctx.tenantId);
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
  revalidateEmployeeArtifacts();
  return { 성공: true };
}

export async function deleteEmployeeFormAction(
  _prev: EmployeeActionState | null,
  formData: FormData
): Promise<EmployeeActionState> {
  const id = String(formData.get("employeeId") ?? "").trim();
  if (!id) return { 오류: "직원 정보가 없습니다." };
  return deleteEmployeeAction(id);
}
