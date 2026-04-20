import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  /** 작은 아이콘 자리(이모지·svg 모두 가능) */
  icon?: ReactNode;
};

/**
 * “데이터가 없습니다” 상태를 통일된 톤으로 표현.
 * 대시보드 어디서든 같은 모양 → 사용자가 패턴을 학습하기 쉽다.
 */
export function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="surface-sunken flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-[var(--surface)] text-2xl text-[var(--muted)]">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-[var(--text)]">{title}</p>
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-[var(--muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
