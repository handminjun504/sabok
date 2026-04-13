import { companySettingsByTenant, employeeCountByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import Link from "next/link";

const QUICK_LINKS = [
  { href: "/dashboard/employees", label: "직원 정보", desc: "등록·수정·퇴사월 등 기본 인적 사항" },
  { href: "/dashboard/levels", label: "레벨·정기지급", desc: "행사별 금액·레벨 규칙" },
  { href: "/dashboard/quarterly", label: "분기 지원금", desc: "요율·직원별 분기 설정" },
  { href: "/dashboard/schedule", label: "월별 스케줄", desc: "지급 월·합계 한눈에" },
  { href: "/dashboard/salary-inclusion-report", label: "급여포함신고", desc: "초과·미달 점검" },
  { href: "/dashboard/settings", label: "전사 설정", desc: "창립월·기준 연도" },
];

export default async function DashboardHomePage() {
  const { tenantId } = await requireTenantContext();
  const [empCount, settings] = await Promise.all([
    employeeCountByTenant(tenantId),
    companySettingsByTenant(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();

  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <div>
          <p className="page-eyebrow">업무 홈</p>
          <h1 className="page-hero-title mt-2 neu-title-gradient">복지기금 운영 현황</h1>
          <p className="page-hero-sub">
            자주 쓰는 메뉴로 바로 이동하고, 아래 숫자로 이번 연도 기준 상태를 확인하세요.
          </p>
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
          <div className="surface-prominent p-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">등록 직원</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">{empCount}</p>
            <Link
              href="/dashboard/employees"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:gap-2 hover:underline"
            >
              직원 관리 <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="surface-prominent p-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">기준 연도</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">{year}</p>
            <Link
              href="/dashboard/settings"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:gap-2 hover:underline"
            >
              전사 설정 <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="surface-prominent p-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">창립월</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">
              {settings?.foundingMonth ?? "—"}
              <span className="text-2xl font-bold text-[var(--muted)]">월</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">정기 지급·스케줄 기준</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="dash-quick" className="border-t border-[var(--border)] pt-10">
        <div className="mb-6">
          <p className="page-eyebrow">바로 가기</p>
          <h2 id="dash-quick" className="mt-2 text-lg font-bold text-[var(--text)]">
            자주 찾는 업무
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">카드를 눌러 해당 화면으로 이동합니다.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="quick-link-card group block">
              <span className="flex items-start justify-between gap-2">
                <span className="text-[0.9375rem] font-bold text-[var(--text)]">{link.label}</span>
                <span
                  className="shrink-0 text-[var(--accent)] transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden
                >
                  →
                </span>
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-[var(--muted)]">{link.desc}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
