"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function logoutAction() {
  const s = await getSession();
  await clearSessionCookie();
  if (s) {
    await writeAudit({
      userId: s.sub,
      tenantId: s.activeTenantId,
      action: "LOGOUT",
      entity: "User",
      entityId: s.sub,
    });
  }
  redirect("/login");
}
