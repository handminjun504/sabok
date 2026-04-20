import { auditLogCreate } from "@/lib/pb/repository";

export type AuditInput = {
  userId?: string | null;
  tenantId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: unknown;
};

/**
 * 감사 로그를 한 번만 더 시도(짧은 백오프)한 뒤, 실패 시 표준 에러 채널 + 표준 출력에 모두 남긴다.
 * 컴플라이언스 요구가 강해지면 여기서 외부 알림(Sentry/Slack 등)을 트리거한다.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await auditLogCreate({
        userId: input.userId ?? undefined,
        tenantId: input.tenantId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        payload: input.payload,
      });
      return;
    } catch (e) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        continue;
      }
      const meta = {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
      };
      console.error("[감사로그/실패]", meta, e);
      /** stdout 에도 한 줄 남겨 PM2/Caddy 로그 수집기에서 별도 grep 가능. */
      process.stdout.write(`AUDIT_FAILURE ${JSON.stringify(meta)}\n`);
    }
  }
}
