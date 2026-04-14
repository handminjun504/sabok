import Link from "next/link";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees } from "@/lib/permissions";
import { CsvImportClient } from "@/components/CsvImportClient";
import { EmployeeCsvExportButton } from "@/components/EmployeeCsvExportButton";
import { EmployeeDirectoryGrid } from "@/components/EmployeeDirectoryGrid";
import { customPaymentScheduleRows } from "@/lib/domain/payment-events";

export default async function EmployeesPage() {
  const { tenantId, role } = await requireTenantContext();
  const [settings, list] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
  ]);
  const activeYear = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const accrual = settings?.accrualCurrentMonthPayNext ?? false;
  const ids = list.map((e) => e.id);
  const [rules, overrides, quarterly, notes] = await Promise.all([
    levelPaymentRuleList(tenantId, activeYear),
    level5OverrideListByEmployeeIdsYear(ids, activeYear),
    quarterlyEmployeeConfigListByTenantYear(tenantId, activeYear, ids),
    monthlyNoteListByTenantYear(tenantId, activeYear, ids),
  ]);
  const customSchedule = customPaymentScheduleRows(settings, activeYear);
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
          {`창립월 ${foundingMonth}월 · 기준 연도 ${activeYear}년 · 카드 연간 사복·급여+사복 합계는 스케줄·분기·월별 노트와 동일 산식 · CODE 순 · 시트 매핑은 저장소 docs/sheet-mapping.md`}
        </p>
      </div>

      <div className="surface p-4 sm:p-5">
        <EmployeeDirectoryGrid
          employees={list}
          colRepReturn={colRepReturn}
          colSpouseReceipt={colSpouseReceipt}
          colWorkerNet={colWorkerNet}
          payrollYearContext={{
            activeYear,
            foundingMonth,
            accrualCurrentMonthPayNext: accrual,
            rules,
            overrides,
            quarterly,
            monthlyNotes: notes,
            customSchedule,
          }}
        />
      </div>
    </div>
  );
}
