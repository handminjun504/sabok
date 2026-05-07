"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { tenantUpdateReserveMonthlyForYear } from "@/lib/pb/repository";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

export type TenantReserveState = { 오류?: string; 성공?: boolean } | null;

const schema = z.object({
  year: z.number().int().min(1900).max(9999),
  monthly: z
    .array(z.number().nonnegative({ message: "적립금은 0 이상의 숫자로 입력하세요." }))
    .length(12),
});

/**
 * 활성 연도 1년치 적립금 월액(1~12) 갱신.
 * 다른 연도 키는 보존되며, 호환 단일 필드(`accumulatedReserveTotalWon`)는 건드리지 않는다.
 */
export async function updateTenantReserveMonthlyAction(
  _: TenantReserveState,
  formData: FormData,
): Promise<TenantReserveState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };

  const yearRaw = String(formData.get("year") ?? "").trim();
  const yearNum = Number(yearRaw);
  const monthly: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const raw = String(formData.get(`m${m}`) ?? "")
      .replace(/,/g, "")
      .trim();
    if (raw === "") {
      monthly.push(0);
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return { 오류: `${m}월 적립금이 올바른 숫자가 아닙니다.` };
    }
    monthly.push(n);
  }

  const parsed = schema.safeParse({ year: yearNum, monthly });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  try {
    await tenantUpdateReserveMonthlyForYear(
      ctx.tenantId,
      parsed.data.year,
      parsed.data.monthly.map((n) => Math.round(n)),
    );
  } catch (e) {
    console.error("[updateTenantReserveMonthlyAction]", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      오류: `${detail} · sabok_tenants 에 reserveMonthlyByYearJson(JSON 타입) 컬럼을 추가해 주세요.`,
    };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "TenantReserveMonthly",
    entityId: ctx.tenantId,
    payload: { year: parsed.data.year, sum: parsed.data.monthly.reduce((s, v) => s + v, 0) },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/schedule");
  return { 성공: true };
}
