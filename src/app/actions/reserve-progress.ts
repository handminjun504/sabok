"use server";

import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { companySettingsUpdateReserveProgressNote } from "@/lib/pb/repository";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { canEditCompanySettings } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";
import { revalidateScheduleArtifacts } from "@/lib/util/revalidate";

const noteSchema = z.string().max(5000, "메모는 5,000자 이하여야 합니다.").nullable();

export type ReserveNoteState = { 오류?: string; 성공?: boolean } | null;

export async function saveReserveProgressNoteAction(_: ReserveNoteState, formData: FormData): Promise<ReserveNoteState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "적립금 메모를 수정할 권한이 없습니다." };

  const raw = formData.get("reserveProgressNote");
  const noteCandidate = raw == null ? null : String(raw);
  const parsed = noteSchema.safeParse(noteCandidate);
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }
  const note = parsed.data;

  try {
    await companySettingsUpdateReserveProgressNote(ctx.tenantId, note);
  } catch (e) {
    console.error("[saveReserveProgressNoteAction]", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    const hint =
      /unknown|reserveprogressnote|not found|column/i.test(detail)
        ? " PocketBase `sabok_company_settings` 에 text 필드 `reserveProgressNote`(선택)를 추가하세요. docs/pb-collections.md 참고."
        : "";
    return { 오류: `${detail}${hint}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "CompanySettings",
    entityId: ctx.tenantId,
    payload: { reserveProgressNote: note?.trim() || null },
  });
  revalidateScheduleArtifacts();
  return { 성공: true };
}
