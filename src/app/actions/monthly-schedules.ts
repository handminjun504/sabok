"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { companySettingsUpdateMonthlySchedules } from "@/lib/pb/repository";
import { canEditCompanySettings } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

export type MonthlySchedulesState = { 오류?: string; 성공?: boolean } | null;

type Schedule = Record<string, Partial<Record<string, number>>>;

/**
 * 폼에서 `${prefix}_${employeeId}_${month}` (1~12) 입력을 모아 한 맵으로 정규화.
 * 0 / 빈값 / 음수 / 비유한수는 키를 만들지 않는다(=PB JSON 에서 자리 차지하지 않음).
 */
function pickScheduleFromForm(formData: FormData, prefix: string): Schedule {
  const out: Schedule = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith(`${prefix}_`)) continue;
    const parts = name.split("_");
    if (parts.length !== 3) continue;
    const empId = parts[1];
    const monthStr = parts[2];
    const mNum = parseInt(monthStr, 10);
    if (!empId || !Number.isFinite(mNum) || mNum < 1 || mNum > 12) continue;
    const raw = String(value).replace(/,/g, "").trim();
    if (!raw) continue;
    const amt = Math.round(Number(raw));
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (!out[empId]) out[empId] = {};
    out[empId][monthStr] = amt;
  }
  return out;
}

function emptyToNull(s: Schedule): Schedule | null {
  return Object.keys(s).length ? s : null;
}

/**
 * 「대표반환·배우자수령·알아서금액」 월별 금액 일괄 저장.
 * - 한 번의 폼 제출로 세 맵을 모두 저장 → 한 트랜잭션으로 동기화.
 * - 다른 회사 설정 필드는 건드리지 않는 partial update.
 * - 입력 name 형식: `repReturn_${id}_${month}` / `spouseReceipt_${id}_${month}` / `discretionary_${id}_${month}`.
 */
export async function saveMonthlySchedulesAction(
  _: MonthlySchedulesState,
  formData: FormData,
): Promise<MonthlySchedulesState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) {
    return { 오류: "대표반환·배우자수령·알아서금액 월별 금액을 수정할 권한이 없습니다." };
  }

  const repReturnSchedule = emptyToNull(pickScheduleFromForm(formData, "repReturn"));
  const spouseReceiptSchedule = emptyToNull(pickScheduleFromForm(formData, "spouseReceipt"));
  const discretionarySchedule = emptyToNull(pickScheduleFromForm(formData, "discretionary"));

  try {
    await companySettingsUpdateMonthlySchedules(ctx.tenantId, {
      repReturnSchedule,
      spouseReceiptSchedule,
      discretionarySchedule,
    });
  } catch (e) {
    console.error("[saveMonthlySchedulesAction]", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      오류:
        `${detail} · sabok_company_settings 에 ` +
        `repReturnSchedule / spouseReceiptSchedule / discretionarySchedule (json) 필드를 추가해 주세요. ` +
        `'npm run pb:ensure-company-settings-schema' 로 일괄 보정 가능합니다.`,
    };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "CompanySettingsMonthlySchedules",
    entityId: ctx.tenantId,
    payload: {
      repReturnEmployeeCount: Object.keys(repReturnSchedule ?? {}).length,
      spouseReceiptEmployeeCount: Object.keys(spouseReceiptSchedule ?? {}).length,
      discretionaryEmployeeCount: Object.keys(discretionarySchedule ?? {}).length,
    },
  });

  /**
   * 직원 명부·운영보고서·급여포함신고에는 영향이 없지만, 스케줄·설정 화면이 즉시 새 값으로 다시 그려지도록
   * 두 경로만 revalidate. 타 화면 캐시는 그대로 둔다.
   */
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/settings");
  return { 성공: true };
}
