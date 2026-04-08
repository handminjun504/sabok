import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { requireSession } from "@/lib/auth-context";
import { getDashboardNav } from "@/lib/dashboard-nav";
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

  const groups = getDashboardNav({
    role: s.role,
    isPlatformAdmin: s.isPlatformAdmin,
    hasActiveTenant,
  });

  let tenantLine: string | null = null;
  if (tenant?.name || tenant?.code) {
    const name = tenant?.name ?? "";
    const code = tenant?.code;
    tenantLine = `현재 업체: ${name}${code ? ` (${code})` : ""}`;
  }

  return (
    <DashboardShell groups={groups} tenantLine={tenantLine}>
      {children}
    </DashboardShell>
  );
}
