import type { Role } from "@/lib/role";
import { canEditCompanySettings, canTriggerGlSync } from "@/lib/permissions";
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

  /** 활성 업체 없음: 일반 사용자는 네비 없음. 플랫폼 관리자만 최소 메뉴(거래처 추가·삭제는 선택 화면에서). */
  if (!hasActiveTenant) {
    if (isPlatformAdmin && !single) {
      return [
        {
          title: "시작",
          items: [
            { href: "/dashboard/select-tenant", label: "거래처 선택" },
            { href: "/dashboard/audit", label: "감사 로그" },
          ],
        },
      ];
    }
    return [];
  }

  /**
   * 업체 입장 후 사이드바 — 메뉴를 세 그룹으로 단순화.
   * - 시작: 홈·보고
   * - 업무: 직원/지급 규칙(분기 요율·대상자 포함)/월별 스케줄/급여포함신고
   * - 관리: 전사 설정·감사 로그·GL 동기화 (권한 있는 항목만)
   * (분기 지원 메뉴는 '지급 규칙' 페이지 탭으로 흡수되었음 — 중복 메뉴 제거)
   */
  const startItems: NavItem[] = [
    { href: "/dashboard", label: "대시보드" },
    { href: "/dashboard/operating-report", label: "운영상황 보고" },
  ];
  groups.push({ title: "시작", items: startItems });

  const work: NavItem[] = [{ href: "/dashboard/employees", label: "직원" }];
  work.push(
    { href: "/dashboard/rules", label: "지급 규칙" },
    { href: "/dashboard/schedule", label: "월별 스케줄" },
    { href: "/dashboard/salary-inclusion-report", label: "급여포함신고" },
  );
  groups.push({ title: "업무", items: work });

  const manage: NavItem[] = [];
  if (canEditCompanySettings(role)) {
    manage.push({ href: "/dashboard/settings", label: "전사 설정" });
  }
  if (isPlatformAdmin) {
    manage.push({ href: "/dashboard/audit", label: "감사 로그" });
  }
  if (canTriggerGlSync(role)) {
    manage.push({ href: "/dashboard/gl", label: "GL 동기화" });
  }
  if (manage.length > 0) {
    groups.push({ title: "관리", items: manage });
  }

  return groups;
}
