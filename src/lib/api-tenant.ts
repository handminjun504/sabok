import { NextResponse } from "next/server";
import type { Role } from "@/lib/role";
import type { SessionPayload } from "@/lib/session";
import { resolveCallerTenant } from "@/lib/tenant-context";

export type ApiCallerTenant =
  | {
      ok: true;
      session: SessionPayload;
      tenantId: string;
      role: Role;
      userId: string;
    }
  | { ok: false; response: NextResponse };

/**
 * Route Handler 용 래퍼.
 * 동일한 권한·테넌트 검증 로직(`resolveCallerTenant`)을 사용하면서, 실패 시 NextResponse 로 변환한다.
 * Server Action 의 `resolveActionTenant` 와 짝을 이룬다.
 */
export async function requireApiCallerTenant(): Promise<ApiCallerTenant> {
  const r = await resolveCallerTenant();
  if (!r.ok) {
    return {
      ok: false,
      response: NextResponse.json({ 오류: r.message }, { status: r.status }),
    };
  }
  return {
    ok: true,
    session: r.session,
    tenantId: r.tenantId,
    role: r.role,
    userId: r.userId,
  };
}
