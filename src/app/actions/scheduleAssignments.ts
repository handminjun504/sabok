"use server";

import { z } from "zod";
import { employeeFindFirst, employeeUpdate } from "@/lib/pb/repository";
import { canEditEmployees } from "@/lib/permissions";
import { resolveActionTenant } from "@/lib/tenant-context";
import { writeAudit } from "@/lib/audit";
import { revalidateEmployeeArtifacts } from "@/lib/util/revalidate";

const rowSchema = z.object({
  employeeId: z.string().min(1),
  level: z.number().int().min(1).max(5),
  expectedYearlyWelfare: z.union([z.number(), z.null()]),
});

export type ScheduleAssignmentsState = { 오류?: string; 성공?: boolean } | null;

export async function bulkSaveScheduleAssignmentsAction(
  rows: { employeeId: string; level: number; expectedYearlyWelfare: number | null }[]
): Promise<ScheduleAssignmentsState> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { 오류: ctx.message };
  if (!canEditEmployees(ctx.role)) return { 오류: "직원 정보를 수정할 권한이 없습니다." };

  const parsed: z.infer<typeof rowSchema>[] = [];
  for (const raw of rows) {
    const p = rowSchema.safeParse(raw);
    if (!p.success) {
      return { 오류: "입력값이 올바르지 않습니다." };
    }
    parsed.push(p.data);
  }

  /**
   * 클라이언트가 다른 업체 직원 ID 를 끼워 넣어도 일부 행만 조용히 건너뛰지 않도록,
   * 적용 전에 모든 행이 현재 업체 소속인지 먼저 검증한다.
   */
  const targets: { id: string; level: number; expectedYearlyWelfare: number | null }[] = [];
  for (const r of parsed) {
    const emp = await employeeFindFirst(r.employeeId, ctx.tenantId);
    if (!emp) {
      return { 오류: `직원(id=${r.employeeId}) 을 현재 업체에서 찾을 수 없어 일괄 저장을 중단했습니다.` };
    }
    targets.push({ id: emp.id, level: r.level, expectedYearlyWelfare: r.expectedYearlyWelfare });
  }

  try {
    for (const t of targets) {
      await employeeUpdate(t.id, ctx.tenantId, {
        level: t.level,
        expectedYearlyWelfare: t.expectedYearlyWelfare,
      });
    }
  } catch (e) {
    console.error(e);
    return {
      오류:
        "저장에 실패했습니다. PocketBase에 직원 필드 `expectedYearlyWelfare`(number, 선택)이 있는지 확인하세요.",
    };
  }

  await writeAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "Employee",
    entityId: "bulk-schedule-assignments",
    payload: { count: parsed.length },
  });

  revalidateEmployeeArtifacts();
  return { 성공: true };
}
