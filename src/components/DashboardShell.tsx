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
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
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
                      "block rounded-md px-3 py-2 text-sm transition-colors " +
                      (active
                        ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                        : "font-normal text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]")
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

export function DashboardShell({ groups, tenantLine, children }: Props) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      {/* 데스크톱 사이드바 */}
      <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-w)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <p className="text-sm font-bold text-[var(--text)] tracking-tight">사내근로복지기금</p>
          {tenantLine ? (
            <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)] leading-relaxed">{tenantLine}</p>
          ) : null}
        </div>
        <NavBody groups={groups} pathname={pathname} />
        <form action={logoutAction} className="border-t border-[var(--border)] p-3">
          <button
            type="submit"
            className="w-full rounded-md px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-red-50 hover:text-[var(--danger)]"
          >
            로그아웃
          </button>
        </form>
      </aside>

      {/* 모바일 상단 바 */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 md:hidden">
          <button
            type="button"
            className="rounded-md px-2.5 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            aria-expanded={mobileOpen}
            aria-label="메뉴 열기"
            onClick={() => setMobileOpen(true)}
          >
            ☰ 메뉴
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text)]">사내근로복지기금</p>
            {tenantLine ? <p className="truncate text-xs text-[var(--muted)]">{tenantLine}</p> : null}
          </div>
        </header>

        {mobileOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
              aria-label="메뉴 닫기"
              onClick={() => setMobileOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-xl md:hidden">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <span className="text-sm font-semibold text-[var(--text)]">메뉴</span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                  onClick={() => setMobileOpen(false)}
                >
                  닫기
                </button>
              </div>
              <NavBody groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              <form action={logoutAction} className="border-t border-[var(--border)] p-3">
                <button
                  type="submit"
                  className="w-full rounded-md px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-red-50 hover:text-[var(--danger)]"
                >
                  로그아웃
                </button>
              </form>
            </div>
          </>
        ) : null}

        <main className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
