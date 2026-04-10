import { redirect } from "next/navigation";
import type { Tenant } from "@/types/models";
import { tenantListActiveByCodeAsc, userTenantListWithTenantsForUser } from "@/lib/pb/repository";
import { requireSession } from "@/lib/auth-context";
import { switchTenantFormAction } from "@/app/actions/tenant-switch";
import { canAccessAnyTenant } from "@/lib/session";
import { isSingleTenantMode } from "@/lib/single-tenant";
import { reissueSessionForSingleTenantMode } from "@/lib/reissue-session-tenant";
import { TenantCreateForm } from "@/components/TenantCreateForm";
import { tenantClientEntityLabel, tenantOperationModeLabel } from "@/lib/domain/tenant-profile";

const addBtnClass =
  "btn btn-primary flex size-12 shrink-0 items-center justify-center rounded-full p-0 text-2xl font-light leading-none shadow-md";

function NewVendorAnchor() {
  return (
    <a href="#new-vendor-form" className={addBtnClass} aria-label="새 거래처 추가" title="새 거래처 추가">
      +
    </a>
  );
}

export default async function SelectTenantPage() {
  const session = await requireSession();
  if (isSingleTenantMode()) {
    if (session.activeTenantId) redirect("/dashboard");
    const ok = await reissueSessionForSingleTenantMode();
    redirect(ok ? "/dashboard" : "/login");
  }

  let tenants: Tenant[];
  if (canAccessAnyTenant(session)) {
    tenants = await tenantListActiveByCodeAsc();
  } else {
    const links = await userTenantListWithTenantsForUser(session.sub);
    tenants = links.map((l) => l.tenant);
  }

  if (tenants.length === 0) {
    if (session.isPlatformAdmin) {
      return (
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="neu-title-gradient text-2xl font-bold">거래처 선택</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">거래처 없음. 아래에서 추가하거나 <strong>+</strong> 로 이동.</p>
            </div>
            <NewVendorAnchor />
          </div>
          <div id="new-vendor-form" className="scroll-mt-24">
            <TenantCreateForm variant="select" />
          </div>
        </div>
      );
    }
    return (
      <div className="surface mx-auto max-w-lg p-8">
        <h1 className="text-xl font-bold">접근 가능한 거래처 없음</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">플랫폼 관리자에게 문의하세요.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="neu-title-gradient text-2xl font-bold">거래처 선택</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">들어갈 거래처를 고르세요. 관리자는 <strong>+</strong> 로 추가.</p>
        </div>
        {session.isPlatformAdmin ? <NewVendorAnchor /> : null}
      </div>
      <ul className="space-y-3">
        {tenants.map((t) => (
          <li key={t.id} className="surface flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm text-[var(--muted)]">코드: {t.code}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                {tenantClientEntityLabel(t.clientEntityType)} · {tenantOperationModeLabel(t.operationMode)}
              </p>
            </div>
            <form action={switchTenantFormAction}>
              <input type="hidden" name="tenantId" value={t.id} />
              <button type="submit" className="btn btn-primary shrink-0 px-4 py-2 text-sm">
                이 거래처로 들어가기
              </button>
            </form>
          </li>
        ))}
      </ul>
      {session.isPlatformAdmin ? (
        <div id="new-vendor-form" className="scroll-mt-24 border-t border-[var(--border)] pt-8">
          <TenantCreateForm variant="select" />
        </div>
      ) : null}
    </div>
  );
}
