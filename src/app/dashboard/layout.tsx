import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { requireSession } from "@/lib/auth-context";
import { tenantGetById } from "@/lib/pb/repository";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const h = await headers();
  const path = h.get("x-sabok-pathname") ?? "";
  const tenantOptional =
    path.startsWith("/dashboard/select-tenant") || path.startsWith("/dashboard/tenants");

  if (!tenantOptional && !s.activeTenantId) {
    redirect("/dashboard/select-tenant");
  }

  const tenant = s.activeTenantId != null ? await tenantGetById(s.activeTenantId) : null;
  const hasActiveTenant = Boolean(s.activeTenantId && tenant);

  return (
    <div className="min-h-screen">
      <AppNav
        role={s.role}
        isPlatformAdmin={s.isPlatformAdmin}
        hasActiveTenant={hasActiveTenant}
        tenantName={tenant?.name ?? null}
        tenantCode={tenant?.code ?? null}
      />
      <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
    </div>
  );
}
