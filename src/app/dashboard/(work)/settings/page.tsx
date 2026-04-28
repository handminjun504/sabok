import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  tenantGetById,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";
import { CompanySettingsForm } from "@/components/CompanySettingsForm";
import { DashboardTenantProfileForm } from "@/components/DashboardTenantProfileForm";
import { SALARY_INCLUSION_VARIANCE_MODES } from "@/lib/domain/salary-inclusion-display";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/Tabs";
import type { Tenant } from "@/types/models";

function tenantProfileFormKey(t: Tenant): string {
  /** DashboardTenantProfileForm 은 tenant prop 변경 시 내부 state 를 초기화하기 위해 key 로 무효화한다. */
  return [
    t.name,
    t.memo ?? "",
    t.approvalNumber ?? "",
    t.businessRegNo ?? "",
    String(t.headOfficeCapital ?? ""),
    t.clientEntityType,
    t.operationMode,
    t.announcementMode,
    String(t.announcementBatchFromMonth ?? ""),
    String(t.announcementBatchToMonth ?? ""),
  ].join("|");
}

export default async function SettingsPage() {
  const { tenantId, role } = await requireTenantContext();
  const [s, allEmployees, tenant] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
    tenantGetById(tenantId),
  ]);
  const canEdit = canEditCompanySettings(role);
  const varianceMode = s?.salaryInclusionVarianceMode ?? "BOTH";
  const varianceSummary = SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === varianceMode)?.label ?? varianceMode;
  const foundingMonth = s?.foundingMonth ?? 1;
  const defaultPayDay = s?.defaultPayDay ?? 25;
  const activeYear = s?.activeYear ?? new Date().getFullYear();
  const accrualNext = s?.accrualCurrentMonthPayNext ?? false;
  const surveyRep = s?.surveyShowRepReturn ?? false;
  const surveySpouse = s?.surveyShowSpouseReceipt ?? false;
  const surveyWorker = s?.surveyShowWorkerNet ?? false;
  const fixedEventMonths = (s?.fixedEventMonths ?? null) as
    | Partial<Record<"NEW_YEAR_FEB" | "FAMILY_MAY" | "CHUSEOK_AUG" | "YEAR_END_NOV", number>>
    | null;
  const quarterlyPayMonths = (s?.quarterlyPayMonths ?? null) as
    | Partial<Record<string, number[]>>
    | null;
  const repReturnSchedule = s?.repReturnSchedule ?? null;
  /** 대표반환 대상 직원 (flagRepReturn=true 인 직원만). 폼에서 입력 행 구성에 사용. */
  const repReturnEmployees = allEmployees
    .filter((e) => e.flagRepReturn)
    .map((e) => ({ id: e.id, employeeCode: e.employeeCode, name: e.name }));

  const companySettingsTab = (
    <>
      {!canEdit && (
        <Alert tone="warn">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</Alert>
      )}
      {canEdit ? (
        <CollapsibleEditorPanel
          title="전사 설정"
          description="창립월·급여일·기준 연도·정기 지급(귀속·지급)·급여포함신고 표시"
          triggerLabel="설정 수정하기"
          defaultOpen={false}
          summary={
            <p className="text-sm text-[var(--text)]">
              창립 <strong>{foundingMonth}</strong>월 · 기본 급여일 <strong>{defaultPayDay}</strong>일 · 기준 연도{" "}
              <strong>{activeYear}</strong>년
              {accrualNext ? " · 당월 귀속·차월 지급" : ""}
              <span className="mt-1 block text-xs text-[var(--muted)]">급여포함 초과·미달: {varianceSummary}</span>
              <span className="mt-1 block text-xs text-[var(--muted)]">
                조사표 항목: 대표반환 {surveyRep ? "ON" : "OFF"} · 배우자수령 {surveySpouse ? "ON" : "OFF"} · 근로자 실질{" "}
                {surveyWorker ? "ON" : "OFF"}
              </span>
            </p>
          }
        >
          <CompanySettingsForm
            foundingMonth={foundingMonth}
            defaultPayDay={defaultPayDay}
            activeYear={activeYear}
            accrualCurrentMonthPayNext={accrualNext}
            varianceMode={varianceMode}
            surveyShowRepReturn={surveyRep}
            surveyShowSpouseReceipt={surveySpouse}
            surveyShowWorkerNet={surveyWorker}
            fixedEventMonths={fixedEventMonths ?? undefined}
            quarterlyPayMonths={quarterlyPayMonths ?? undefined}
            repReturnSchedule={repReturnSchedule}
            repReturnEmployees={repReturnEmployees}
          />
        </CollapsibleEditorPanel>
      ) : (
        <div className="surface dash-panel-pad space-y-3 text-sm">
          <p>
            창립 <strong>{foundingMonth}</strong>월 · 기본 급여일 <strong>{defaultPayDay}</strong>일 · 기준 연도{" "}
            <strong>{activeYear}</strong>년
          </p>
          <p className="text-[var(--muted)]">
            {accrualNext ? "당월 귀속·차월 지급 사용 중" : "귀속·지급 동월"}
          </p>
          <p className="text-[var(--muted)]">급여포함 초과·미달 표시: {varianceSummary}</p>
          <p className="text-[var(--muted)]">
            조사표 항목: 대표반환 {surveyRep ? "ON" : "OFF"} · 배우자수령 {surveySpouse ? "ON" : "OFF"} · 근로자 실질{" "}
            {surveyWorker ? "ON" : "OFF"}
          </p>
        </div>
      )}
    </>
  );

  const tenantProfileTab = tenant ? (
    <DashboardTenantProfileForm key={tenantProfileFormKey(tenant)} tenant={tenant} />
  ) : (
    <p className="text-sm text-[var(--muted)]">거래처 정보를 불러올 수 없습니다.</p>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="환경 설정"
        title="설정"
        description="전사 설정과 거래처 프로필을 한 곳에서 관리합니다."
      />
      <Tabs
        tabs={[
          { label: "전사 설정", content: companySettingsTab },
          { label: "거래처 프로필", content: tenantProfileTab },
        ]}
      />
    </div>
  );
}
