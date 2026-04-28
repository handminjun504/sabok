import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  tenantGetById,
  vendorListByTenant,
} from "@/lib/pb/repository";
import { DashboardReserveStatusPanel } from "@/components/DashboardReserveStatusPanel";
import { summarizeTenantAdditionalReserve } from "@/lib/domain/vendor-reserve";
import { requireTenantContext } from "@/lib/tenant-context";
import { employeeIsInactiveForYear } from "@/lib/domain/schedule";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function DashboardHomePage() {
  const { tenantId } = await requireTenantContext();
  const [employees, settings, tenant, vendors] = await Promise.all([
    employeeListByTenantCodeAsc(tenantId),
    companySettingsByTenant(tenantId),
    tenantGetById(tenantId),
    vendorListByTenant(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const activeCount = employees.filter((e) => !employeeIsInactiveForYear(e, year)).length;
  const inactiveCount = employees.length - activeCount;
  const reserveSummary = tenant
    ? summarizeTenantAdditionalReserve(
        { clientEntityType: tenant.clientEntityType, headOfficeCapital: tenant.headOfficeCapital },
        vendors
      )
    : { kind: "NO_VENDORS" as const };

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="업무 홈"
        title="복지기금 운영 현황"
        description="기준 연도와 주요 수치를 확인하세요."
        meta={
          <>
            <span className="trust-pill">기준 연도 {year}</span>
            <span className="trust-pill">{year}년 재직 {activeCount}명</span>
            {inactiveCount > 0 ? (
              <span className="trust-pill">비활성(입사 전·퇴사) {inactiveCount}명</span>
            ) : null}
          </>
        }
      />

      <section aria-labelledby="dash-stats">
        <h2 id="dash-stats" className="sr-only">
          요약 지표
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface-prominent p-5 sm:p-6 lg:p-8">
            <p className="dash-eyebrow">{year}년 재직 직원</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-normal text-[var(--text)]">{activeCount}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              전체 등록 {employees.length}명{inactiveCount > 0 ? ` · 비활성 ${inactiveCount}명` : ""}
            </p>
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

      <DashboardReserveStatusPanel summary={reserveSummary} />

      <section className="surface dash-panel-pad" aria-labelledby="tenant-quick-link">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="tenant-quick-link" className="text-sm font-bold text-[var(--text)]">
              거래처 프로필·전사 설정
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              거래처 등록 정보·기금 운영 방식·창립월·기준 연도 등은 설정 페이지에서 한 번에 관리합니다.
            </p>
          </div>
          <Link href="/dashboard/settings" className="btn btn-outline shrink-0 text-sm">
            설정 열기 →
          </Link>
        </div>
      </section>
    </div>
  );
}
