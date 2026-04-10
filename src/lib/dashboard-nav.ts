import type { Role } from "@/lib/role";
import {
  canEditCompanySettings,
  canEditLevelRules,
  canTriggerGlSync,
} from "@/lib/permissions";
import { isSingleTenantMode } from "@/lib/single-tenant";

export type NavItem = { href: string; label: string };
export type NavGroup = { title: string; items: NavItem[] };

export function getDashboardNav(opts: {
  role: Role;
  isPlatformAdmin: boolean;
  hasActiveTenant: boolean;
}): NavGroup[] {
  const { role, isPlatformAdmin, hasActiveTenant } = opts;
  const single = isSingleTenantMode();
  const groups: NavGroup[] = [];

  const startItems: { href: string; label: string }[] = [{ href: "/dashboard", label: "대시보드" }];
  if (!single) {
    startItems.push({ href: "/dashboard/select-tenant", label: "업체 선택" });
  }
  groups.push({ title: "시작", items: startItems });

  if (isPlatformAdmin && !single) {
    groups.push({
      title: "플랫폼",
      items: [{ href: "/dashboard/tenants", label: "업체 관리" }],
    });
  }

  if (hasActiveTenant) {
    const work: NavItem[] = [{ href: "/dashboard/employees", label: "직원" }];
    if (canEditLevelRules(role)) {
      work.push({ href: "/dashboard/levels", label: "레벨·정기지급" });
    }
    work.push(
      { href: "/dashboard/quarterly", label: "분기 지원" },
      { href: "/dashboard/schedule", label: "월별 스케줄" },
      { href: "/dashboard/salary-inclusion-report", label: "급여포함신고" },
    );
    if (canEditCompanySettings(role)) {
      work.push(
        { href: "/dashboard/settings", label: "전사 설정" },
        { href: "/dashboard/vendors", label: "거래처" },
        { href: "/dashboard/vendor-contributions", label: "적립금 작성" },
      );
    }
    groups.push({ title: "업무", items: work });
  }

  if (isPlatformAdmin) {
    groups.push({
      title: "운영",
      items: [{ href: "/dashboard/audit", label: "감사 로그" }],
    });
  }

  if (hasActiveTenant && canTriggerGlSync(role)) {
    groups.push({
      title: "연동",
      items: [{ href: "/dashboard/gl", label: "GL 동기화" }],
    });
  }

  return groups;
}
