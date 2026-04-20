import type { ReactNode } from "react";

type Tone = "info" | "success" | "warn" | "danger";

type Props = {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  /** `role="alert"` 부여(긴급 메시지). 기본은 `role="status"`. */
  assertive?: boolean;
};

const toneStyles: Record<Tone, string> = {
  info: "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)]",
  success:
    "border-[color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color:var(--success-soft)] text-[color:var(--success)]",
  warn:
    "border-[color:color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[color:var(--warn-soft)] text-[color:var(--warn)]",
  danger:
    "border-[color:color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
};

/** 액션 결과·검증 메시지 — 4가지 톤 한 컴포넌트로 통일. */
export function Alert({ tone = "info", title, children, assertive = false }: Props) {
  return (
    <div
      role={assertive ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${toneStyles[tone]}`}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1 text-[var(--text)]" : undefined}>{children}</div> : null}
    </div>
  );
}
