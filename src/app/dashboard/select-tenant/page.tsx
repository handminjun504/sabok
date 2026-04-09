import { tenantListActiveByCodeAsc, userTenantListWithTenantsForUser } from "@/lib/pb/repository";
import { requireSession } from "@/lib/auth-context";
import { switchTenantFormAction } from "@/app/actions/tenant-switch";
import { canAccessAnyTenant } from "@/lib/session";

export default async function SelectTenantPage() {
  const session = await requireSession();

  let tenants: { id: string; code: string; name: string; active: boolean }[];
  if (canAccessAnyTenant(session)) {
    tenants = await tenantListActiveByCodeAsc();
  } else {
    const links = await userTenantListWithTenantsForUser(session.sub);
    tenants = links.map((l) => ({
      id: l.tenant.id,
      code: l.tenant.code,
      name: l.tenant.name,
      active: l.tenant.active,
    }));
  }

  if (tenants.length === 0) {
    return (
      <div className="surface mx-auto max-w-lg p-8">
        <h1 className="text-xl font-bold">접근 가능한 업체 없음</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          플랫폼 관리자에게 문의하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">업체 선택</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">작업할 고객사(위탁 업체)를 선택하세요.</p>
      </div>
      <ul className="space-y-3">
        {tenants.map((t) => (
          <li key={t.id} className="surface flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-semibold">{t.name}</p>
              <p className="text-xs text-[var(--muted)]">코드: {t.code}</p>
            </div>
            <form action={switchTenantFormAction}>
              <input type="hidden" name="tenantId" value={t.id} />
              <button type="submit" className="btn btn-primary shrink-0 px-4 py-2 text-sm">
                이 업체로 들어가기
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
