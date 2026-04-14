import { companySettingsByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";
import { CompanySettingsForm } from "@/components/CompanySettingsForm";
import { SALARY_INCLUSION_VARIANCE_MODES } from "@/lib/domain/salary-inclusion-display";

export default async function SettingsPage() {
  const { tenantId, role } = await requireTenantContext();
  const s = await companySettingsByTenant(tenantId);
  const canEdit = canEditCompanySettings(role);
  const varianceMode = s?.salaryInclusionVarianceMode ?? "BOTH";
  const varianceSummary = SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === varianceMode)?.label ?? varianceMode;
  const foundingMonth = s?.foundingMonth ?? 1;
  const defaultPayDay = s?.defaultPayDay ?? 25;
  const activeYear = s?.activeYear ?? new Date().getFullYear();
  const accrualNext = s?.accrualCurrentMonthPayNext ?? false;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">전사 설정</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          선택한 거래처 기준 · 창립월·급여일·기준 연도·지급 표시
        </p>
      </div>
      {!canEdit && (
        <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
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
            </p>
          }
        >
          <CompanySettingsForm
            foundingMonth={foundingMonth}
            defaultPayDay={defaultPayDay}
            activeYear={activeYear}
            accrualCurrentMonthPayNext={accrualNext}
            varianceMode={varianceMode}
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
        </div>
      )}
    </div>
  );
}
