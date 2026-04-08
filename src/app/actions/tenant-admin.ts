"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function createTenantFormAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.isPlatformAdmin) return;

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!name || !code) return;

  try {
    const tenant = await prisma.tenant.create({
      data: { name, code, active: true },
    });
    await prisma.companySettings.create({
      data: { tenantId: tenant.id },
    });
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

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return;

  const tenant = await prisma.tenant.findFirst({
    where: { id: parsed.data.tenantId, active: true },
  });
  if (!tenant) return;

  await prisma.userTenant.upsert({
    where: {
      userId_tenantId: { userId: user.id, tenantId: tenant.id },
    },
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: parsed.data.role as Role,
    },
    update: { role: parsed.data.role as Role },
  });

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
    await prisma.tenant.update({ where: { id: tenantId }, data: { active } });
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
