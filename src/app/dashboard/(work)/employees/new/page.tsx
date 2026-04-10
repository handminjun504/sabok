import { EmployeeForm } from "@/components/EmployeeForm";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { companySettingsByTenant } from "@/lib/pb/repository";

export default async function NewEmployeePage() {
  const { tenantId, role } = await requireTenantContext();
  if (!canEditEmployees(role)) redirect("/dashboard/employees");

  const settings = await companySettingsByTenant(tenantId);
  const activeYear = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">직원 추가</h1>
      <EmployeeForm activeYear={activeYear} foundingMonth={foundingMonth} />
    </div>
  );
}
