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

export type ActionTenant =
  | { ok: true; tenantId: string; role: Role; userId: string }
  | { ok: false; message: string };

/** 서버 액션용: 리다이렉트 없이 테넌트·역할 결정 */
export async function resolveActionTenant(): Promise<ActionTenant> {
  const session = await getSession();
  if (!session) return { ok: false, message: "로그인이 필요합니다." };
  if (!session.activeTenantId) return { ok: false, message: "업체를 먼저 선택하세요." };
  const tenantId = session.activeTenantId;

  const tenant = await tenantFindFirstActive(tenantId);
  if (!tenant) return { ok: false, message: "유효하지 않은 업체입니다." };

  if (canAccessAnyTenant(session)) {
    return { ok: true, tenantId, role: session.role, userId: session.sub };
  }

  const ut = await userTenantFind(session.sub, tenantId);
  if (!ut) return { ok: false, message: "이 업체에 대한 권한이 없습니다." };

  return { ok: true, tenantId, role: ut.role, userId: session.sub };
}
