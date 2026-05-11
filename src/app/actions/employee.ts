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
import { parseTenantOperationModeOrNull } from "@/lib/domain/tenant-profile";
import { toInt0, toIntOrNull, toNum0, toNumOrNull } from "@/lib/util/number";
import { revalidateEmployeeArtifacts } from "@/lib/util/revalidate";

/**
 * 체크박스 boolean 판정.
 *
 * 핵심 의도: HTML 표준에서 미체크 체크박스는 FormData 에 키 자체가 빠지므로,
 * 액션이 「키 미동봉 vs 명시적 미체크」 를 구분할 수 없다 → 무심코 기존값을 보존하는 분기가 들어가면
 * 사용자가 명시적으로 해제한 값이 다시 살아나는 silent-revert 사고가 난다(2026-05 사용자 보고).
 *
 * 해결: 폼 측에서 각 체크박스 앞에 hidden sentinel `<input type="hidden" name="<같은 키>" value="" />` 를 두고,
 * 본 함수는 `getAll(key)` 의 모든 값 중에 "on" 이 있는지 확인. hidden 의 빈 문자열은 false 로 자연 폴백,
 * 체크된 경우에만 "on" 이 들어가 true. hidden 이 없는 외부 호출부에서도 종전과 동일하게 작동(미체크=false).
 */
function chk(formData: FormData, key: string): boolean {
  return formData.getAll(key).some((v) => v === "on");
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
    /**
     * 「사복 미대상」 토글.
     *
     * 폼은 항상 hidden sentinel + checkbox 한 쌍으로 키를 동봉하므로 `formData.has(key)` 는 true,
     * `chk` 가 그대로 명시적 체크/미체크를 반영한다. 외부 호출부에서 키 자체가 빠진 경우에만
     * 기존 DB 값으로 보존(보수적 안전망) — 이 분기는 EmployeeForm 정상 경로에선 닿지 않는다.
     */
    flagWelfareIneligible: formData.has("flagWelfareIneligible")
      ? chk(formData, "flagWelfareIneligible")
      : (existingEmp?.flagWelfareIneligible ?? false),
    /**
     * 「퇴사월 사복 지급」 토글 — 미체크면 퇴사월 자체가 비활성(=그 달 사복 0).
     *
     * 2026-05 회귀 보고: 「퇴사월 사복 지급 체크해제 후 저장 → 다시 체크된 상태로 복원」.
     * 원인은 HTML 체크박스 미체크 시 키 자체가 FormData 에 빠져 위 fallback 분기로 빠지면서
     * `existingEmp.flagPayWelfareOnResignMonth = true` 가 그대로 살아남는 패턴이었다.
     * → 폼에 hidden sentinel 을 동봉하도록 했고, 본 분기는 외부 호출부에서만 의미를 가진다.
     */
    flagPayWelfareOnResignMonth: formData.has("flagPayWelfareOnResignMonth")
      ? chk(formData, "flagPayWelfareOnResignMonth")
      : (existingEmp?.flagPayWelfareOnResignMonth ?? false),
    salaryInclusionVarianceMode: parseSalaryInclusionVarianceModeOrNull(formData.get("salaryInclusionVarianceMode")),
  };

  /**
   * 「직원별 운영 모드」 — 폼에 input 이 실제로 존재할 때만 update 페이로드에 추가한다.
   * 의도:
   *   - 폼 입력 있음 + 값이 "" (=빈 옵션 "기본") → `null` 로 명시 update → override 해제(거래처 모드 따름).
   *   - 폼 입력 있음 + 값이 4모드 중 하나 → 그 모드로 명시 update.
   *   - 폼 입력 자체가 없음(다른 폼·과거 호출부) → 키 미동봉 → 기존 값 보존.
   *
   * 이 분기 덕분에 직원 폼이 아닌 다른 호출부에서 saveEmployeeAction 을 쓰더라도
   * 이미 저장된 override 가 silent 하게 null 로 날아가지 않는다(2026-05 회귀 류 사고 차단).
   */
  if (formData.has("operationMode")) {
    data.operationMode = parseTenantOperationModeOrNull(formData.get("operationMode"));
  }

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
      /** 직원별 운영 모드 — null = override 해제. 생성 시점에선 키를 빼서 PB 기본값 흐름 보존. */
      "operationMode",
    ] as const;
    for (const k of dropIfNull) {
      if (o[k] === null) delete o[k];
    }
    return o;
  }

  /**
   * 편집(update) 흐름.
   * PocketBase 의 number/select 컬럼은 빈 문자열("")이나 null 을 검증 단계에서 거절할 수 있고,
   * 그러면 5 같은 정상 입력값까지 update 가 통째로 실패해 "입력해도 저장이 안 됨" 사고가 난다.
   * → 신규 생성과 동일하게 nullable 키는 drop 해서, 입력한 값만 확실히 PocketBase 에 반영한다.
   * 비우기(예: 재직 중으로 되돌리기) 의도는 별도 액션(`clearResignAction` 등) 에서 명시적으로 처리한다.
   */
  function bodyForUpdate(employeeCode: string): Record<string, unknown> {
    const o: Record<string, unknown> = { ...data, employeeCode };
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

  let employeeDetailPath: string | undefined;
  let savedEmployeeId: string | undefined;
  try {
    if (id && existingEmp) {
      const emp = existingEmp;
      await employeeUpdate(emp.id, ctx.tenantId, bodyForUpdate(emp.employeeCode));
      employeeDetailPath = `/dashboard/employees/${id}`;
      savedEmployeeId = emp.id;
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
      savedEmployeeId = created.id;
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

  /**
   * 저장 직후 PB 가 실제로 어떤 값을 보존했는지 다시 읽어 검증한다.
   * - PocketBase 가 응답을 200 으로 주고도 컬럼이 없거나 silent ignore 되어
   *   "입력한 값이 영영 안 들어가는" 사고가 발생할 수 있어, 사용자에게 mismatch 를 즉시 노출.
   * - 비교 대상은 폼에서 손이 닿는 nullable 키 위주(현 단계 사고 다발 지점).
   */
  if (savedEmployeeId) {
    try {
      const verify = await employeeFindFirst(savedEmployeeId, ctx.tenantId);
      if (verify) {
        const expected = data;
        const checks: { key: string; label: string; expected: unknown; actual: unknown }[] = [
          { key: "resignMonth", label: "퇴사 월", expected: expected.resignMonth ?? null, actual: verify.resignMonth ?? null },
          { key: "resignYear", label: "퇴사 연도", expected: expected.resignYear ?? null, actual: verify.resignYear ?? null },
          { key: "flagPayWelfareOnResignMonth", label: "퇴사월 사복 지급 토글", expected: expected.flagPayWelfareOnResignMonth, actual: verify.flagPayWelfareOnResignMonth },
          { key: "flagWelfareIneligible", label: "사복 미대상", expected: expected.flagWelfareIneligible, actual: verify.flagWelfareIneligible },
          { key: "birthMonth", label: "생일 월", expected: expected.birthMonth ?? null, actual: verify.birthMonth ?? null },
          { key: "hireMonth", label: "입사 월", expected: expected.hireMonth ?? null, actual: verify.hireMonth ?? null },
        ];
        const mismatches = checks.filter((c) => {
          const a = c.expected === undefined ? null : c.expected;
          const b = c.actual === undefined ? null : c.actual;
          return a !== b;
        });
        if (mismatches.length > 0) {
          warnings.push(
            `저장 검증: PocketBase 가 일부 값을 보존하지 않았습니다 — ${mismatches
              .map((m) => `${m.label}(${m.key}): 입력=${String(m.expected ?? "비움")} → 저장=${String(m.actual ?? "비움")}`)
              .join(" · ")}. PB Admin 에서 sabok_employees 컬렉션의 해당 컬럼이 number/bool 타입으로 추가돼 있는지(또는 Nonempty 옵션이 꺼져 있는지) 확인하세요.`,
          );
        }
      }
    } catch (e) {
      console.warn("[employee] post-save verify 실패", e);
    }
  }

  const finalWarning = warnings.length > 0 ? warnings.join("\n") : undefined;
  revalidateEmployeeArtifacts({ detailPath: employeeDetailPath, includeNew: true });
  return finalWarning ? { 성공: true, 경고: finalWarning } : { 성공: true };
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
