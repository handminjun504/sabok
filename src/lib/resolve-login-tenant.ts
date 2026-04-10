import type { UserWithTenants } from "@/types/models";
import type { Tenant } from "@/types/models";
import { Role, parseRole } from "@/lib/role";
import { singleTenantIdFromEnv } from "@/lib/single-tenant";

export type LoginTenantResult =
  | { ok: true; activeTenantId: string | null; effectiveRole: Role }
  | { ok: false; status: 403 | 500; message: string };

/**
 * 로그인 직후 활성 업체·역할 결정. 단일 업체 모드면 env 기준으로 고정.
 */
export function resolveLoginTenantState(
  user: UserWithTenants,
  singleTenant: Tenant | null
): LoginTenantResult {
  const sid = singleTenantIdFromEnv();

  if (sid) {
    if (!singleTenant || singleTenant.id !== sid || !singleTenant.active) {
      return {
        ok: false,
        status: 500,
        message:
          "SABOK_SINGLE_TENANT_ID 가 잘못되었거나 해당 업체가 없거나 비활성입니다. .env 와 PocketBase sabok_tenants 를 확인하세요.",
      };
    }
    if (user.isPlatformAdmin) {
      return { ok: true, activeTenantId: sid, effectiveRole: Role.ADMIN };
    }
    if (user.accessAllTenants) {
      return { ok: true, activeTenantId: sid, effectiveRole: parseRole(user.role) };
    }
    const ut = user.userTenants.find((x) => x.tenantId === sid);
    if (ut) {
      return { ok: true, activeTenantId: sid, effectiveRole: parseRole(ut.role) };
    }
    if (user.userTenants.length === 0) {
      return { ok: true, activeTenantId: sid, effectiveRole: parseRole(user.role) };
    }
    return {
      ok: false,
      status: 403,
      message:
        "이 계정은 단일 업체(SABOK_SINGLE_TENANT_ID)에 연결되어 있지 않습니다. sabok_user_tenants 를 확인하세요.",
    };
  }

  const isPlatformAdmin = user.isPlatformAdmin;
  const accessAllTenants = user.accessAllTenants;

  if (isPlatformAdmin) {
    return { ok: true, activeTenantId: null, effectiveRole: Role.ADMIN };
  }
  if (accessAllTenants) {
    return { ok: true, activeTenantId: null, effectiveRole: parseRole(user.role) };
  }
  if (user.userTenants.length === 1) {
    return {
      ok: true,
      activeTenantId: user.userTenants[0].tenantId,
      effectiveRole: parseRole(user.userTenants[0].role),
    };
  }
  if (user.userTenants.length > 1) {
    return {
      ok: true,
      activeTenantId: null,
      effectiveRole: parseRole(user.userTenants[0].role),
    };
  }
  return {
    ok: false,
    status: 403,
    message:
      "접근 가능한 업체가 없습니다. 전 업체 접근 권한(accessAllTenants) 또는 플랫폼 관리자에게 문의하세요.",
  };
}
