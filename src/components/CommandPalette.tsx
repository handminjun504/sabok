"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavIcon } from "@/components/ui/NavIcon";
import type { NavIconKey } from "@/lib/dashboard-nav";

export type CommandItem = {
  label: string;
  href: string;
  group: string;
  icon: NavIconKey;
};

/**
 * ⌘K / Ctrl+K 커맨드 팔레트 — 메뉴가 많아질수록 길찾기 비용이 커지는 문제를 해소한다.
 * 사이드바 의존 없이 어디서든 키 한 번으로 모든 화면에 도달.
 *  - 한글 부분일치 검색
 *  - ↑/↓ 이동, Enter 이동, Esc/배경 클릭 닫기
 */
export function CommandPalette({ items }: { items: CommandItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q));
  }, [items, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  /** 전역 단축키: ⌘K / Ctrl+K 토글 + 외부 트리거(사이드바 버튼) 이벤트 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  /** 열릴 때 입력 포커스 + 본문 스크롤 잠금 */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  /** 활성 항목이 보이도록 스크롤 */
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[active];
      if (it) go(it.href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="빠른 이동"
    >
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 bg-[color:var(--text)]/30 backdrop-blur-[2px]"
        onClick={close}
      />
      <div className="surface-prominent relative w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-[var(--muted)]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="화면 검색 — 예: 직원, 스케줄, 설정"
            className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
            aria-label="화면 검색"
          />
          <kbd className="hidden shrink-0 rounded border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)] sm:inline">
            ESC
          </kbd>
        </div>

        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">검색 결과가 없습니다.</li>
          ) : (
            filtered.map((it, i) => {
              const isActive = i === active;
              return (
                <li key={it.href} data-idx={i} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(it.href)}
                    className={
                      "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm transition-colors " +
                      (isActive
                        ? "bg-[var(--accent-soft)] text-[var(--accent-dim)]"
                        : "text-[var(--text)] hover:bg-[var(--surface-hover)]")
                    }
                  >
                    <NavIcon icon={it.icon} className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate font-medium">{it.label}</span>
                    <span className="shrink-0 text-[11px] text-[var(--muted)]">{it.group}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
