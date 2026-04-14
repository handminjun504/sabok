import Link from "next/link";
import { companySettingsByTenant, employeeListByTenantCodeAsc } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees } from "@/lib/permissions";
import { CsvImportClient } from "@/components/CsvImportClient";
import { EmployeeCsvExportButton } from "@/components/EmployeeCsvExportButton";
import { EmployeeDirectoryGrid } from "@/components/EmployeeDirectoryGrid";

export default async function EmployeesPage() {
  const { tenantId, role } = await requireTenantContext();
  const [settings, list] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
  ]);
  const activeYear = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const yy = String(activeYear).slice(-2);
  const colRepReturn = settings?.surveyShowRepReturn ?? false;
  const colSpouseReceipt = settings?.surveyShowSpouseReceipt ?? false;
  const colWorkerNet = settings?.surveyShowWorkerNet ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="neu-title-gradient text-2xl font-bold">직원 정보</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <EmployeeCsvExportButton />
          {canEditEmployees(role) && (
            <>
              <Link href="/dashboard/employees/new" className="btn btn-primary px-4 py-2 text-sm">
                직원 추가
              </Link>
              <CsvImportClient />
            </>
          )}
        </div>
      </div>

      <div className="surface dash-panel-pad text-sm">
        <p className="font-semibold tracking-normal text-[var(--text)]">&lt;{yy}년 사복 진행 조사표&gt;</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          창립월 {foundingMonth}월 · CODE 순 · 시트 매핑은 저장소 docs/sheet-mapping.md
        </p>
      </div>

      <div className="surface p-4 sm:p-5">
        <EmployeeDirectoryGrid
          employees={list}
          colRepReturn={colRepReturn}
          colSpouseReceipt={colSpouseReceipt}
          colWorkerNet={colWorkerNet}
        />
      </div>
    </div>
  );
}
