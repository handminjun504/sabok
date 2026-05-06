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
      {/**
       * 접어도 자식(폼)을 언마운트하지 않는다 — PB 에 컬럼이 없어 저장이 무시된 것처럼 보이는 문제와 별개로,
       * 펼침/접힘 사이에 입력값이 사라지거나 일부 브라우저에서 제출 필드가 빠지는 것을 막는다.
       */}
      <div id={panelId} className={open ? "dash-panel-pad" : "hidden"}>
        {children}
      </div>
    </section>
  );
}
