"use server";

import { ClientResponseError } from "pocketbase";

import {
  companySettingsByTenant,
  employeeFindFirst,
  employeeListByTenantCodeAsc,
  employeeUpdate,
  monthlyNoteListByEmployeeYear,
  monthlyNoteListByTenantYear,
} from "@/lib/pb/repository";
import { canEditEmployees } from "@/lib/permissions";
import { resolveActionTenant } from "@/lib/tenant-context";
import { writeAudit } from "@/lib/audit";
import {
  logPbClientError,
  pocketBaseNonemptyBlankHint,
  pocketBaseRecordErrorMessage,
} from "@/lib/pb/client-error-log";
import { revalidateEmployeeArtifacts } from "@/lib/util/revalidate";
import {
  computeAdjustedSalaryAudit,
  computeAdjustedSalaryAuditList,
  listMismatchedEmployees,
  type AdjustedSalaryAudit,
} from "@/lib/domain/adjusted-salary-audit";
import type { Employee } from "@/types/models";

export type ResyncUpdatedRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  before: number;
  after: number;
  diff: number;
};

export type ResyncActionResult =
  | {
      ok: true;
      /** 동기화 전/후 진단 요약. 여러 건 일괄인 경우 전체 목록. */
      updated: ResyncUpdatedRow[];
      skipped: Array<{ employeeId: string; reason: string }>;
      message?: string;
    }
  | { ok: false; 오류: string };

/** 서버·클라이언트 공통으로 "어떤 이유로 skip 되는지" 를 일관되게 기록. */
function skipReasonOf(audit: AdjustedSalaryAudit): string | null {
  if (audit.isAfterResign) return "퇴사한 직원입니다.";
  if (audit.overrideMonths.length === 0) return "월별 조정급여 오버라이드가 없어 동기화할 값이 없습니다.";
  if (audit.diff === 0) return "이미 조사표 값과 실제 누적이 일치합니다.";
  if (audit.resyncTo == null) return "동기화 대상 값이 없습니다.";
  if (audit.resyncTo <= 0) return "누적 조정연봉이 0 이하라 동기화를 건너뜁니다.";
  return null;
}

async function resyncOne(
  tenantId: string,
  employee: Employee,
  _year: number,
  audit: AdjustedSalaryAudit,
): Promise<{ updated: ResyncUpdatedRow }> {
  if (audit.resyncTo == null) {
    throw new Error("resyncTo 가 null 인 상태로 호출되었습니다 — skip 체크 누락.");
  }
  const newAnnual = Math.max(0, Math.round(audit.resyncTo));
  await employeeUpdate(employee.id, tenantId, { adjustedSalary: newAnnual });
  return {
    updated: {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      before: audit.surveyAdjustedAnnual,
      after: newAnnual,
      diff: newAnnual - audit.surveyAdjustedAnnual,
    },
  };
}

/**
 * 단일 직원의 조정연봉을 "실제 월별 누적" 으로 동기화한다.
 *
 * - 월별 `adjustedSalaryOverrideAmount` 는 **유지** — 기존 분배(이미 지급된 월 포함)를 훼손하지 않는다.
 * - `Employee.adjustedSalary` = Σ(월별 effective adjusted). 이후 조사표에 노출되는 값이 실제와 일치한다.
 */
export async function resyncEmployeeAdjustedSalaryAction(
  employeeId: string,
): Promise<ResyncActionResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) {
    return { ok: false, 오류: "직원 정보를 수정할 권한이 없습니다." };
  }

  const id = String(employeeId ?? "").trim();
  if (!id) return { ok: false, 오류: "직원 ID 가 없습니다." };

  try {
    const employee = await employeeFindFirst(id, ctx.tenantId);
    if (!employee) return { ok: false, 오류: "직원을 찾을 수 없습니다." };

    const settings = await companySettingsByTenant(ctx.tenantId);
    const year = settings?.activeYear ?? new Date().getFullYear();
    const notes = await monthlyNoteListByEmployeeYear(id, year);
    const audit = computeAdjustedSalaryAudit(employee, year, notes);
    const skipReason = skipReasonOf(audit);
    if (skipReason) {
      return {
        ok: true,
        updated: [],
        skipped: [{ employeeId: id, reason: skipReason }],
        message: skipReason,
      };
    }

    const { updated } = await resyncOne(ctx.tenantId, employee, year, audit);

    await writeAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      action: "UPSERT",
      entity: "EmployeeAdjustedSalaryResync",
      entityId: id,
      payload: {
        year,
        before: updated.before,
        after: updated.after,
        diff: updated.diff,
        overrideMonths: audit.overrideMonths,
      },
    });

    revalidateEmployeeArtifacts({ detailPath: `/dashboard/employees/${id}` });

    return { ok: true, updated: [updated], skipped: [] };
  } catch (e) {
    logPbClientError("resyncEmployeeAdjustedSalaryAction", e);
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { ok: false, 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}` };
    }
    return { ok: false, 오류: "재동기화에 실패했습니다." };
  }
}

/**
 * 테넌트 전체에 대해 일괄 동기화. 중도 변동이 있는 직원만 대상.
 *
 * - skip 사유가 있는 직원은 skipped 목록에 남긴다(UI 에서 원인을 확인 가능).
 * - 중간 실패 시 이미 쓴 건은 roll back 하지 않고, 에러와 함께 일부 반영 사실을 알린다.
 */
export async function resyncAllAdjustedSalariesAction(): Promise<ResyncActionResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) {
    return { ok: false, 오류: "직원 정보를 수정할 권한이 없습니다." };
  }

  try {
    const employees = await employeeListByTenantCodeAsc(ctx.tenantId);
    const settings = await companySettingsByTenant(ctx.tenantId);
    const year = settings?.activeYear ?? new Date().getFullYear();
    const ids = employees.map((e) => e.id);
    const notes = await monthlyNoteListByTenantYear(ctx.tenantId, year, ids);

    const audits = computeAdjustedSalaryAuditList(employees, year, notes);
    const targets = listMismatchedEmployees(audits);

    const updated: ResyncUpdatedRow[] = [];
    const skipped: Array<{ employeeId: string; reason: string }> = [];

    for (const a of audits) {
      const skipReason = skipReasonOf(a);
      if (skipReason) {
        /** 전체 목록이 아닌, "대상이 될 만했던" 직원만 skipped 에 담아 UX 를 단순히 유지. */
        if (a.overrideMonths.length > 0) skipped.push({ employeeId: a.employeeId, reason: skipReason });
        continue;
      }
    }

    let completed = 0;
    try {
      for (const a of targets) {
        const emp = employees.find((e) => e.id === a.employeeId);
        if (!emp) {
          skipped.push({ employeeId: a.employeeId, reason: "직원 레코드를 찾지 못했습니다." });
          continue;
        }
        const skipReason = skipReasonOf(a);
        if (skipReason) {
          skipped.push({ employeeId: a.employeeId, reason: skipReason });
          continue;
        }
        const { updated: row } = await resyncOne(ctx.tenantId, emp, year, a);
        updated.push(row);
        completed++;
      }
    } catch (e) {
      logPbClientError("resyncAllAdjustedSalariesAction.loop", e);
      const partial = completed > 0 ? ` (일부 ${completed}건은 이미 반영됨)` : "";
      if (e instanceof ClientResponseError) {
        const detail = pocketBaseRecordErrorMessage(e);
        return { ok: false, 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}${partial}` };
      }
      return { ok: false, 오류: `일괄 재동기화 중 실패했습니다.${partial}` };
    }

    if (updated.length > 0) {
      await writeAudit({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        action: "UPSERT",
        entity: "EmployeeAdjustedSalaryResyncBulk",
        entityId: `${year}:${updated.length}`,
        payload: {
          year,
          updatedEmployeeIds: updated.map((u) => u.employeeId),
          totalDiff: updated.reduce((s, u) => s + u.diff, 0),
        },
      });

      revalidateEmployeeArtifacts();
    }

    return { ok: true, updated, skipped };
  } catch (e) {
    logPbClientError("resyncAllAdjustedSalariesAction", e);
    if (e instanceof ClientResponseError) {
      const detail = pocketBaseRecordErrorMessage(e);
      return { ok: false, 오류: `${detail}${pocketBaseNonemptyBlankHint(detail)}` };
    }
    return { ok: false, 오류: "일괄 재동기화에 실패했습니다." };
  }
}
