"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@/lib/role";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import {
  companySettingsCreateForTenant,
  tenantCreate,
  tenantFindFirstActive,
  tenantUpdateActive,
  userFindByEmail,
  userTenantUpsert,
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

const assignSchema = z.object({
  email: z.string().email(),
  tenantId: z.string().min(1),
  role: z.enum(["ADMIN", "SENIOR", "JUNIOR"]),
});

export async function assignUserToTenantFormAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.isPlatformAdmin) return;

  const parsed = assignSchema.safeParse({
    email: formData.get("email"),
    tenantId: formData.get("tenantId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return;

  const user = await userFindByEmail(parsed.data.email);
  if (!user) return;

  const tenant = await tenantFindFirstActive(parsed.data.tenantId);
  if (!tenant) return;

  await userTenantUpsert(user.id, tenant.id, parsed.data.role as Role);

  await writeAudit({
    userId: session.sub,
    tenantId: tenant.id,
    action: "ASSIGN_USER_TENANT",
    entity: "UserTenant",
    entityId: `${user.id}:${tenant.id}`,
    payload: { email: parsed.data.email, role: parsed.data.role },
  });

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
