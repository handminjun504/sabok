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

  /** 업체 입장 후: 사이드바에는 대시보드만(다른 거래처는 상단「다른 거래처로 전환」). */
  const startItems: NavItem[] = [
    { href: "/dashboard", label: "대시보드" },
    { href: "/dashboard/operating-report", label: "운영상황 보고" },
  ];
  groups.push({ title: "시작", items: startItems });

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
      /** 출연처(기금 출연 상대) + 적립금 — 거래처(업체) 자체는 선택 화면에서 등록 */
      { href: "/dashboard/vendor-contributions", label: "출연·적립" },
    );
  }
  groups.push({ title: "업무", items: work });

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
