import { EmployeeForm } from "@/components/EmployeeForm";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function NewEmployeePage() {
  const { tenantId, role } = await requireTenantContext();
  if (!canEditEmployees(role)) redirect("/dashboard/employees");

  const settings = await prisma.companySettings.findUnique({ where: { tenantId } });
  const activeYear = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">직원 추가</h1>
      <EmployeeForm activeYear={activeYear} foundingMonth={foundingMonth} />
    </div>
  );
}
