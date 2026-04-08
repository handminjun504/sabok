import { companySettingsByTenant, employeeCountByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import Link from "next/link";

export default async function DashboardHomePage() {
  const { tenantId } = await requireTenantContext();
  const [empCount, settings] = await Promise.all([
    employeeCountByTenant(tenantId),
    companySettingsByTenant(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도: <strong>{year}</strong> — 전사 설정에서 변경할 수 있습니다.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="surface p-5">
          <p className="text-sm text-[var(--muted)]">등록 직원</p>
          <p className="mt-2 text-3xl font-semibold">{empCount}</p>
          <Link href="/dashboard/employees" className="mt-3 inline-block text-sm text-[var(--accent)] hover:underline">
            직원 관리로 이동
          </Link>
        </div>
        <div className="surface p-5">
          <p className="text-sm text-[var(--muted)]">빠른 이동</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/dashboard/levels" className="text-[var(--accent)] hover:underline">
                레벨·정기 지급 금액
              </Link>
            </li>
            <li>
              <Link href="/dashboard/schedule" className="text-[var(--accent)] hover:underline">
                월별 지급 스케줄
              </Link>
            </li>
            <li>
              <Link href="/dashboard/salary-inclusion-report" className="text-[var(--accent)] hover:underline">
                급여포함신고
              </Link>
            </li>
            <li>
              <Link href="/dashboard/quarterly" className="text-[var(--accent)] hover:underline">
                분기 지원금
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
