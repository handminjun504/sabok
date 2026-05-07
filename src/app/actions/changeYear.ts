"use server";

import { resolveActionTenant } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import {
  companySettingsByTenant,
  levelPaymentRuleList,
  levelPaymentRuleUpsert,
  levelTargetList,
  levelTargetUpsert,
  quarterlyRateList,
  quarterlyRateUpsert,
  quarterlyEmployeeConfigListByTenantYear,
  quarterlyEmployeeConfigUpsert,
  employeeListByTenantCodeAsc,
} from "@/lib/pb/repository";
import { getAdminPb } from "@/lib/pb/admin-client";
import { revalidatePath } from "next/cache";

export type ChangeYearResult =
  | { ok: true; year: number; copied: boolean }
  | { ok: false; 오류: string };

/**
 * 기준 연도 변경.
 * `copy=true` 이면 이전 기준 연도의 레벨 규칙·목표액·분기 요율·분기 대상자 설정을 새 연도로 복사한다.
 * 이미 새 연도에 데이터가 있는 항목은 덮어쓰지 않는다(upsert 는 기존 값을 유지).
 */
export async function changeActiveYearAction(
  _: ChangeYearResult | null,
  formData: FormData,
): Promise<ChangeYearResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, 오류: ctx.message };
  if (!canEditCompanySettings(ctx.role)) return { ok: false, 오류: "설정 변경 권한이 없습니다." };

  const newYearRaw = Number(formData.get("year"));
  if (!Number.isFinite(newYearRaw) || newYearRaw < 2000 || newYearRaw > 2100) {
    return { ok: false, 오류: "연도가 올바르지 않습니다." };
  }
  const newYear = Math.round(newYearRaw);
  const copy = formData.get("copy") === "on";

  const settings = await companySettingsByTenant(ctx.tenantId);
  const prevYear = settings?.activeYear ?? newYear - 1;

  if (copy && prevYear !== newYear) {
    const [rules, targets, rates, employees] = await Promise.all([
      levelPaymentRuleList(ctx.tenantId, prevYear),
      levelTargetList(ctx.tenantId, prevYear),
      quarterlyRateList(ctx.tenantId, prevYear),
      employeeListByTenantCodeAsc(ctx.tenantId),
    ]);
    const empIds = employees.map((e) => e.id);
    const prevQConfigs = empIds.length > 0
      ? await quarterlyEmployeeConfigListByTenantYear(ctx.tenantId, prevYear, empIds)
      : [];

    /* 레벨 규칙 복사 */
    for (const r of rules) {
      await levelPaymentRuleUpsert({
        tenantId: ctx.tenantId,
        year: newYear,
        level: r.level,
        eventKey: r.eventKey,
        amount: r.amount,
      });
    }
    /* 레벨 목표액 복사 */
    for (const t of targets) {
      await levelTargetUpsert({
        tenantId: ctx.tenantId,
        year: newYear,
        level: t.level,
        targetAmount: t.targetAmount,
      });
    }
    /* 분기 요율 복사 */
    for (const r of rates) {
      await quarterlyRateUpsert({
        tenantId: ctx.tenantId,
        year: newYear,
        level: r.level,
        itemKey: r.itemKey,
        amountPerInfant: r.amountPerInfant ?? undefined,
        amountPerPreschool: r.amountPerPreschool ?? undefined,
        amountPerTeen: r.amountPerTeen ?? undefined,
        amountPerParent: r.amountPerParent ?? undefined,
        amountPerInLaw: r.amountPerInLaw ?? undefined,
        flatAmount: r.flatAmount ?? undefined,
        percentInsurance: r.percentInsurance ?? undefined,
        percentLoanInterest: r.percentLoanInterest ?? undefined,
      });
    }
    /* 분기 대상자 복사 — 여전히 재직 중인 직원만 */
    const empIdSet = new Set(empIds);
    for (const c of prevQConfigs) {
      if (!empIdSet.has(c.employeeId)) continue;
      if (c.paymentMonths.length === 0) continue;
      await quarterlyEmployeeConfigUpsert({
        employeeId: c.employeeId,
        year: newYear,
        itemKey: c.itemKey,
        paymentMonths: c.paymentMonths,
        amount: c.amount,
      });
    }
  }

  /* 기준 연도 업데이트 — activeYear 만 단건 갱신 */
  const existing = await companySettingsByTenant(ctx.tenantId);
  if (!existing?.id) return { ok: false, 오류: "전사 설정이 없습니다. 설정 페이지에서 먼저 저장하세요." };
  const pb = await getAdminPb();
  await pb.collection("sabok_company_settings").update(existing.id, { activeYear: newYear });

  revalidatePath("/dashboard", "layout");
  return { ok: true, year: newYear, copied: copy };
}
