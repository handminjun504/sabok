import Link from "next/link";

type Tab = "list" | "contribute";

const tabClass = (active: Tab, key: Tab) =>
  "inline-block border-b-2 px-3 py-2.5 text-[0.9375rem] font-semibold transition-colors " +
  (active === key
    ? "border-[var(--accent)] text-[var(--accent)]"
    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]");

export function VendorsSubNav({ active }: { active: Tab }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-[var(--border)]" aria-label="출연·적립">
      <Link href="/dashboard/vendors" className={tabClass(active, "list")}>
        출연처
      </Link>
      <Link href="/dashboard/vendor-contributions" className={tabClass(active, "contribute")}>
        적립금
      </Link>
    </nav>
  );
}
