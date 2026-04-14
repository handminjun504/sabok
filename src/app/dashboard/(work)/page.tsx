import { companySettingsByTenant, employeeCountByTenant, tenantGetById } from "@/lib/pb/repository";
import { DashboardTenantProfileForm } from "@/components/DashboardTenantProfileForm";
import { requireTenantContext } from "@/lib/tenant-context";
import type { Tenant } from "@/types/models";
import Link from "next/link";

function tenantProfileFormKey(t: Tenant): string {
  return [
    t.name,
    t.memo ?? "",
    t.approvalNumber ?? "",
    t.businessRegNo ?? "",
    String(t.headOfficeCapital ?? ""),
    t.clientEntityType,
    t.operationMode,
  ].join("|");
}

export default async function DashboardHomePage() {
  const { tenantId } = await requireTenantContext();
  const [empCount, settings, tenant] = await Promise.all([
    employeeCountByTenant(tenantId),
    companySettingsByTenant(tenantId),
    tenantGetById(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();

  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <div>
          <p className="page-eyebrow">업무 홈</p>
          <h1 className="page-hero-title mt-2 neu-title-gradient">복지기금 운영 현황</h1>
          <p className="page-hero-sub">기준 연도와 주요 수치를 확인하세요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="trust-pill">기준 연도 {year}</span>
          <span className="trust-pill">등록 직원 {empCount}명</span>
        </div>
      </header>

      <section aria-labelledby="dash-stats">
        <h2 id="dash-stats" className="sr-only">
          요약 지표
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface-prominent p-5 sm:p-6 lg:p-8">
            <p className="dash-eyebrow">등록 직원</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-normal text-[var(--text)]">{empCount}</p>
            <Link
              href="/dashboard/employees"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:gap-2 hover:underline"
            >
              직원 관리 <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="surface-prominent p-5 sm:p-6 lg:p-8">
            <p className="dash-eyebrow">기준 연도</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-normal text-[var(--text)]">{year}</p>
            <Link
              href="/dashboard/settings"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:gap-2 hover:underline"
            >
              전사 설정 <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="surface-prominent p-5 sm:p-6 lg:p-8">
            <p className="dash-eyebrow">창립월</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-normal text-[var(--text)]">
              {settings?.foundingMonth ?? "—"}
              <span className="text-2xl font-bold text-[var(--muted)]">월</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">정기 지급·스케줄 기준</p>
          </div>
        </div>
      </section>

      {tenant ? (
        <DashboardTenantProfileForm key={tenantProfileFormKey(tenant)} tenant={tenant} />
      ) : null}
    </div>
  );
}
