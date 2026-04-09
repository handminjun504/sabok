"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="surface mx-auto max-w-lg space-y-4 p-6">
      <h2 className="text-lg font-bold text-[var(--text)]">대시보드를 불러오지 못했습니다</h2>
      <p className="text-sm text-[var(--muted)] leading-relaxed">
        서버에서 데이터를 가져오는 중 오류가 났습니다. PocketBase가 실행 중인지, 서버의{" "}
        <code className="rounded bg-[var(--surface-hover)] px-1 font-mono text-xs">POCKETBASE_URL</code> ·{" "}
        <code className="rounded bg-[var(--surface-hover)] px-1 font-mono text-xs">POCKETBASE_ADMIN_*</code> ·{" "}
        <code className="rounded bg-[var(--surface-hover)] px-1 font-mono text-xs">SESSION_SECRET</code>
        를 확인한 뒤 PM2 로그를 보세요.
      </p>
      {error.digest != null && (
        <p className="text-xs font-mono text-[var(--muted)]">Digest: {String(error.digest)}</p>
      )}
      <button type="button" onClick={() => reset()} className="btn btn-primary">
        다시 시도
      </button>
    </div>
  );
}
