import { redirect } from "next/navigation";
import type { Tenant } from "@/types/models";
import { tenantListActiveByCodeAsc, userTenantListWithTenantsForUser } from "@/lib/pb/repository";
import { requireSession } from "@/lib/auth-context";
import { canAccessAnyTenant } from "@/lib/session";
import { isSingleTenantMode } from "@/lib/single-tenant";
import { reissueSessionForSingleTenantMode } from "@/lib/reissue-session-tenant";
import { SelectTenantClient } from "@/components/SelectTenantClient";

function mapToCards(tenants: Tenant[]) {
  return tenants.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    clientEntityType: t.clientEntityType,
    operationMode: t.operationMode,
    businessRegNo: t.businessRegNo,
  }));
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
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="min-w-0">
            <p className="page-eyebrow">시작하기</p>
            <h1 className="page-hero-title mt-2 neu-title-gradient">거래처 선택</h1>
            <p className="page-hero-sub text-sm sm:text-base">
              등록된 거래처가 없습니다. <strong>거래처 추가</strong>로 신규 업체를 등록한 뒤 카드에서 들어가세요.
            </p>
          </div>
          <SelectTenantClient tenants={[]} isPlatformAdmin />
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
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="min-w-0">
        <p className="page-eyebrow">업체 전환</p>
        <h1 className="page-hero-title mt-2 neu-title-gradient">거래처 선택</h1>
        <p className="page-hero-sub text-sm sm:text-base">
          카드에서 들어갈 거래처를 고르세요. 플랫폼 관리자는 우측 <strong>+</strong> 로 신규 거래처를 등록할 수 있습니다.
        </p>
      </div>
      <SelectTenantClient tenants={mapToCards(tenants)} isPlatformAdmin={session.isPlatformAdmin} />
    </div>
  );
}
