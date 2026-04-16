"use client";

import { useState } from "react";

type Tab = { label: string; content: React.ReactNode };

export function Tabs({ tabs, defaultTab = 0 }: { tabs: Tab[]; defaultTab?: number }) {
  const [active, setActive] = useState(defaultTab);

  return (
    <div>
      <div
        className="flex overflow-x-auto border-b border-[var(--border)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={
              "shrink-0 -mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors " +
              (active === i
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-5">{tabs[active].content}</div>
    </div>
  );
}
