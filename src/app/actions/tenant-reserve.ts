"use server";

import { revalidatePath } from "next/cache";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { tenantUpdateReserveBalance } from "@/lib/pb/repository";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";

export type TenantReserveState = { 오류?: string; 성공?: boolean } | null;

const schema = z.object({
  /** 통장 잔고(원). null = 잔고 미입력으로 초기화. */
  balanceWon: z
    .number({ invalid_type_error: "잔고가 올바른 숫자가 아닙니다." })
    .int("잔고는 정수(원)로 입력하세요.")
    .nonnegative("잔고는 0 이상이어야 합니다.")
    .nullable(),
  /** 기준월 `YYYY-MM`. null = 표시 라벨 없음. */
  asOfYearMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "기준월 형식은 YYYY-MM 이어야 합니다.")
    .nullable(),
});

/** 콤마/공백 제거 후 숫자 파싱. 빈 문자열 → null, 비숫자 → undefined(=오류). */
function pickBalance(formData: FormData): number | null | undefined {
  const raw = String(formData.get("balanceWon") ?? "").replace(/,/g, "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.round(n));
}

/** `year` + `month` 두 칸 → `YYYY-MM` 합성. 둘 다 비면 null. */
function pickAsOf(formData: FormData): string | null | undefined {
  const yearRaw = String(formData.get("balanceYear") ?? "").trim();
  const monthRaw = String(formData.get("balanceMonth") ?? "").trim();
  if (yearRaw === "" && monthRaw === "") return null;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || year < 1900 || year > 9999) return undefined;
  if (!Number.isFinite(month) || month < 1 || month > 12) return undefined;
  return `${String(Math.round(year)).padStart(4, "0")}-${String(Math.round(month)).padStart(2, "0")}`;
}

/**
 * 「현재 통장 잔고」 + 기준월 갱신.
 * 구버전 월별 입력(`reserveMonthlyByYearJson`) · 호환 단일값(`accumulatedReserveTotalWon`) 은 건드리지 않는다 — 잔고가 우선이므로 불필요.
 */
export async function updateTenantReserveBalanceAction(
  _: TenantReserveState,
  formData: FormData,
): Promise<TenantReserveState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };

  const balanceWon = pickBalance(formData);
  if (balanceWon === undefined) {
    return { 오류: "잔고가 올바른 숫자가 아닙니다." };
  }
  const asOfYearMonth = pickAsOf(formData);
  if (asOfYearMonth === undefined) {
    return { 오류: "기준 연·월을 올바르게 선택하세요." };
  }

  const parsed = schema.safeParse({ balanceWon, asOfYearMonth });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  try {
    await tenantUpdateReserveBalance(ctx.tenantId, {
      balanceWon: parsed.data.balanceWon,
      asOfYearMonth: parsed.data.asOfYearMonth,
    });
  } catch (e) {
    console.error("[updateTenantReserveBalanceAction]", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      오류: `${detail} · sabok_tenants 에 reserveBalanceWon(number) / reserveBalanceAsOfYearMonth(text) 컬럼을 추가하세요. (\`npm run pb:ensure-tenants-schema\`)`,
    };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "TenantReserveBalance",
    entityId: ctx.tenantId,
    payload: {
      balanceWon: parsed.data.balanceWon,
      asOfYearMonth: parsed.data.asOfYearMonth,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/schedule");
  return { 성공: true };
}
