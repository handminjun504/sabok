import { companySettingsByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { saveCompanySettingsFormAction } from "@/app/actions/settings";

export default async function SettingsPage() {
  const { tenantId, role } = await requireTenantContext();
  const s = await companySettingsByTenant(tenantId);
  const canEdit = canEditCompanySettings(role);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">전사 설정</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">창립월·급여일·기준 연도·지급 정책 (현재 업체)</p>
      </div>
      {!canEdit && (
        <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
      )}
      <form action={saveCompanySettingsFormAction} className="surface space-y-4 p-6">
        <div>
          <label className="text-sm text-[var(--muted)]">회사 창립월 (1~12)</label>
          <input
            name="foundingMonth"
            type="number"
            min={1}
            max={12}
            defaultValue={s?.foundingMonth ?? 1}
            readOnly={!canEdit}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm text-[var(--muted)]">기본 급여일 (1~31)</label>
          <input
            name="defaultPayDay"
            type="number"
            min={1}
            max={31}
            defaultValue={s?.defaultPayDay ?? 25}
            readOnly={!canEdit}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm text-[var(--muted)]">기준 연도 (앱 기본 연도)</label>
          <input
            name="activeYear"
            type="number"
            defaultValue={s?.activeYear ?? new Date().getFullYear()}
            readOnly={!canEdit}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="accrualCurrentMonthPayNext"
            defaultChecked={s?.accrualCurrentMonthPayNext ?? false}
            readOnly={!canEdit}
            className={!canEdit ? "pointer-events-none opacity-60" : ""}
          />
          당월 귀속·차월 지급 (정기분 표시)
        </label>
        {canEdit && (
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white">
            저장
          </button>
        )}
      </form>
    </div>
  );
}
