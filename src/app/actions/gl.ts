"use server";

import { revalidatePath } from "next/cache";
import { canTriggerGlSync } from "@/lib/permissions";
import { enqueueGlSyncJob } from "@/lib/gl-sync";
import { prisma } from "@/lib/prisma";
import { resolveActionTenant } from "@/lib/tenant-context";

export type GlState = { 오류?: string; 메시지?: string; 작업Id?: string } | null;

export async function requestGlSyncFormAction(formData: FormData): Promise<void> {
  await requestGlSyncAction(null, formData);
}

export async function requestGlSyncAction(_: GlState, formData: FormData): Promise<GlState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canTriggerGlSync(ctx.role)) return { 오류: "GL 동기화 권한이 없습니다." };

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const monthRaw = formData.get("month");
  const month =
    monthRaw == null || monthRaw === ""
      ? undefined
      : parseInt(String(monthRaw), 10);

  if (!Number.isFinite(year)) return { 오류: "연도가 올바르지 않습니다." };

  const [employees, tenant] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: ctx.tenantId },
      select: { employeeCode: true },
    }),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId } }),
  ]);

  if (!tenant) return { 오류: "업체 정보를 찾을 수 없습니다." };

  const res = await enqueueGlSyncJob({
    tenantId: ctx.tenantId,
    고객사코드: tenant.code,
    고객사명: tenant.name,
    기준연도: year,
    기준월: month,
    직원코드목록: employees.map((e) => e.employeeCode),
  });

  if (!res.성공) return { 오류: res.메시지 };

  revalidatePath("/dashboard/gl");
  return { 메시지: res.메시지, 작업Id: res.작업Id };
}
