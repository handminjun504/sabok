import { redirect } from "next/navigation";
import { vendorListByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { VendorsSubNav } from "@/components/VendorsSubNav";
import { VendorContributionEntryForm } from "@/components/VendorContributionEntryForm";

export default async function VendorContributionsPage() {
  const { tenantId, role } = await requireTenantContext();
  if (!canEditCompanySettings(role)) {
    redirect("/dashboard");
  }

  const list = await vendorListByTenant(tenantId);
  const sorted = [...list].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">적립금</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">출연금 입력 시 규칙대로 추가 적립이 누적됩니다.</p>
      </div>

      <VendorsSubNav active="contribute" />

      <VendorContributionEntryForm vendors={sorted} />
    </div>
  );
}
