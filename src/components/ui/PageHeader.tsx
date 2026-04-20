import type { ReactNode } from "react";

type Props = {
  /** 작은 라벨 (예: "업무 홈") */
  eyebrow?: string;
  /** 페이지 타이틀 */
  title: string;
  /** 설명 한 줄 */
  description?: string;
  /** 우측 액션 영역(버튼·필터 등) */
  actions?: ReactNode;
  /** 타이틀 아래 메타 정보 (trust-pill 등) */
  meta?: ReactNode;
};

/**
 * 페이지 상단 헤더 — 모든 대시보드 페이지에서 동일한 시각 톤 유지.
 * `actions` 영역은 모바일에서는 타이틀 아래로 자연스럽게 흐른다.
 */
export function PageHeader({ eyebrow, title, description, actions, meta }: Props) {
  return (
    <header className="page-header">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
          <h1 className="page-hero-title mt-2 neu-title-gradient">{title}</h1>
          {description ? <p className="page-hero-sub">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
    </header>
  );
}
