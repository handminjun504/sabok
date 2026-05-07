import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  tenantGetById,
  vendorListByTenant,
} from "@/lib/pb/repository";
import { DashboardReserveStatusPanel } from "@/components/DashboardReserveStatusPanel";
import { summarizeTenantAdditionalReserve } from "@/lib/domain/vendor-reserve";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { employeeIsInactiveForYear } from "@/lib/domain/schedule";
import { YearSwitchPanel } from "@/components/YearSwitchPanel";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { NavIcon } from "@/components/ui/NavIcon";
import type { NavIconKey } from "@/lib/dashboard-nav";

export default async function DashboardHomePage() {
  const { tenantId, role } = await requireTenantContext();
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
        {
          clientEntityType: tenant.clientEntityType,
          headOfficeCapital: tenant.headOfficeCapital,
          accumulatedReserveTotalWon: tenant.accumulatedReserveTotalWon,
        },
        vendors,
      )
    : { kind: "NO_VENDORS" as const };

  const canEdit = canEditCompanySettings(role);

  const quickLinks: Array<{ href: string; label: string; desc: string; icon: NavIconKey }> = [
    { href: "/dashboard/employees", label: "직원", desc: "기본정보·급여·복지", icon: "users" },
    { href: "/dashboard/rules", label: "지급 규칙", desc: "정기·분기 요율", icon: "rules" },
    { href: "/dashboard/schedule", label: "월별 스케줄", desc: "월·직원별 안내", icon: "calendar" },
    { href: "/dashboard/operating-report", label: "운영 보고", desc: "요약·미리보기", icon: "report" },
    { href: "/dashboard/salary-inclusion-report", label: "급여 포함 신고", desc: "월별 신고 내역", icon: "report-tax" },
    { href: "/dashboard/settings", label: "전사 설정", desc: "거래처·창립월·연도", icon: "settings" },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={`업무 홈 · ${year}`}
        title="복지기금 운영 현황"
        description="기준 연도와 핵심 지표를 한 눈에 확인하고, 자주 쓰는 화면으로 바로 이동하세요."
        meta={
          <>
            <span className="trust-pill">기준 연도 {year}</span>
            <span className="trust-pill">{year}년 재직 {activeCount}명</span>
            {inactiveCount > 0 ? (
              <span className="trust-pill">비활성 {inactiveCount}명</span>
            ) : null}
            {settings?.foundingMonth ? (
              <span className="trust-pill">창립월 {settings.foundingMonth}월</span>
            ) : null}
          </>
        }
      />

      {/* KPI 카드 ─ 핵심 숫자 3개 */}
      <section aria-labelledby="dash-kpi">
        <h2 id="dash-kpi" className="sr-only">요약 지표</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/dashboard/employees" className="kpi-card group">
            <p className="kpi-card-label">{year}년 재직 직원</p>
            <p className="kpi-card-value">
              {activeCount}
              <span className="kpi-card-suffix">명</span>
            </p>
            <div className="kpi-card-foot">
              <span>전체 {employees.length}명{inactiveCount > 0 ? ` · 비활성 ${inactiveCount}` : ""}</span>
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                직원 →
              </span>
            </div>
          </Link>

          <Link href="/dashboard/rules" className="kpi-card group">
            <p className="kpi-card-label">기준 연도</p>
            <p className="kpi-card-value">{year}<span className="kpi-card-suffix">년</span></p>
            <div className="kpi-card-foot">
              <span>지급 규칙·요율 적용 연도</span>
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                규칙 →
              </span>
            </div>
          </Link>

          <Link href="/dashboard/settings" className="kpi-card group">
            <p className="kpi-card-label">창립월</p>
            <p className="kpi-card-value">
              {settings?.foundingMonth ?? "—"}
              <span className="kpi-card-suffix">월</span>
            </p>
            <div className="kpi-card-foot">
              <span>정기 지급·스케줄 기준</span>
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                설정 →
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* 빠른 가기 ─ 카드 + 아이콘 */}
      <section aria-labelledby="quick-links">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="quick-links" className="section-title">바로 가기</h2>
            <p className="section-sub">자주 쓰는 화면 — 좌측 메뉴와 동일한 경로입니다.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((q) => (
            <Link key={q.href} href={q.href} className="quick-tile">
              <span className="quick-tile-icon">
                <NavIcon icon={q.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[var(--text)]">{q.label}</span>
                <span className="mt-0.5 text-[11px] font-normal text-[var(--muted)] truncate">{q.desc}</span>
              </span>
              <span className="quick-tile-arrow" aria-hidden>→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 적립 현황 + 연도 전환 ─ 2열 (관리자), 일반은 1열 */}
      <section className={canEdit ? "grid gap-6 lg:grid-cols-[1fr_minmax(20rem,24rem)]" : ""}>
        <div>
          <div className="mb-3">
            <h2 className="section-title">추가 적립 현황</h2>
            <p className="section-sub">
              {tenant?.clientEntityType === "CORPORATE"
                ? "법인 자본금의 50% 한도까지 누적된 추가 적립 진행도를 표시합니다."
                : "출연처별 추가 적립 누적을 표시합니다."}
            </p>
          </div>
          <DashboardReserveStatusPanel summary={reserveSummary} />
        </div>

        {canEdit ? (
          <div>
            <div className="mb-3">
              <h2 className="section-title">연도 전환</h2>
              <p className="section-sub">새 회계연도로 넘어갈 때 사용합니다 — 이전 데이터 복사 옵션 포함.</p>
            </div>
            <YearSwitchPanel currentYear={year} canEdit={canEdit} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
