import { redirect } from "next/navigation";
import type { Role } from "@/lib/role";
import { canAccessAnyTenant, getSession, type SessionPayload } from "./session";
import {
  tenantFindFirstActive,
  userTenantFind,
} from "@/lib/pb/repository";

export type TenantContext = {
  session: SessionPayload;
  tenantId: string;
  /** 활성 업체에서의 실효 역할 */
  role: Role;
};

/**
 * 데이터 영역 접근: 활성 테넌트 필수, 멤버십 또는 전 업체 접근 권한.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeTenantId) {
    redirect("/dashboard/select-tenant");
  }
  const tenantId = session.activeTenantId;

  const tenant = await tenantFindFirstActive(tenantId);
  if (!tenant) {
    redirect("/dashboard/select-tenant");
  }

  if (canAccessAnyTenant(session)) {
    return { session, tenantId, role: session.role };
  }

  const ut = await userTenantFind(session.sub, tenantId);
  if (!ut) {
    redirect("/dashboard/select-tenant");
  }

  return { session, tenantId, role: ut.role };
}

export function canManageTenants(session: SessionPayload): boolean {
  return session.isPlatformAdmin;
}

/**
 * Server Action / API Route 모두에서 쓰는 단일 테넌트 해석 결과.
 * `status` 는 HTTP 의미를 그대로 따른다: 401 미인증, 400 입력 누락, 403 권한 없음.
 */
export type CallerTenant =
  | {
      ok: true;
      session: SessionPayload;
      tenantId: string;
      role: Role;
      userId: string;
    }
  | { ok: false; status: 401 | 400 | 403; message: string };

/**
 * 단일 진입점.
 * `resolveActionTenant` / `requireApiCallerTenant` 가 모두 이 함수를 호출하며,
 * “세션 + 활성 테넌트 + 멤버십(또는 전체 접근 권한)” 검증 로직이 한 곳에만 산다.
 */
export async function resolveCallerTenant(): Promise<CallerTenant> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (!session.activeTenantId) {
    return { ok: false, status: 400, message: "업체를 먼저 선택하세요." };
  }
  const tenantId = session.activeTenantId;

  const tenant = await tenantFindFirstActive(tenantId);
  if (!tenant) return { ok: false, status: 400, message: "유효하지 않은 업체입니다." };

  if (canAccessAnyTenant(session)) {
    return { ok: true, session, tenantId, role: session.role, userId: session.sub };
  }

  const ut = await userTenantFind(session.sub, tenantId);
  if (!ut) return { ok: false, status: 403, message: "이 업체에 대한 권한이 없습니다." };

  return { ok: true, session, tenantId, role: ut.role, userId: session.sub };
}

export type ActionTenant =
  | { ok: true; tenantId: string; role: Role; userId: string }
  | { ok: false; message: string };

/** 서버 액션용: 리다이렉트 없이 테넌트·역할 결정 */
export async function resolveActionTenant(): Promise<ActionTenant> {
  const r = await resolveCallerTenant();
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, tenantId: r.tenantId, role: r.role, userId: r.userId };
}
