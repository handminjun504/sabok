import { EmployeeForm } from "@/components/EmployeeForm";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  levelTargetList,
} from "@/lib/pb/repository";
import { koreaMinimumAnnualSalaryWon } from "@/lib/domain/korea-minimum-wage";

export default async function NewEmployeePage() {
  const { tenantId, role } = await requireTenantContext();
  if (!canEditEmployees(role)) redirect("/dashboard/employees");

  const [settings, allEmployees] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
  ]);
  const activeYear = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const minimumAnnualSalaryWon = koreaMinimumAnnualSalaryWon(activeYear);
  const existingEmployees = allEmployees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.name,
    position: e.position,
  }));
  /** 레벨 선택 시 사복지급분 자동 채움 — 활성 연도의 레벨 목표액만 필요 */
  const levelTargets = await levelTargetList(tenantId, activeYear);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">직원 추가</h1>
      <EmployeeForm
        activeYear={activeYear}
        foundingMonth={foundingMonth}
        minimumAnnualSalaryWon={minimumAnnualSalaryWon}
        tenantSalaryInclusionVarianceMode={settings?.salaryInclusionVarianceMode ?? "BOTH"}
        surveyShowRepReturn={settings?.surveyShowRepReturn ?? false}
        surveyShowSpouseReceipt={settings?.surveyShowSpouseReceipt ?? false}
        surveyShowWorkerNet={settings?.surveyShowWorkerNet ?? false}
        existingEmployees={existingEmployees}
        levelTargets={levelTargets}
      />
    </div>
  );
}
