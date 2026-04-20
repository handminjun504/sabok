"use client";

import { useId, useState, type ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  /** true면 처음부터 펼침(신규 작성 등) */
  defaultOpen?: boolean;
  triggerLabel?: string;
  closeLabel?: string;
  /** 접혀 있을 때만 표시(요약 한 줄 등) */
  summary?: ReactNode;
  children: ReactNode;
};

/**
 * 작성·수정 폼을 기본으로 접어 두고, 클릭 시 펼치는 패턴.
 */
export function CollapsibleEditorPanel({
  title,
  description,
  defaultOpen = false,
  triggerLabel = "입력·수정 열기",
  closeLabel = "접기",
  summary,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const panelId = `${baseId}-panel`;

  return (
    <section className="surface overflow-hidden" aria-labelledby={titleId}>
      <div className="dash-panel-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-hover)]/50">
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-sm font-semibold leading-snug tracking-normal text-[var(--text)]">
            {title}
          </p>
          {description ? <p className="mt-1 text-xs leading-snug tracking-normal text-[var(--muted)]">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn btn-outline shrink-0 text-xs"
          aria-expanded={open}
          aria-controls={panelId}
        >
          {open ? closeLabel : triggerLabel}
        </button>
      </div>
      {!open && summary ? (
        <div className="dash-panel-pad border-b border-[var(--border)]">{summary}</div>
      ) : null}
      <div id={panelId} hidden={!open} className={open ? "dash-panel-pad" : undefined}>
        {open ? children : null}
      </div>
    </section>
  );
}
