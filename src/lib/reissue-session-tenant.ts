import { userLoadWithTenantsByEmail } from "@/lib/pb/repository";
import { tenantFindFirstActive } from "@/lib/pb/repository";
import { resolveLoginTenantState } from "@/lib/resolve-login-tenant";
import { singleTenantIdFromEnv } from "@/lib/single-tenant";
import { createSessionToken, getSession, setSessionCookie } from "@/lib/session";

const WEEK = 60 * 60 * 24 * 7;

/** 단일 업체 모드에서 세션에 activeTenantId 가 없을 때 쿠키를 다시 발급한다. */
export async function reissueSessionForSingleTenantMode(): Promise<boolean> {
  const sid = singleTenantIdFromEnv();
  if (!sid) return false;

  const session = await getSession();
  if (!session || session.activeTenantId) return false;

  const user = await userLoadWithTenantsByEmail(session.email);
  if (!user) return false;

  const tenant = await tenantFindFirstActive(sid);
  const r = resolveLoginTenantState(user, tenant);
  if (!r.ok) return false;

  const { token } = await createSessionToken(
    {
      sub: session.sub,
      email: session.email,
      name: session.name,
      role: r.effectiveRole,
      isPlatformAdmin: session.isPlatformAdmin,
      accessAllTenants: session.accessAllTenants,
      activeTenantId: r.activeTenantId,
    },
    WEEK
  );
  await setSessionCookie(token, WEEK);
  return true;
}
