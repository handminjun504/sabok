import type { NavIconKey } from "@/lib/dashboard-nav";

type Props = {
  icon: NavIconKey;
  className?: string;
};

/**
 * 사이드바용 단색 라인 아이콘 — 외부 의존성 없이 인라인 SVG 사용.
 * 모두 24×24 viewBox, 1.75 stroke. 활성 시 `currentColor` 가 `--accent` 로 바뀜.
 */
export function NavIcon({ icon, className = "h-[18px] w-[18px] shrink-0" }: Props) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3.5 11 12 4l8.5 7" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.25" />
          <path d="M3.5 19.5c.6-3 3-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
          <circle cx="16.5" cy="9" r="2.5" />
          <path d="M15 14.5c2.5 0 5 1.4 5.5 4" />
        </svg>
      );
    case "rules":
      return (
        <svg {...common}>
          <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
          <path d="M16 4v3h3" />
          <path d="M8 11h8M8 14h8M8 17h5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17" />
          <path d="M8 3v4M16 3v4" />
          <circle cx="8.5" cy="14" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="14" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="14" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "report":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 16V12M12 16V8M16 16v-5" />
        </svg>
      );
    case "report-tax":
      return (
        <svg {...common}>
          <path d="M5 3h10l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M15 3v4h4" />
          <path d="M9 12l3 3 3-3" />
          <path d="M12 9v6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.75" />
          <path d="M19.5 12c0-.6-.06-1.18-.18-1.74l1.7-1.32-1.5-2.6-2 .9a7.7 7.7 0 0 0-3-1.74L14 3.5h-3l-.5 2c-1.13.32-2.16.92-3 1.74l-2-.9-1.5 2.6 1.7 1.32A7.6 7.6 0 0 0 4.5 12c0 .6.06 1.18.18 1.74l-1.7 1.32 1.5 2.6 2-.9c.84.82 1.87 1.42 3 1.74l.5 2h3l.5-2a7.7 7.7 0 0 0 3-1.74l2 .9 1.5-2.6-1.7-1.32c.12-.56.18-1.14.18-1.74z" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common}>
          <path d="M5 3h10l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M15 3v4h4" />
          <path d="M8 11h8M8 14h8M8 17h5" />
          <circle cx="17.5" cy="17.5" r="2.5" />
          <path d="M19.3 19.3 21 21" />
        </svg>
      );
    case "tenant":
      return (
        <svg {...common}>
          <path d="M4 21V8l5-4 5 4v13" />
          <path d="M14 21V11h6v10" />
          <path d="M8 12v9M11 12v9M17 14v0M17 17v0" />
        </svg>
      );
    default:
      return null;
  }
}
