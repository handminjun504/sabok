"use server";

import { ClientResponseError } from "pocketbase";

import {
  allPaymentEventKeysForYear,
  customPaymentScheduleRows,
  effectiveFixedEventMonthMap,
} from "@/lib/domain/payment-events";
import {
  planMidYearRebalance,
  type EffectiveMonth,
  type MidYearChangeRequest,
  type MidYearRebalanceContext,
  type MidYearRebalancePlan,
} from "@/lib/domain/mid-year-rebalance";
import { writeAudit } from "@/lib/audit";
import {
  companySettingsByTenant,
  employeeFindFirst,
  employeeListByTenantCodeAsc,
  employeeUpdate,
  level5OverrideListByEmployeeIdsYear,
  level5OverrideUpsert,
  levelPaymentRuleList,
  levelPaymentRuleUpsert,
  monthlyNoteListByTenantYear,
  monthlyNoteUpsertOverrides,
  quarterlyEmployeeConfigListByTenantYear,
} from "@/lib/pb/repository";
import { canEditLevelRules } from "@/lib/permissions";
import { pocketBaseNonemptyBlankHint, pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { resolveActionTenant } from "@/lib/tenant-context";
import { revalidateEmployeeArtifacts, revalidateLevelArtifacts } from "@/lib/util/revalidate";

/**
 * 클라이언트(미리보기·적용 공용)에서 서버로 전달하는 입력 스키마.
 * FormData 를 쓰지 않는 것은: 이벤트×금액 맵이 동적이라 JSON 직렬화가 더 깔끔해서다.
 */
export type MidYearChangeInput = {
  effectiveMonth: number;
  kind: "LEVEL_RULE" | "EMPLOYEE_LEVEL" | "EMPLOYEE_AMOUNT";
  level?: number;
  employeeId?: string;
  newLevel?: number;
  newAmountsByEventKey?: Record<string, number>;
};

export type MidYearRebalanceActionResult =
  | { ok: true; plan: MidYearRebalancePlan }
  | { ok: false; 오류: string };

/** effectiveMonth 를 1~12 범위로 강제 + EffectiveMonth 타입으로 좁힌다. */
function normalizeEffectiveMonth(m: number): EffectiveMonth | null {
  const n = Math.round(Number(m));
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return n as EffectiveMonth;
}

/**
 * 숫자 맵을 원 단위 정수로 정규화. 값이 NaN/음수인 경우 0 으로 고정해
 * 서버에 "알 수 없는 값"이 들어오는 걸 막는다.
 */
function sanitizeAmountsMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    const num = Number(v);
    if (!Number.isFinite(num)) continue;
    out[key] = Math.max(0, Math.round(num));
  }
  return out;
}

/**
 * 입력 검증 + 서버 리소스 로드 후 `planMidYearRebalance` 실행.
 * - 미리보기(DB 무쓰기)와 적용(DB 쓰기) 양쪽에서 재사용 — apply 에서 preview 와 "같은" plan 을
 *   다시 계산해야 입력 변조를 방지할 수 있다.
 */
async function loadContextAndPlan(
  tenantId: string,
  input: MidYearChangeInput,
): Promise<
  | { ok: true; plan: MidYearRebalancePlan; context: MidYearRebalanceContext }
  | { ok: false; 오류: string }
> {
  const effectiveMonth = normalizeEffectiveMonth(input.effectiveMonth);
  if (effectiveMonth == null) {
    return { ok: false, 오류: "적용 월(effectiveMonth) 이 1~12 사이여야 합니다." };
  }

  const settings = await companySettingsByTenant(tenantId);
  if (!settings) {
    return { ok: false, 오류: "업체 설정을 찾을 수 없습니다." };
  }
  const year = settings.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings.foundingMonth ?? 1;
  const accrual = settings.accrualCurrentMonthPayNext ?? false;
  const allowedEventKeys = new Set(allPaymentEventKeysForYear(settings, year));

  const sanitized = sanitizeAmountsMap(input.newAmountsByEventKey);
  /** 알 수 없는 eventKey 는 버린다 — 악의적 입력이 DB 에 새 규칙을 만들게 하면 안 된다. */
  const filteredAmounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(sanitized)) {
    if (allowedEventKeys.has(k)) filteredAmounts[k] = v;
  }

  let request: MidYearChangeRequest;
  if (input.kind === "LEVEL_RULE") {
    const lv = Math.round(Number(input.level));
    if (!Number.isFinite(lv) || lv < 1 || lv > 5) {
      return { ok: false, 오류: "레벨이 올바르지 않습니다." };
    }
    if (Object.keys(filteredAmounts).length === 0) {
      return { ok: false, 오류: "변경할 금액을 1개 이상 입력하세요." };
    }
    request = {
      kind: "LEVEL_RULE",
      effectiveMonth,
      level: lv,
      newAmountsByEventKey: filteredAmounts,
    };
  } else if (input.kind === "EMPLOYEE_LEVEL") {
    const empId = String(input.employeeId ?? "").trim();
    const newLevel = Math.round(Number(input.newLevel));
    if (!empId) return { ok: false, 오류: "직원 ID 가 없습니다." };
    if (!Number.isFinite(newLevel) || newLevel < 1 || newLevel > 5) {
      return { ok: false, 오류: "새 레벨이 1~5 사이여야 합니다." };
    }
    const emp = await employeeFindFirst(empId, tenantId);
    if (!emp) return { ok: false, 오류: "직원을 찾을 수 없습니다." };
    request = {
      kind: "EMPLOYEE_LEVEL",
      effectiveMonth,
      employeeId: empId,
      newLevel,
    };
  } else if (input.kind === "EMPLOYEE_AMOUNT") {
    const empId = String(input.employeeId ?? "").trim();
    if (!empId) return { ok: false, 오류: "직원 ID 가 없습니다." };
    if (Object.keys(filteredAmounts).length === 0) {
      return { ok: false, 오류: "변경할 금액을 1개 이상 입력하세요." };
    }
    const emp = await employeeFindFirst(empId, tenantId);
    if (!emp) return { ok: false, 오류: "직원을 찾을 수 없습니다." };
    request = {
      kind: "EMPLOYEE_AMOUNT",
      effectiveMonth,
      employeeId: empId,
      newAmountsByEventKey: filteredAmounts,
    };
  } else {
    return { ok: false, 오류: "알 수 없는 변경 유형입니다." };
  }

  const employees = await employeeListByTenantCodeAsc(tenantId);
  const ids = employees.map((e) => e.id);

  const [rules, overrides, quarterly, notes] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeIdsYear(ids, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids),
    monthlyNoteListByTenantYear(tenantId, year, ids),
  ]);

  const context: MidYearRebalanceContext = {
    tenantId,
    year,
    foundingMonth,
    accrualCurrentMonthPayNext: accrual,
    customPaymentEvents: customPaymentScheduleRows(settings, year),
    fixedEventMonthsOverride: effectiveFixedEventMonthMap(settings),
    employees,
    rules,
    overrides,
    quarterly,
    notes,
    request,
  };

  const plan = planMidYearRebalance(context);
  return { ok: true, plan, context };
}

/**
 * DB 쓰기 없이 계획을 반환. 조회 권한만 있으면 호출 가능.
 * - 프리뷰는 UI 에서 "아직 저장 전" 상태로 변경분을 보여주기 위함이라 revalidate 하지 않는다.
 */
export async function previewMidYearRebalanceAction(
  input: MidYearChangeInput,
): Promise<MidYearRebalanceActionResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };

  try {
    const r = await loadContextAndPlan(ctx.tenantId, input);
    if (!r.ok) return r;
    return { ok: true, plan: r.plan };
  } catch (e) {
    console.error(e);
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { ok: false, 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}` };
    }
    return { ok: false, 오류: "미리보기 계산에 실패했습니다." };
  }
}

/**
 * 서버에서 plan 을 재계산한 뒤 일괄 쓰기:
 *   1) `levelPaymentRuleUpsert` (L1 인 경우)
 *   2) `level5OverrideUpsert` (L3 + L5 직원인 경우)
 *   3) `employeeUpdate(level)` (L2 인 경우)
 *   4) 직원별 `monthlyNoteUpsertOverrides` (스냅샷·덮어쓰기)
 *   5) `writeAudit` + `revalidate*`
 *
 * 중간 실패 시 이미 쓴 레코드는 roll back 하지 않는다(PB 에 트랜잭션이 없음).
 * 대신 오류 메시지에 "일부 쓰기 완료" 여부를 담아 운영자가 재시도·수동 정리를 결정할 수 있게 한다.
 */
export async function applyMidYearRebalanceAction(
  input: MidYearChangeInput,
): Promise<MidYearRebalanceActionResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };
  if (!canEditLevelRules(ctx.role)) {
    return { ok: false, 오류: "중도 재분배를 적용할 권한이 없습니다." };
  }

  let plan: MidYearRebalancePlan;
  try {
    const r = await loadContextAndPlan(ctx.tenantId, input);
    if (!r.ok) return r;
    plan = r.plan;
  } catch (e) {
    console.error(e);
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { ok: false, 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}` };
    }
    return { ok: false, 오류: "적용 전 계획 계산에 실패했습니다." };
  }

  let completedWrites = 0;
  try {
    for (const w of plan.ruleWrites) {
      await levelPaymentRuleUpsert({
        tenantId: ctx.tenantId,
        year: plan.year,
        level: w.level,
        eventKey: w.eventKey,
        amount: w.amount,
      });
      completedWrites++;
    }
    for (const w of plan.level5Writes) {
      await level5OverrideUpsert({
        employeeId: w.employeeId,
        year: plan.year,
        eventKey: w.eventKey,
        amount: w.amount,
      });
      completedWrites++;
    }
    for (const u of plan.employeeLevelUpdates) {
      await employeeUpdate(u.employeeId, ctx.tenantId, { level: u.newLevel });
      completedWrites++;
    }
    for (const r of plan.affectedEmployees) {
      for (const nw of r.noteWrites) {
        await monthlyNoteUpsertOverrides({
          employeeId: r.employeeId,
          year: plan.year,
          month: nw.month,
          welfareOverrideAmount: nw.welfareOverrideAmount,
          adjustedSalaryOverrideAmount: nw.adjustedSalaryOverrideAmount,
          levelOverride: nw.levelOverride,
        });
        completedWrites++;
      }
    }
  } catch (e) {
    console.error(e);
    const partial =
      completedWrites > 0 ? ` (일부 ${completedWrites}건은 이미 반영됨 — PB 에서 확인 필요)` : "";
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { ok: false, 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}${partial}` };
    }
    return { ok: false, 오류: `저장에 실패했습니다.${partial}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPSERT",
    entity: "MidYearRebalance",
    entityId: `${plan.year}:${plan.request.kind}:${plan.request.effectiveMonth}`,
    payload: {
      year: plan.year,
      effectiveMonth: plan.request.effectiveMonth,
      kind: plan.request.kind,
      affectedEmployeeIds: plan.affectedEmployees.map((e) => e.employeeId),
      ruleWrites: plan.ruleWrites.length,
      level5Writes: plan.level5Writes.length,
      employeeLevelUpdates: plan.employeeLevelUpdates.length,
      noteWrites: plan.affectedEmployees.reduce((n, e) => n + e.noteWrites.length, 0),
    },
  });

  revalidateLevelArtifacts();
  revalidateEmployeeArtifacts();

  return { ok: true, plan };
}
