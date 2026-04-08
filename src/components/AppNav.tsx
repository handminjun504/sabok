import Link from "next/link";
import type { Role } from "@/lib/role";
import {
  canEditCompanySettings,
  canEditLevelRules,
  canTriggerGlSync,
} from "@/lib/permissions";
import { logoutAction } from "@/app/actions/auth";

type AppNavProps = {
  role: Role;
  isPlatformAdmin: boolean;
  hasActiveTenant: boolean;
  tenantName?: string | null;
  tenantCode?: string | null;
};

export function AppNav({
  role,
  isPlatformAdmin,
  hasActiveTenant,
  tenantName,
  tenantCode,
}: AppNavProps) {
  const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
    >
      {children}
    </Link>
  );

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
      <L href="/dashboard">대시보드</L>
      <L href="/dashboard/select-tenant">업체 선택</L>
      {isPlatformAdmin && <L href="/dashboard/tenants">업체 관리</L>}
      {hasActiveTenant && (
        <>
          <L href="/dashboard/employees">직원</L>
          {canEditLevelRules(role) && <L href="/dashboard/levels">레벨·정기지급</L>}
          <L href="/dashboard/quarterly">분기 지원</L>
          <L href="/dashboard/schedule">월별 스케줄</L>
          <L href="/dashboard/salary-inclusion-report">급여포함신고</L>
          {canEditCompanySettings(role) && <L href="/dashboard/settings">전사 설정</L>}
          {canEditCompanySettings(role) && <L href="/dashboard/vendors">거래처</L>}
        </>
      )}
      {isPlatformAdmin && <L href="/dashboard/users">사용자</L>}
      {isPlatformAdmin && <L href="/dashboard/audit">감사 로그</L>}
      {hasActiveTenant && canTriggerGlSync(role) && <L href="/dashboard/gl">GL 동기화</L>}
      {(tenantName || tenantCode) && (
        <span className="ml-2 text-xs text-[var(--muted)]">
          현재 업체: <strong className="text-[var(--text)]">{tenantName}</strong>
          {tenantCode ? ` (${tenantCode})` : ""}
        </span>
      )}
      <form action={logoutAction} className="ml-auto">
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm text-[var(--warn)] hover:underline"
        >
          로그아웃
        </button>
      </form>
    </nav>
  );
}
