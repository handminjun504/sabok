"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

type Tab = { label: string; content: React.ReactNode };

/**
 * 키보드 접근성:
 * - ←/→: 이전/다음 탭으로 포커스 이동(roving tabindex)
 * - Home/End: 처음/마지막 탭
 * - 활성 탭만 `tabIndex=0`, 나머지는 `-1`
 */
export function Tabs({ tabs, defaultTab = 0 }: { tabs: Tab[]; defaultTab?: number }) {
  const safeDefault = Math.max(0, Math.min(defaultTab, tabs.length - 1));
  const [active, setActive] = useState(safeDefault);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (i: number) => {
    const next = (i + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusTab(i + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusTab(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  };

  const activeTab = tabs[active];

  return (
    <div>
      <div
        className="flex overflow-x-auto border-b border-[var(--border)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {tabs.map((t, i) => {
          const tabId = `${baseId}-tab-${i}`;
          const panelId = `${baseId}-panel-${i}`;
          const isActive = active === i;
          return (
            <button
              key={tabId}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={
                "shrink-0 -mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors " +
                (isActive
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {activeTab ? (
        <div
          id={`${baseId}-panel-${active}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${active}`}
          className="pt-5"
        >
          {activeTab.content}
        </div>
      ) : null}
    </div>
  );
}
