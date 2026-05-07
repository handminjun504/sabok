"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import type { NavGroup } from "@/lib/dashboard-nav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NavIcon } from "@/components/ui/NavIcon";

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
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="대시보드 내비게이션">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="dash-eyebrow mb-2 px-3">{g.title}</p>
          <ul className="flex flex-col gap-1">
            {g.items.map((item) => {
              const active = navLinkActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={"neu-nav-link " + (active ? "neu-nav-link-active" : "")}
                  >
                    <NavIcon icon={item.icon} />
                    <span className="truncate">{item.label}</span>
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

function LogoutButton({ block = false }: { block?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={
          "btn btn-ghost text-sm text-[var(--muted)] hover:text-[var(--danger)] " +
          (block ? "w-full justify-center" : "")
        }
      >
        로그아웃
      </button>
    </form>
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

  /** 모바일 드로어 열렸을 때 본문 스크롤 잠금 + Esc 로 닫기 */
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  if (pickerOnly) {
    return (
      <div className="min-h-screen bg-transparent">
        <a href="#main-content" className="skip-link">
          본문으로 건너뛰기
        </a>
        <header className="neu-topbar sticky top-0 z-30 mx-auto flex w-full max-w-[var(--content-max)] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="dash-eyebrow">거래처 선택</p>
            <p className="neu-title-gradient mt-1 text-base font-bold tracking-tight">사내근로복지기금</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              업체를 고르면 직원·지급·설정 메뉴가 열립니다.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-transparent">
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>

      {/* 데스크톱 사이드바 */}
      <aside className="sticky top-0 z-20 hidden h-screen w-[var(--sidebar-w)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0 group" aria-label="대시보드 홈">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-white text-sm font-black shadow-sm transition-transform group-hover:scale-105"
                style={{ background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)" }}
              >
                SB
              </span>
              <span className="flex flex-col min-w-0">
                <span className="font-black text-[15px] text-[var(--text)] tracking-tight leading-none">SABOK</span>
                <span className="mt-0.5 text-[10px] text-[var(--muted)] leading-none tracking-wider uppercase">
                  사내근로복지기금
                </span>
              </span>
            </Link>
            <ThemeToggle />
          </div>
          {tenantLine ? (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <NavIcon icon="tenant" className="h-4 w-4 mt-0.5 shrink-0 text-[var(--accent)]" />
                <p className="line-clamp-3 text-[12px] leading-snug text-[var(--text)] font-medium">{tenantLine}</p>
              </div>
              {showTenantSwitch ? (
                <Link href="/dashboard/select-tenant" className="btn btn-secondary w-full justify-center text-xs h-8">
                  거래처 전환
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="border-t border-[var(--border)]" />
        <NavBody groups={groups} pathname={pathname} />
        <div className="border-t border-[var(--border)] p-3">
          <LogoutButton block />
        </div>
      </aside>

      {/* 모바일 상단 바 */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:hidden">
          <button
            type="button"
            className="btn btn-outline h-10 px-3 text-sm"
            aria-expanded={mobileOpen}
            aria-controls="mobile-drawer"
            aria-label="메뉴 열기"
            onClick={() => setMobileOpen(true)}
          >
            <span aria-hidden>☰</span>
            <span>메뉴</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="neu-title-gradient truncate text-base font-semibold">사내근로복지기금</p>
            {tenantLine ? <p className="truncate text-sm text-[var(--muted)]">{tenantLine}</p> : null}
          </div>
          <ThemeToggle />
          {showTenantSwitch ? (
            <Link
              href="/dashboard/select-tenant"
              className="btn btn-secondary shrink-0 h-10 text-sm"
            >
              전환
            </Link>
          ) : null}
        </header>

        {mobileOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-[color:var(--text)]/40 backdrop-blur-[2px] md:hidden"
              aria-label="메뉴 닫기"
              onClick={() => setMobileOpen(false)}
            />
            <div
              id="mobile-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="대시보드 메뉴"
              className="neu-drawer fixed inset-y-3 left-0 z-50 flex w-[min(18rem,88vw)] flex-col md:hidden"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="neu-title-gradient text-base font-semibold">메뉴</span>
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
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
                    className="btn btn-secondary w-full justify-center text-sm"
                  >
                    다른 거래처로 전환
                  </Link>
                </div>
              ) : null}
              <NavBody groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              <div className="border-t border-[var(--border)] p-3">
                <LogoutButton block />
              </div>
            </div>
          </>
        ) : null}

        <main
          id="main-content"
          className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
