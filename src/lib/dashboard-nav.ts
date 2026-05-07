import type { Role } from "@/lib/role";
import { canEditCompanySettings } from "@/lib/permissions";
import { isSingleTenantMode } from "@/lib/single-tenant";

/**
 * 사이드바 아이콘 키 — `NavIcon` 컴포넌트가 매핑한다.
 * 의존성을 줄이기 위해 외부 아이콘 라이브러리 대신 자체 SVG 사용.
 */
export type NavIconKey =
  | "home"
  | "users"
  | "rules"
  | "calendar"
  | "report"
  | "report-tax"
  | "settings"
  | "audit"
  | "tenant";

export type NavItem = { href: string; label: string; icon: NavIconKey };
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
          title: "플랫폼",
          items: [
            { href: "/dashboard/select-tenant", label: "거래처 선택", icon: "tenant" },
            { href: "/dashboard/audit", label: "감사 로그", icon: "audit" },
          ],
        },
      ];
    }
    return [];
  }

  /**
   * 업체 입장 후 사이드바 — **그룹 2개**만 사용한다.
   * - 업무: 실무 화면을 업무 순서(홈 → 인원 → 규칙 → 스케줄 → 보고 → 신고)로 배열.
   * - 관리: 전사 설정·감사·GL (권한 있는 항목만).
   *
   * 분기 지원 단독 메뉴는 없음 — `/dashboard/rules` 탭에 통합. 예전 URL(`/quarterly` 등)은 redirect 로 유지.
   */
  const workItems: NavItem[] = [
    { href: "/dashboard", label: "대시보드", icon: "home" },
    { href: "/dashboard/employees", label: "직원", icon: "users" },
    { href: "/dashboard/rules", label: "지급 규칙", icon: "rules" },
    { href: "/dashboard/schedule", label: "월별 스케줄", icon: "calendar" },
    { href: "/dashboard/operating-report", label: "운영 보고", icon: "report" },
    { href: "/dashboard/salary-inclusion-report", label: "급여 포함 신고", icon: "report-tax" },
  ];
  groups.push({ title: "업무", items: workItems });

  const manage: NavItem[] = [];
  if (canEditCompanySettings(role)) {
    manage.push({ href: "/dashboard/settings", label: "전사 설정", icon: "settings" });
  }
  if (isPlatformAdmin) {
    manage.push({ href: "/dashboard/audit", label: "감사 로그", icon: "audit" });
  }

  if (manage.length > 0) {
    groups.push({ title: "관리", items: manage });
  }

  return groups;
}
