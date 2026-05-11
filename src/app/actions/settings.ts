"use server";

import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { companySettingsUpsert } from "@/lib/pb/repository";
import { pocketBaseRecordErrorMessage } from "@/lib/pb/client-error-log";
import { canEditCompanySettings } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveActionTenant } from "@/lib/tenant-context";
import { revalidateSettingsArtifacts } from "@/lib/util/revalidate";

const schema = z.object({
  foundingMonth: z.coerce.number().min(1).max(12),
  defaultPayDay: z.coerce.number().min(1).max(31),
  activeYear: z.coerce.number().min(2000).max(2100),
  salaryInclusionVarianceMode: z.enum(["BOTH", "OVER_ONLY", "UNDER_ONLY"]),
  surveyShowRepReturn: z.boolean(),
  surveyShowSpouseReceipt: z.boolean(),
  surveyShowWorkerNet: z.boolean(),
  /**
   * 내장 정기 4종(NEW_YEAR_FEB / FAMILY_MAY / CHUSEOK_AUG / YEAR_END_NOV) 의 귀속 월 오버라이드.
   * 비어 있는 값(`""`) 은 “기본값 사용”으로 간주.
   */
  fixedEventMonths: z
    .object({
      NEW_YEAR_FEB: z.coerce.number().int().min(1).max(12).optional(),
      FAMILY_MAY: z.coerce.number().int().min(1).max(12).optional(),
      CHUSEOK_AUG: z.coerce.number().int().min(1).max(12).optional(),
      YEAR_END_NOV: z.coerce.number().int().min(1).max(12).optional(),
    })
    .nullable(),
  quarterlyPayMonths: z
    .record(z.string(), z.array(z.number().int().min(1).max(12)))
    .nullable(),
  /**
   * 월별 발생 인센 자동 변환 비율(세후 비율, %). 빈값/0/100 초과/유한수 아님 → null(변환 비활성).
   * 폼에서 비워 두면 null 로 저장되어 그리드는 사용자가 적은 값을 그대로 보존한다.
   */
  incentiveNetRatioPercent: z.number().int().min(1).max(100).nullable(),
  /** 사복 운영 수수료 요율(%) — 0.1~100. null 이면 거래처 디폴트로 폴백. */
  feeRatePercent: z.number().min(0.1).max(100).nullable(),
  /**
   * 수수료 청구 방식 — 운영자 폼은 EVEN_12 / ON_PAY_MONTH 둘 중 하나만 선택 가능(=수수료 B 정책).
   * `YEAR_END_LUMP` 는 코드에서 수수료 A 에 강제 적용되는 정책이라 폼에는 노출되지 않으나,
   * 안전을 위해 enum 에 포함시켜 PB 직접 기록 등 외부 경로에서 들어와도 거부되지 않도록 둔다.
   */
  feeBillingMode: z.enum(["EVEN_12", "ON_PAY_MONTH", "YEAR_END_LUMP"]),
  /**
   * 「수수료 변경점」 배열. 빈 배열이면 단일 요율 사용. fromMonth 는 2~12 만 허용 —
   * 1월 항목은 폼이 별도로 보내지 않고 도메인에서 `feeRatePercent` 또는 디폴트로 자동 채워진다.
   */
  feeRateBreakpoints: z
    .array(
      z.object({
        fromMonth: z.number().int().min(2).max(12),
        ratePercent: z.number().min(0.1).max(100),
      }),
    )
    .nullable(),
});

const QUARTERLY_ITEM_KEYS = [
  "INFANT_SCHOLARSHIP",
  "PRESCHOOL_SCHOLARSHIP",
  "TEEN_SCHOLARSHIP",
  "PARENT_SUPPORT",
  "HEALTH_INSURANCE",
  "HOUSING_INTEREST",
  "HOUSING_RENT",
] as const;

/** 폼에서 항목별 지급 월 체크박스를 읽어 정규화. 기본값([3,6,9,12])과 동일하면 저장 생략. */
function pickQuarterlyPayMonths(formData: FormData): Record<string, number[]> | null {
  const DEFAULT = [3, 6, 9, 12];
  const out: Record<string, number[]> = {};
  for (const k of QUARTERLY_ITEM_KEYS) {
    const raw = formData.getAll(`quarterlyPayMonth_${k}`).map((v) => {
      const n = Math.round(Number(String(v)));
      return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
    }).filter((n): n is number => n != null);
    const sorted = [...new Set(raw)].sort((a, b) => a - b);
    if (sorted.join(",") === DEFAULT.join(",")) continue;
    if (sorted.length > 0) out[k] = sorted;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * NOTE — 「대표반환·배우자수령·알아서금액·+ 반환 추가」 월별 금액 일정은
 * 이 액션이 아닌 「월별 스케줄」 페이지의 `updateCompanyMonthlySchedules*` 계열
 * partial-update 액션에서만 다룹니다. 회사 설정 폼은 해당 필드를 절대 다루지 않으며,
 * 과거에는 본 액션이 `repReturnSchedule: null` 을 강제로 동봉해 「전사 설정」 저장 한 번에
 * 다른 탭에서 입력한 대표반환 일정이 전부 날아가는 회귀가 있었습니다(2026-05).
 */

const FIXED_EVENT_DEFAULTS: Record<"NEW_YEAR_FEB" | "FAMILY_MAY" | "CHUSEOK_AUG" | "YEAR_END_NOV", number> = {
  NEW_YEAR_FEB: 2,
  FAMILY_MAY: 5,
  CHUSEOK_AUG: 8,
  YEAR_END_NOV: 11,
};

/**
 * 폼에서 4개 월 입력을 읽어 1~12 범위 정수만 살리고, 기본값과 같은 키는 굳이 저장하지 않는다(공백 = 기본값 사용).
 * 결과가 비면 null 을 돌려 PB 에 빈 객체 대신 null 을 명시적으로 저장.
 */
/**
 * 월별 발생 인센 자동 변환 비율 폼 파싱. 빈값/유효 범위 외 → null.
 * - 입력 name: `incentiveNetRatioPercent` (string, 1~100).
 */
function pickIncentiveNetRatioPercent(formData: FormData): number | null {
  const raw = formData.get("incentiveNetRatioPercent");
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const n = Math.round(Number(t));
  if (!Number.isFinite(n) || n < 1 || n > 100) return null;
  return n;
}

/** 폼에서 수수료 요율(%)을 읽어 0.1~100 범위 안의 1자리 소수까지 정규화. 빈값/범위 외 → null(거래처 디폴트). */
function pickFeeRatePercent(formData: FormData): number | null {
  const raw = formData.get("feeRatePercent");
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n * 10) / 10;
  if (r < 0.1 || r > 100) return null;
  return r;
}

function pickFeeBillingMode(formData: FormData): "EVEN_12" | "ON_PAY_MONTH" {
  const raw = String(formData.get("feeBillingMode") ?? "").trim().toUpperCase();
  return raw === "ON_PAY_MONTH" ? "ON_PAY_MONTH" : "EVEN_12";
}

/**
 * 폼에서 「수수료 변경점」(`feeRateBreakpoint_${idx}_fromMonth/ratePercent`) 행들을 모아
 * fromMonth 2~12, ratePercent 0.1~100 의 정상 값만 남기고 fromMonth 중복은 마지막 입력 유지.
 * 결과가 비면 null 을 돌려 단일 요율 모드로 폴백.
 */
function pickFeeRateBreakpoints(formData: FormData): { fromMonth: number; ratePercent: number }[] | null {
  const buckets = new Map<number, { fromMonth: number; ratePercent: number }>();
  for (const [name, value] of formData.entries()) {
    const m = name.match(/^feeRateBreakpoint_(\d+)_(fromMonth|ratePercent)$/);
    if (!m) continue;
    const idx = Number(m[1]);
    if (!Number.isFinite(idx)) continue;
    const cur = buckets.get(idx) ?? { fromMonth: 0, ratePercent: 0 };
    if (m[2] === "fromMonth") {
      cur.fromMonth = Math.round(Number(String(value).trim()));
    } else {
      const r = Number(String(value).trim());
      cur.ratePercent = Number.isFinite(r) ? Math.round(r * 10) / 10 : 0;
    }
    buckets.set(idx, cur);
  }
  if (buckets.size === 0) return null;
  const dedup = new Map<number, { fromMonth: number; ratePercent: number }>();
  for (const [, v] of [...buckets.entries()].sort(([a], [b]) => a - b)) {
    if (!Number.isFinite(v.fromMonth) || v.fromMonth < 2 || v.fromMonth > 12) continue;
    if (!Number.isFinite(v.ratePercent) || v.ratePercent < 0.1 || v.ratePercent > 100) continue;
    dedup.set(v.fromMonth, v);
  }
  if (dedup.size === 0) return null;
  return [...dedup.values()].sort((a, b) => a.fromMonth - b.fromMonth);
}

function pickFixedEventMonths(formData: FormData): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const k of Object.keys(FIXED_EVENT_DEFAULTS) as (keyof typeof FIXED_EVENT_DEFAULTS)[]) {
    const raw = String(formData.get(`fixedEventMonth_${k}`) ?? "").trim();
    if (!raw) continue;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1 || n > 12) continue;
    if (n === FIXED_EVENT_DEFAULTS[k]) continue;
    out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

export type SettingsState = { 오류?: string; 성공?: boolean } | null;

export async function saveCompanySettingsAction(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { 오류: "전사 설정을 수정할 권한이 없습니다." };

  const fixedEventMonths = pickFixedEventMonths(formData);
  const quarterlyPayMonths = pickQuarterlyPayMonths(formData);
  const parsed = schema.safeParse({
    foundingMonth: formData.get("foundingMonth"),
    defaultPayDay: formData.get("defaultPayDay"),
    activeYear: formData.get("activeYear"),
    salaryInclusionVarianceMode: formData.get("salaryInclusionVarianceMode"),
    surveyShowRepReturn: formData.get("surveyShowRepReturn") === "on",
    surveyShowSpouseReceipt: formData.get("surveyShowSpouseReceipt") === "on",
    surveyShowWorkerNet: formData.get("surveyShowWorkerNet") === "on",
    fixedEventMonths,
    quarterlyPayMonths,
    incentiveNetRatioPercent: pickIncentiveNetRatioPercent(formData),
    feeRatePercent: pickFeeRatePercent(formData),
    feeBillingMode: pickFeeBillingMode(formData),
    feeRateBreakpoints: pickFeeRateBreakpoints(formData),
  });
  if (!parsed.success) {
    return { 오류: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  try {
    await companySettingsUpsert(ctx.tenantId, parsed.data);
  } catch (e) {
    console.error("[saveCompanySettingsAction]", e);
    const detail =
      e instanceof ClientResponseError
        ? pocketBaseRecordErrorMessage(e)
        : e instanceof Error
          ? e.message
          : String(e);
    const schemaHint =
      /surveyshow|nonempty|cannot be blank|missing required/i.test(detail)
        ? " sabok_company_settings 의 bool·number에 Nonempty가 켜져 있으면 false·0이 거절됩니다. `npm run pb:fix-company-settings-schema` 실행 후 다시 저장하세요."
        : /salaryinclusionvariancemode|variance/i.test(detail)
          ? " `salaryInclusionVarianceMode` text 컬럼이 없으면 값이 저장되지 않습니다. `npm run pb:ensure-company-settings-schema` 로 필드를 추가하세요."
          : " salaryInclusionVarianceMode 값(BOTH/OVER_ONLY/UNDER_ONLY)·필드 타입·PB 훅을 확인하세요.";
    return { 오류: `${detail} ·${schemaHint}` };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "CompanySettings",
    entityId: ctx.tenantId,
    payload: parsed.data,
  });
  revalidateSettingsArtifacts();
  return { 성공: true };
}
