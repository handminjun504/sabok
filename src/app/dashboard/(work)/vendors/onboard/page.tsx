import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { VendorsSubNav } from "@/components/VendorsSubNav";
import { TenantCreateForm } from "@/components/TenantCreateForm";
import { isSingleTenantMode } from "@/lib/single-tenant";

export default async function VendorTenantOnboardPage() {
  if (isSingleTenantMode()) redirect("/dashboard/vendors");

  const { session, role } = await requireTenantContext();
  if (!canEditCompanySettings(role)) {
    redirect("/dashboard");
  }
  if (!session.isPlatformAdmin) {
    redirect("/dashboard/vendors");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">고객사(업체) 등록</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          사내근로복지기금을 맡아 운영할 위탁 고객사를 추가합니다. 활성·비활성·목록은{" "}
          <Link href="/dashboard/tenants" className="font-medium text-[var(--accent)] hover:underline">
            업체(고객사) 관리
          </Link>
          에서 다룹니다.
        </p>
      </div>

      <VendorsSubNav active="onboard" showClientTenantOnboard />

      <TenantCreateForm />
    </div>
  );
}
