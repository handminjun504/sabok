"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import type { NavGroup } from "@/lib/dashboard-nav";

function navLinkActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  groups: NavGroup[];
  tenantLine: string | null;
  /** 세션에 잡힌 업체가 있고 PB에서 조회됨 */
  hasActiveTenant: boolean;
  isPlatformAdmin: boolean;
  /** 다중 업체 모드에서만 사이드바에 업체 전환 버튼 표시 */
  showTenantSwitch: boolean;
  children: React.ReactNode;
};

function NavBody({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-2 px-2 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            {g.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = navLinkActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={
                      "neu-nav-link " +
                      (active
                        ? "neu-nav-link-active"
                        : "font-normal text-[var(--muted)]")
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DashboardShell({
  groups,
  tenantLine,
  hasActiveTenant,
  isPlatformAdmin,
  showTenantSwitch,
  children,
}: Props) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  /** 업체 미선택 일반 사용자: 업체 선택 화면만(사이드 메뉴 없음) */
  const pickerOnly = !hasActiveTenant && !isPlatformAdmin;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (pickerOnly) {
    return (
      <div className="min-h-screen bg-transparent">
        <header className="neu-topbar sticky top-0 z-30 mx-auto flex w-full max-w-[var(--content-max)] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">거래처 선택</p>
            <p className="neu-title-gradient mt-1 text-base font-bold tracking-tight">사내근로복지기금</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">업체를 고르면 직원·지급·설정 메뉴가 열립니다.</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="neu-field shrink-0 rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium text-[var(--muted)] transition-colors hover:text-[var(--danger)]"
            >
              로그아웃
            </button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-10 sm:px-6 sm:py-12 lg:px-10">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-transparent">
      {/* 데스크톱 사이드바 */}
      <aside className="neu-sidebar sticky top-3 z-20 mx-3 hidden h-[calc(100vh-1.5rem)] w-[var(--sidebar-w)] shrink-0 flex-col md:flex">
        <div className="px-4 py-4">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">SABOK</p>
          <p className="neu-title-gradient mt-1 text-base font-bold tracking-tight">사내근로복지기금</p>
          {tenantLine ? (
            <div className="mt-3 space-y-2 rounded-xl border border-[var(--accent-soft)] bg-[var(--accent-soft)]/40 px-3 py-2.5">
              <p className="line-clamp-3 text-xs font-medium leading-snug text-[var(--text)]">{tenantLine}</p>
              {showTenantSwitch ? (
                <Link
                  href="/dashboard/select-tenant"
                  className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center text-xs font-semibold text-[var(--accent)] shadow-sm transition-colors hover:bg-[var(--surface-hover)]"
                >
                  다른 거래처로 전환
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <NavBody groups={groups} pathname={pathname} />
        <form action={logoutAction} className="mt-auto p-3">
          <button
            type="submit"
            className="neu-field w-full rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium text-[var(--muted)] transition-colors hover:text-[var(--danger)]"
          >
            로그아웃
          </button>
        </form>
      </aside>

      {/* 모바일 상단 바 */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="neu-topbar sticky top-3 z-30 mx-3 mt-3 flex items-center gap-3 px-3 py-2.5 md:hidden">
          <button
            type="button"
            className="neu-field rounded-xl px-2.5 py-2 text-[0.9375rem] text-[var(--muted)] hover:text-[var(--text)]"
            aria-expanded={mobileOpen}
            aria-label="메뉴 열기"
            onClick={() => setMobileOpen(true)}
          >
            ☰ 메뉴
          </button>
          <div className="min-w-0 flex-1">
            <p className="neu-title-gradient truncate text-base font-semibold">사내근로복지기금</p>
            {tenantLine ? <p className="truncate text-sm text-[var(--muted)]">{tenantLine}</p> : null}
          </div>
          {showTenantSwitch ? (
            <Link
              href="/dashboard/select-tenant"
              className="neu-field shrink-0 rounded-xl px-2.5 py-2 text-sm font-semibold text-[var(--accent)]"
            >
              거래처 전환
            </Link>
          ) : null}
        </header>

        {mobileOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
              aria-label="메뉴 닫기"
              onClick={() => setMobileOpen(false)}
            />
            <div className="neu-drawer fixed inset-y-3 left-0 z-50 flex w-[min(18rem,88vw)] flex-col md:hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="neu-title-gradient text-base font-semibold">메뉴</span>
                <button
                  type="button"
                  className="neu-field rounded-lg px-2 py-1 text-sm text-[var(--muted)]"
                  onClick={() => setMobileOpen(false)}
                >
                  닫기
                </button>
              </div>
              {showTenantSwitch ? (
                <div className="border-b border-[var(--border)] px-3 pb-3">
                  <Link
                    href="/dashboard/select-tenant"
                    onClick={() => setMobileOpen(false)}
                    className="flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2.5 text-sm font-semibold text-[var(--accent)]"
                  >
                    다른 거래처로 전환
                  </Link>
                </div>
              ) : null}
              <NavBody groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              <form action={logoutAction} className="mt-auto p-3">
                <button
                  type="submit"
                  className="neu-field w-full rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  로그아웃
                </button>
              </form>
            </div>
          </>
        ) : null}

        <main className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
