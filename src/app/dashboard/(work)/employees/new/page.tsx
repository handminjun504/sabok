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
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";

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
      <PageHeader
        eyebrow={`직원 추가 · ${activeYear}`}
        title="직원 추가"
        description="기본정보·급여·복지·일정·가족까지 한 화면에서 입력합니다."
        actions={
          <Link href="/dashboard/employees" className="btn btn-outline text-sm">
            ← 직원 목록
          </Link>
        }
      />
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
