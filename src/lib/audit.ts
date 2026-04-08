import { prisma } from "./prisma";

export async function writeAudit(input: {
  userId?: string | null;
  tenantId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        tenantId: input.tenantId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        payload: input.payload === undefined ? undefined : (input.payload as object),
      },
    });
  } catch (e) {
    console.error("[감사로그] 기록 실패", e);
  }
}
