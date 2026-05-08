import Link from "next/link";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  levelTargetList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees } from "@/lib/permissions";
import { CsvImportClient } from "@/components/CsvImportClient";
import { EmployeeCsvExportButton } from "@/components/EmployeeCsvExportButton";
import { EmployeeDirectoryTable } from "@/components/EmployeeDirectoryTable";
import { customPaymentScheduleRows, effectiveFixedEventMonthMap } from "@/lib/domain/payment-events";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { koreaMinimumAnnualSalaryWon } from "@/lib/domain/korea-minimum-wage";

export default async function EmployeesPage() {
  const { tenantId, role } = await requireTenantContext();
  const [settings, list] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
  ]);
  const activeYear = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const ids = list.map((e) => e.id);
  const [rules, overrides, quarterly, notes, levelTargets] = await Promise.all([
    levelPaymentRuleList(tenantId, activeYear),
    level5OverrideListByEmployeeIdsYear(ids, activeYear),
    quarterlyEmployeeConfigListByTenantYear(tenantId, activeYear, ids),
    monthlyNoteListByTenantYear(tenantId, activeYear, ids),
    levelTargetList(tenantId, activeYear),
  ]);
  const minimumAnnualSalaryWon = koreaMinimumAnnualSalaryWon(activeYear);
  const customSchedule = customPaymentScheduleRows(settings, activeYear);
  const fixedEventMonths = effectiveFixedEventMonthMap(settings);
  const yy = String(activeYear).slice(-2);
  const colRepReturn = settings?.surveyShowRepReturn ?? false;
  const colSpouseReceipt = settings?.surveyShowSpouseReceipt ?? false;
  const colWorkerNet = settings?.surveyShowWorkerNet ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`직원 · ${activeYear}`}
        title="직원 정보"
        actions={
          <>
            <EmployeeCsvExportButton />
            {canEditEmployees(role) && (
              <>
                <Link href="/dashboard/employees/new" className="btn btn-primary text-sm">
                  직원 추가
                </Link>
                <CsvImportClient />
              </>
            )}
          </>
        }
        meta={
          <>
            <span className="trust-pill">{yy}년 사복 진행 조사표</span>
            <span className="trust-pill">창립월 {foundingMonth}월</span>
            <span className="trust-pill">{list.length}명</span>
          </>
        }
      />

      <div className="surface p-4 sm:p-5">
        {list.length === 0 ? (
          <EmptyState
            title="등록된 직원이 없습니다."
            icon="👥"
            action={
              canEditEmployees(role) ? (
                <Link href="/dashboard/employees/new" className="btn btn-primary text-sm">
                  직원 추가
                </Link>
              ) : undefined
            }
          />
        ) : (
          <EmployeeDirectoryTable
            employees={list}
            colRepReturn={colRepReturn}
            colSpouseReceipt={colSpouseReceipt}
            colWorkerNet={colWorkerNet}
            payrollYearContext={{
              activeYear,
              foundingMonth,
              rules,
              overrides,
              quarterly,
              monthlyNotes: notes,
              customSchedule,
              fixedEventMonths,
            }}
            editContext={canEditEmployees(role) ? {
              activeYear,
              foundingMonth,
              minimumAnnualSalaryWon,
              tenantSalaryInclusionVarianceMode: settings?.salaryInclusionVarianceMode ?? "BOTH",
              surveyShowRepReturn: colRepReturn,
              surveyShowSpouseReceipt: colSpouseReceipt,
              surveyShowWorkerNet: colWorkerNet,
              existingEmployees: list.map((e) => ({
                id: e.id,
                employeeCode: e.employeeCode,
                name: e.name,
                position: e.position,
              })),
              levelTargets,
            } : null}
          />
        )}
      </div>
    </div>
  );
}
