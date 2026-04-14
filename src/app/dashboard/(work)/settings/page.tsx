import { companySettingsByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { saveCompanySettingsFormAction } from "@/app/actions/settings";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";
import { SALARY_INCLUSION_VARIANCE_MODES } from "@/lib/domain/salary-inclusion-display";

export default async function SettingsPage() {
  const { tenantId, role } = await requireTenantContext();
  const s = await companySettingsByTenant(tenantId);
  const canEdit = canEditCompanySettings(role);
  const varianceMode = s?.salaryInclusionVarianceMode ?? "BOTH";
  const varianceSummary = SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === varianceMode)?.label ?? varianceMode;

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
              창립 <strong>{s?.foundingMonth ?? 1}</strong>월 · 기본 급여일 <strong>{s?.defaultPayDay ?? 25}</strong>일 · 기준 연도{" "}
              <strong>{s?.activeYear ?? new Date().getFullYear()}</strong>년
              {s?.accrualCurrentMonthPayNext ? " · 당월 귀속·차월 지급" : ""}
              <span className="mt-1 block text-xs text-[var(--muted)]">급여포함 초과·미달: {varianceSummary}</span>
            </p>
          }
        >
          <form action={saveCompanySettingsFormAction} className="space-y-3">
            <div>
              <label className="dash-field-label">회사 창립월 (1~12)</label>
              <input
                name="foundingMonth"
                type="number"
                min={1}
                max={12}
                defaultValue={s?.foundingMonth ?? 1}
                className="input max-w-[8rem] text-xs"
              />
            </div>
            <div>
              <label className="dash-field-label">기본 급여일 (1~31)</label>
              <input
                name="defaultPayDay"
                type="number"
                min={1}
                max={31}
                defaultValue={s?.defaultPayDay ?? 25}
                className="input max-w-[8rem] text-xs"
              />
            </div>
            <div>
              <label className="dash-field-label">기준 연도</label>
              <input
                name="activeYear"
                type="number"
                defaultValue={s?.activeYear ?? new Date().getFullYear()}
                className="input max-w-[10rem] text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="accrualCurrentMonthPayNext"
                defaultChecked={s?.accrualCurrentMonthPayNext ?? false}
              />
              당월 귀속·차월 지급 (정기분 표시)
            </label>
            <div>
              <span className="dash-field-label">급여포함신고·스케줄: 상한 대비 초과 / 미달 표시</span>
              <div className="mt-2 space-y-2">
                {SALARY_INCLUSION_VARIANCE_MODES.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3"
                  >
                    <input
                      type="radio"
                      name="salaryInclusionVarianceMode"
                      value={opt.value}
                      defaultChecked={varianceMode === opt.value}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="font-medium text-[var(--text)]">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              저장
            </button>
          </form>
        </CollapsibleEditorPanel>
      ) : (
        <div className="surface dash-panel-pad space-y-3 text-sm">
          <p>
            창립 <strong>{s?.foundingMonth ?? 1}</strong>월 · 기본 급여일 <strong>{s?.defaultPayDay ?? 25}</strong>일 · 기준 연도{" "}
            <strong>{s?.activeYear ?? new Date().getFullYear()}</strong>년
          </p>
          <p className="text-[var(--muted)]">
            {s?.accrualCurrentMonthPayNext ? "당월 귀속·차월 지급 사용 중" : "귀속·지급 동월"}
          </p>
          <p className="text-[var(--muted)]">급여포함 초과·미달 표시: {varianceSummary}</p>
        </div>
      )}
    </div>
  );
}
