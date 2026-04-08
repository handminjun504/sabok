"use server";

import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, createSessionToken, setSessionCookie } from "@/lib/session";

export async function switchTenantFormAction(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const session = await getSession();
  if (!session) redirect("/login");

  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, active: true } });
  if (!tenant) redirect("/dashboard/select-tenant");

  let role: Role;
  if (session.isPlatformAdmin) {
    role = "ADMIN";
  } else {
    const ut = await prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId: session.sub, tenantId } },
    });
    if (!ut) redirect("/dashboard/select-tenant");
    role = ut.role;
  }

  const maxAge = 60 * 60 * 24 * 7;
  const { token } = await createSessionToken(
    {
      sub: session.sub,
      email: session.email,
      name: session.name,
      role,
      isPlatformAdmin: session.isPlatformAdmin,
      activeTenantId: tenantId,
    },
    maxAge
  );
  await setSessionCookie(token, maxAge);
  redirect("/dashboard");
}
