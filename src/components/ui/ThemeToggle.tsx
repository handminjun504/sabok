"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";

const STORAGE_KEY = "sabok-theme";

function applyTheme(mode: Mode): void {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
}

function readStored(): Mode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

/**
 * 테마 토글 — 시스템/라이트/다크 3-state 토글.
 * - 첫 로드 시 저장된 선호도를 즉시 적용
 * - 저장하지 않으면 OS 설정(prefers-color-scheme)을 자동으로 따라감
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = readStored();
    setMode(stored);
    applyTheme(stored);
  }, []);

  function cycle() {
    const next: Mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
    applyTheme(next);
    if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  }

  /** SSR 시 모드 표기 깜빡임을 피하려고 마운트 후에만 라벨을 그린다. */
  const label = !mounted
    ? "테마"
    : mode === "system"
      ? "시스템 테마"
      : mode === "light"
        ? "라이트 테마"
        : "다크 테마";
  const symbol = !mounted ? "◑" : mode === "system" ? "◑" : mode === "light" ? "☀" : "☾";

  return (
    <button
      type="button"
      onClick={cycle}
      className={`btn btn-ghost h-9 px-2.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] ${className}`}
      aria-label={`${label} (클릭으로 전환)`}
      title={label}
    >
      <span aria-hidden>{symbol}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
