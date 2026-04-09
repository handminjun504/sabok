import { companySettingsByTenant, employeeCountByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import Link from "next/link";

const QUICK_LINKS = [
  { href: "/dashboard/employees", label: "직원 정보", desc: "직원 등록·조회·수정" },
  { href: "/dashboard/levels", label: "레벨·정기지급", desc: "레벨별 행사 금액 설정" },
  { href: "/dashboard/quarterly", label: "분기 지원금", desc: "분기별 항목 및 직원 설정" },
  { href: "/dashboard/schedule", label: "월별 스케줄", desc: "지급월 기준 전체 스케줄 확인" },
  { href: "/dashboard/salary-inclusion-report", label: "급여포함신고", desc: "초과·미달 현황 보고" },
  { href: "/dashboard/settings", label: "전사 설정", desc: "창립월·기준 연도·지급 정책" },
];

export default async function DashboardHomePage() {
  const { tenantId } = await requireTenantContext();
  const [empCount, settings] = await Promise.all([
    employeeCountByTenant(tenantId),
    companySettingsByTenant(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">대시보드</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도 <strong>{year}</strong>
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">등록 직원</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-[var(--text)]">{empCount}</p>
          <Link
            href="/dashboard/employees"
            className="mt-3 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
          >
            직원 관리 →
          </Link>
        </div>
        <div className="surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">기준 연도</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-[var(--text)]">{year}</p>
          <Link
            href="/dashboard/settings"
            className="mt-3 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
          >
            전사 설정 →
          </Link>
        </div>
        <div className="surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">창립월</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-[var(--text)]">
            {settings?.foundingMonth ?? "—"}월
          </p>
          <p className="mt-3 text-sm text-[var(--muted)]">정기 지급 기준</p>
        </div>
      </div>

      {/* 빠른 이동 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">빠른 이동</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="surface surface-hoverable flex flex-col gap-1 p-4"
            >
              <span className="text-sm font-semibold text-[var(--text)]">{link.label}</span>
              <span className="text-xs text-[var(--muted)]">{link.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
