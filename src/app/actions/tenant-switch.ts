"use server";

import { redirect } from "next/navigation";
import { Role, parseRole } from "@/lib/role";
import { tenantFindFirstActive, userTenantFind } from "@/lib/pb/repository";
import { getSession, createSessionToken, setSessionCookie } from "@/lib/session";
import { isSingleTenantMode } from "@/lib/single-tenant";

export async function switchTenantFormAction(formData: FormData) {
  if (isSingleTenantMode()) redirect("/dashboard");

  const tenantId = String(formData.get("tenantId") ?? "");
  const session = await getSession();
  if (!session) redirect("/login");

  const tenant = await tenantFindFirstActive(tenantId);
  if (!tenant) redirect("/dashboard/select-tenant");

  let role: Role;
  if (session.isPlatformAdmin) {
    role = Role.ADMIN;
  } else if (session.accessAllTenants) {
    role = session.role;
  } else {
    const ut = await userTenantFind(session.sub, tenantId);
    if (!ut) redirect("/dashboard/select-tenant");
    role = parseRole(ut.role);
  }

  const maxAge = 60 * 60 * 24 * 7;
  const { token } = await createSessionToken(
    {
      sub: session.sub,
      email: session.email,
      name: session.name,
      role,
      isPlatformAdmin: session.isPlatformAdmin,
      accessAllTenants: session.accessAllTenants,
      activeTenantId: tenantId,
    },
    maxAge
  );
  await setSessionCookie(token, maxAge);
  redirect("/dashboard");
}
