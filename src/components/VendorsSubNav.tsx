import Link from "next/link";

type Tab = "list" | "contribute" | "onboard";

const tabClass = (active: Tab, key: Tab) =>
  "inline-block border-b-2 px-3 py-2.5 text-[0.9375rem] font-semibold transition-colors " +
  (active === key
    ? "border-[var(--accent)] text-[var(--accent)]"
    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]");

export function VendorsSubNav({
  active,
  showClientTenantOnboard = false,
}: {
  active: Tab;
  /** 플랫폼 관리자만: 고객사(테넌트) 등록 탭 */
  showClientTenantOnboard?: boolean;
}) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-[var(--border)]" aria-label="거래처·적립금·고객사">
      <Link href="/dashboard/vendors" className={tabClass(active, "list")}>
        거래처 등록
      </Link>
      <Link href="/dashboard/vendor-contributions" className={tabClass(active, "contribute")}>
        적립금 작성
      </Link>
      {showClientTenantOnboard ? (
        <Link href="/dashboard/vendors/onboard" className={tabClass(active, "onboard")}>
          고객사(업체) 등록
        </Link>
      ) : null}
    </nav>
  );
}
