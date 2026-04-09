"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import {
  companySettingsCreateForTenant,
  tenantCreate,
  tenantUpdateActive,
} from "@/lib/pb/repository";

export async function createTenantFormAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.isPlatformAdmin) return;

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!name || !code) return;

  try {
    const tenant = await tenantCreate({ name, code, active: true });
    await companySettingsCreateForTenant(tenant.id);
    await writeAudit({
      userId: session.sub,
      tenantId: tenant.id,
      action: "CREATE_TENANT",
      entity: "Tenant",
      entityId: tenant.id,
      payload: { code, name },
    });
  } catch {
    return;
  }
  revalidatePath("/dashboard/tenants");
  revalidatePath("/dashboard/select-tenant");
}

export async function setTenantActiveFormAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.isPlatformAdmin) return;

  const tenantId = String(formData.get("tenantId") ?? "");
  const active = formData.get("active") === "true";
  try {
    await tenantUpdateActive(tenantId, active);
  } catch {
    return;
  }
  await writeAudit({
    userId: session.sub,
    tenantId,
    action: active ? "TENANT_ACTIVATE" : "TENANT_DEACTIVATE",
    entity: "Tenant",
    entityId: tenantId,
  });
  revalidatePath("/dashboard/tenants");
}
