import { redirect } from "next/navigation";
import type { Tenant, UserTenantLink } from "@/types/models";
import {
  companySettingsActiveYearsByTenants,
  tenantListActiveByCodeAsc,
  tenantListAllByCodeAscWithCounts,
  userTenantListWithTenantsForUser,
  type TenantWithCounts,
} from "@/lib/pb/repository";
import { requireSession } from "@/lib/auth-context";
import { canAccessAnyTenant } from "@/lib/session";
import { isSingleTenantMode } from "@/lib/single-tenant";
import { reissueSessionForSingleTenantMode } from "@/lib/reissue-session-tenant";
import { canEditCompanySettings } from "@/lib/permissions";
import { Role, parseRole } from "@/lib/role";
import { SelectTenantClient, type SelectTenantCard } from "@/components/SelectTenantClient";

/** 카드의 `activeYear` 폴백 — 전사 설정이 없는 거래처에 사용. 단일 진실(현재 달력 연도). */
function fallbackYear(): number {
  return new Date().getFullYear();
}

type CardSource = {
  id: string;
  code: string;
  name: string;
  clientEntityType: Tenant["clientEntityType"];
  operationMode: Tenant["operationMode"];
  businessRegNo: string | null;
  approvalNumber: string | null;
  headOfficeCapital: number | null;
  active: boolean;
  employeeCount?: number;
};

function fromTenant(t: Tenant): CardSource {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    clientEntityType: t.clientEntityType,
    operationMode: t.operationMode,
    businessRegNo: t.businessRegNo,
    approvalNumber: t.approvalNumber,
    headOfficeCapital: t.headOfficeCapital,
    active: true,
  };
}

function fromAdminRow(t: TenantWithCounts): CardSource {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    clientEntityType: t.clientEntityType,
    operationMode: t.operationMode,
    businessRegNo: t.businessRegNo,
    approvalNumber: t.approvalNumber,
    headOfficeCapital: t.headOfficeCapital,
    active: t.active,
    employeeCount: t._count.employees,
  };
}

/**
 * 카드 소스 목록과 거래처별 활성 연도 맵, 거래처별 「연도 변경 가능 여부」 를 합쳐 최종 카드 배열로 만든다.
 *
 * `canEditYearByTenantId` 가 카드 id 에 없으면 변경 불가(false) 로 간주 — 화이트리스트 정책.
 */
function buildCards(
  sources: readonly CardSource[],
  yearByTenantId: Record<string, number>,
  canEditYearByTenantId: (id: string) => boolean,
): SelectTenantCard[] {
  return sources.map((s) => ({
    ...s,
    activeYear: yearByTenantId[s.id] ?? fallbackYear(),
    canEditYear: s.active ? canEditYearByTenantId(s.id) : false,
  }));
}

/**
 * 일반 사용자(=accessAllTenants 가 아닌 경우) 의 거래처별 권한 — `user_tenants.role` 기반.
 * 링크가 없는 거래처는 false(접근 불가 거래처는 카드 자체가 없으므로 도달하지 않음).
 */
function canEditYearFromUserTenants(links: readonly UserTenantLink[]): (id: string) => boolean {
  const cache = new Map<string, boolean>();
  for (const l of links) {
    cache.set(l.tenantId, canEditCompanySettings(parseRole(l.role)));
  }
  return (id) => cache.get(id) ?? false;
}

export default async function SelectTenantPage() {
  const session = await requireSession();
  if (isSingleTenantMode()) {
    if (session.activeTenantId) redirect("/dashboard");
    const ok = await reissueSessionForSingleTenantMode();
    redirect(ok ? "/dashboard" : "/login");
  }

  let sources: CardSource[];
  let canEditYear: (id: string) => boolean;

  if (canAccessAnyTenant(session)) {
    if (session.isPlatformAdmin) {
      const rows = await tenantListAllByCodeAscWithCounts();
      sources = rows.map(fromAdminRow);
      /** 플랫폼 관리자는 모든 거래처에서 ADMIN 권한이므로 항상 변경 가능. */
      canEditYear = () => true;
    } else {
      const tenants = await tenantListActiveByCodeAsc();
      sources = tenants.map(fromTenant);
      /** accessAllTenants 사용자는 세션 role 이 모든 거래처에 동일하게 적용된다. */
      const allowed = canEditCompanySettings(session.role as Role);
      canEditYear = () => allowed;
    }
  } else {
    const links = await userTenantListWithTenantsForUser(session.sub);
    sources = links.map((l) => fromTenant(l.tenant));
    canEditYear = canEditYearFromUserTenants(links);
  }

  const yearByTenantId =
    sources.length > 0
      ? await companySettingsActiveYearsByTenants(sources.map((s) => s.id))
      : {};
  const cards = buildCards(sources, yearByTenantId, canEditYear);

  if (cards.length === 0) {
    if (session.isPlatformAdmin) {
      return (
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="min-w-0">
            <p className="page-eyebrow">시작하기</p>
            <h1 className="page-hero-title mt-2 neu-title-gradient">거래처 선택</h1>
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
      </div>
      <SelectTenantClient tenants={cards} isPlatformAdmin={session.isPlatformAdmin} />
    </div>
  );
}
