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

  /** 80~100% 범위는 거절하지 않고 경고만 — 사용자 요청에 따라 저장은 항상 진행 */
  const warnings: string[] = [];
  if (baseSalary > 0 && adjustedSalary > 0) {
    const minAdj = Math.floor(baseSalary * 0.8);
    if (adjustedSalary < minAdj || adjustedSalary > baseSalary) {
      warnings.push(
        `참고: 조정급여(${adjustedSalary.toLocaleString("ko-KR")}원)가 기존연봉의 80~100% 범위(${minAdj.toLocaleString("ko-KR")}~${baseSalary.toLocaleString("ko-KR")}원)를 벗어납니다. 의도된 입력인지 확인하세요.`,
      );
    }
  }

  const settings = await companySettingsByTenant(ctx.tenantId);
  const payYear = settings?.activeYear ?? new Date().getFullYear();
  const minAnnual = koreaMinimumAnnualSalaryWon(payYear);
  const effectiveAnnual = adjustedSalary > 0 ? adjustedSalary : baseSalary;
  if (effectiveAnnual > 0 && effectiveAnnual < minAnnual) {
    warnings.push(
      `${payYear}년 최저임금(연 환산 약 ${minAnnual.toLocaleString("ko-KR")}원)보다 적용 연봉(${effectiveAnnual.toLocaleString("ko-KR")}원)이 낮습니다. 확인하세요.`,
    );
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

  /**
   * 퇴사 월만 입력하고 연도를 비워 두는 케이스가 흔하다.
   * 그대로 두면 도메인 규칙(`employeeStatusForYear`) 상 옛 데이터 안전망 때문에 무시되어 “퇴사월을 적었는데 반영 안 됨” 사고가 난다.
   * → 폼 단계에서 보정: `resignMonth` 만 있으면 `resignYear = activeYear` 로 자동 채움.
   * 사용자가 의도적으로 둘 다 비웠으면 그대로 둠(재직 중).
   */
  const resignMonthRaw = toIntOrNull(formData.get("resignMonth"));
  const resignYearRaw = toIntOrNull(formData.get("resignYear"));
  const resignMonthVal = resignMonthRaw;
  const resignYearVal =
    resignYearRaw == null && resignMonthRaw != null ? payYear : resignYearRaw;
  if (resignMonthRaw != null && resignYearRaw == null) {
    warnings.push(
      `‘퇴사 월’만 입력되어 있어 활성 연도(${payYear})로 자동 보정합니다. 다른 연도라면 ‘퇴사 연도’를 함께 입력하세요.`,
    );
  }
  const 경고 = warnings.length > 0 ? warnings.join("\n") : undefined;

  const data: Record<string, unknown> = {
    name,
    position,
    level,
    baseSalary,
    adjustedSalary,
    welfareAllocation: toNum0(formData.get("welfareAllocation")),
    priorOverpaidWelfareWon: toNumOrNull(formData.get("priorOverpaidWelfareWon")),
    incentiveAmount: toNumOrNull(formData.get("incentiveAmount")),
    discretionaryAmount: toNumOrNull(formData.get("discretionaryAmount")),
    monthlyPayAmount: toNumOrNull(formData.get("monthlyPayAmount")),
    quarterlyPayAmount: toNumOrNull(formData.get("quarterlyPayAmount")),
    expectedYearlyWelfare: toNumOrNull(formData.get("expectedYearlyWelfare")),
    birthMonth: toIntOrNull(formData.get("birthMonth")),
    hireMonth: toIntOrNull(formData.get("hireMonth")),
    resignMonth: resignMonthVal,
    resignYear: resignYearVal,
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
    /**
     * ‘사복 미대상’ 토글 — 폼에 체크박스로 노출. 신규 폼이라 항상 받지만 상위 화면에서
     * disabled 로 가려진 경우 기존값을 그대로 유지하도록 fallback.
     */
    flagWelfareIneligible:
      formData.get("flagWelfareIneligible") != null
        ? chk(formData, "flagWelfareIneligible")
        : (existingEmp?.flagWelfareIneligible ?? false),
    /**
     * ‘퇴사월에 사복 지급 완료’ — 폼 체크박스. 미체크면 퇴사월 자체가 비활성(=그 달 사복 0).
     * 폼이 없는 경로(과거 호출부)에서 들어와도 기존값을 보존하도록 fallback.
     */
    flagPayWelfareOnResignMonth:
      formData.get("flagPayWelfareOnResignMonth") != null
        ? chk(formData, "flagPayWelfareOnResignMonth")
        : (existingEmp?.flagPayWelfareOnResignMonth ?? false),
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
      "priorOverpaidWelfareWon",
      "birthMonth",
      "hireMonth",
      "resignMonth",
      "resignYear",
      "weddingMonth",
      "payDay",
      "salaryInclusionVarianceMode",
    ] as const;
    for (const k of dropIfNull) {
      if (o[k] === null) delete o[k];
    }
    return o;
  }

  /**
   * 편집(update) 흐름에서는 사용자가 칸을 ‘비웠다’ 의도까지 PB 에 그대로 전달해야
   * "한 번 채운 값이 영영 안 지워지는" 사고가 안 난다.
   * → 이전에는 이 목록 키들을 null 일 때 drop 해서, 퇴사월/연도 등을 비워 저장해도
   *   PB 에 reset 이 가지 않아 “저장이 안 된 것처럼” 보였다.
   *
   * PocketBase 의 `number` 컬럼은 명시적 `null` 보다 빈 문자열(`""`) 로 reset 하는 패턴이 더 호환성이 좋다.
   * 따라서 nullable number 필드는 null 을 "" 로 변환해 보내되, 키 자체는 그대로 두어 PB 가 컬럼 default 로 reset 하게 한다.
   *
   * - 신규 생성(`bodyForCreate`) 은 PB 의 빈 값 검증을 회피하려 여전히 null 키를 drop.
   * - 편집은 빈 문자열 reset 을 통해 “지우기” 가 동작.
   */
  function bodyForUpdate(employeeCode: string): Record<string, unknown> {
    const o: Record<string, unknown> = { ...data, employeeCode };
    const resetIfNull = [
      "incentiveAmount",
      "discretionaryAmount",
      "monthlyPayAmount",
      "quarterlyPayAmount",
      "expectedYearlyWelfare",
      "monthlyRentAmount",
      "priorOverpaidWelfareWon",
      "birthMonth",
      "hireMonth",
      "resignMonth",
      "resignYear",
      "weddingMonth",
      "payDay",
    ] as const;
    for (const k of resetIfNull) {
      if (o[k] === null) o[k] = "";
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
