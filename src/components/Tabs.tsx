"use client";

import { useState } from "react";

type Tab = { label: string; content: React.ReactNode };

export function Tabs({ tabs, defaultTab = 0 }: { tabs: Tab[]; defaultTab?: number }) {
  const [active, setActive] = useState(defaultTab);

  return (
    <div>
      <div className="flex gap-0 border-b border-[var(--border)]">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors " +
              (active === i
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]")
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
