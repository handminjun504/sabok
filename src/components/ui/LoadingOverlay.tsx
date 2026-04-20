type Props = {
  /** 표시 여부 — 부모가 제어 */
  visible: boolean;
  label?: string;
  hint?: string;
};

/**
 * 폼 저장·일괄 작업 중 화면 잠금 + 스피너 표시.
 * `role="status"` + `aria-live="polite"` 로 스크린리더에도 안내된다.
 */
export function LoadingOverlay({ visible, label = "처리 중입니다…", hint }: Props) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[color:var(--text)]/15 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="surface flex max-w-sm flex-col items-center gap-3 rounded-xl px-8 py-6 shadow-lg">
        <span className="spinner spinner-lg" aria-hidden />
        <p className="text-sm font-medium text-[var(--text)]">{label}</p>
        {hint ? <p className="text-center text-xs text-[var(--muted)]">{hint}</p> : null}
      </div>
    </div>
  );
}
