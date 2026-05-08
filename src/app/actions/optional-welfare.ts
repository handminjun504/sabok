"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { canEditCompanySettings } from "@/lib/permissions";
import { monthlyNoteUpsertOptionalExtra } from "@/lib/pb/repository";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";
import {
  diffAgainstInitial,
  pickActiveYearFromForm,
  pickInitialFromForm,
  pickOptionalCellsFromForm,
} from "@/lib/domain/optional-welfare-grid";

export type OptionalWelfareGridState = { 오류?: string; 성공?: boolean; 변경?: number } | null;

/**
 * 「선택적 복지」 그리드 일괄 저장 — 손댄 셀만 노트(`MonthlyEmployeeNote.optionalExtraAmount`) 부분 업데이트.
 *
 * - 노트의 다른 필드(메모/인센/오버라이드 등)는 절대 건드리지 않는다.
 * - 0 입력은 「해제(null)」, > 0 은 정수 원 단위로 저장.
 * - 변경된 셀이 없으면 PB 호출 없이 성공 반환.
 */
export async function saveOptionalWelfareGridAction(
  _: OptionalWelfareGridState,
  formData: FormData,
): Promise<OptionalWelfareGridState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) {
    return { 오류: "선택적 복지 월별 금액을 수정할 권한이 없습니다." };
  }

  const year = pickActiveYearFromForm(formData);
  if (year == null) {
    return { 오류: "기준 연도가 누락되었거나 잘못되었습니다 (activeYear)." };
  }

  const current = pickOptionalCellsFromForm(formData);
  const initial = pickInitialFromForm(formData);
  const { changed } = diffAgainstInitial(current, initial);

  if (changed.length === 0) {
    return { 성공: true, 변경: 0 };
  }

  try {
    /**
     * 직렬 처리 — PB 가 자체 트랜잭션을 제공하지 않으므로 셀 단위로 순차 upsert.
     * 100 개 미만 셀 정도면 충분히 빠르고, 부분 실패 시에도 어떤 셀에서 막혔는지 audit 에서 추적 가능하다.
     */
    for (const cell of changed) {
      await monthlyNoteUpsertOptionalExtra({
        employeeId: cell.employeeId,
        year,
        month: cell.month,
        amount: cell.amount > 0 ? cell.amount : null,
      });
    }
  } catch (e) {
    console.error("[saveOptionalWelfareGridAction]", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      오류: `${detail} · sabok_monthly_employee_notes 의 optionalExtraAmount(number) 컬럼을 확인하세요.`,
    };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "MonthlyEmployeeNotes.OptionalWelfareGrid",
    entityId: `${ctx.tenantId}:${year}`,
    payload: {
      year,
      changedCells: changed.length,
      sampleEmployeeIds: changed.slice(0, 5).map((c) => c.employeeId),
    },
  });

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  return { 성공: true, 변경: changed.length };
}
