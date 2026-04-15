"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="surface mx-auto max-w-lg space-y-5 p-6 sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-[var(--text)]">대시보드를 불러오지 못했습니다</h2>
      <p className="text-[0.9375rem] leading-relaxed text-[var(--muted)]">
        서버에서 데이터를 가져오는 중 오류가 났습니다. PocketBase가 실행 중인지, 서버의{" "}
        <code className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 font-mono text-[0.8125rem] text-[var(--text)]">
          POCKETBASE_URL
        </code>{" "}
        ·{" "}
        <code className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 font-mono text-[0.8125rem] text-[var(--text)]">
          POCKETBASE_ADMIN_*
        </code>{" "}
        ·{" "}
        <code className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 font-mono text-[0.8125rem] text-[var(--text)]">
          SESSION_SECRET
        </code>
        를 확인한 뒤 PM2 로그를 보세요.
      </p>
      {error.message ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]/50 p-3">
          <p className="mb-1 text-xs font-semibold text-[var(--muted)]">서버 메시지 (원인 파악용)</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--text)]">
            {error.message.length > 1200 ? `${error.message.slice(0, 1200)}…` : error.message}
          </pre>
        </div>
      ) : null}
      {error.digest != null && (
        <p className="font-mono text-sm text-[var(--muted)]">Digest: {String(error.digest)}</p>
      )}
      <button type="button" onClick={() => reset()} className="btn btn-primary">
        다시 시도
      </button>
    </div>
  );
}
