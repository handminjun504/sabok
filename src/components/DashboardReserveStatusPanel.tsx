import type { TenantAdditionalReserveSummary } from "@/lib/domain/vendor-reserve";

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export function DashboardReserveStatusPanel({ summary }: { summary: TenantAdditionalReserveSummary }) {
  if (summary.kind === "NO_VENDORS") {
    return (
      <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-status-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="reserve-status-heading" className="text-sm font-bold text-[var(--text)]">
            적립금 미입력
          </h2>
          <span className="text-xs text-[var(--muted)]">
            <strong className="text-[var(--text)]">설정 ▸ 적립금</strong>에서 입력
          </span>
        </div>
      </section>
    );
  }

  if (summary.kind === "INDIVIDUAL") {
    return (
      <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-status-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="reserve-status-heading" className="text-sm font-bold text-[var(--text)]">
            추가 적립 누적
          </h2>
          <span className="badge badge-accent">개인 · 한도 없음</span>
        </div>
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-4">
          <p className="dash-eyebrow">누적</p>
          <p className="mt-1.5 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--accent)]">
            {fmt(summary.accumulatedTotalWon)}<span className="ml-1 text-base font-bold text-[var(--muted)]">원</span>
          </p>
        </div>
      </section>
    );
  }

  const progress = summary.cannotAssess
    ? 0
    : summary.capWon > 0
      ? Math.min(100, Math.round((summary.accumulatedTotalWon / summary.capWon) * 100))
      : 0;

  const badge = summary.cannotAssess ? (
    <span className="badge badge-neutral">한도 산정 불가</span>
  ) : summary.isComplete ? (
    <span className="badge badge-success">적립 완료</span>
  ) : (
    <span className="badge badge-warn">적립 진행 중 · {progress}%</span>
  );

  return (
    <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-status-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reserve-status-heading" className="text-sm font-bold text-[var(--text)]">
          법인 자본금 50% 한도
        </h2>
        {badge}
      </div>

      {/* 진행 게이지 */}
      {!summary.cannotAssess ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-xs text-[var(--muted)]">
              <span className="font-bold tabular-nums text-[var(--accent)]">{fmt(summary.accumulatedTotalWon)}</span>
              <span className="mx-1">/</span>
              <span className="tabular-nums">{fmt(summary.capWon)}</span>
              <span className="ml-1">원</span>
            </span>
            <span className="text-xs font-bold tabular-nums text-[var(--text)]">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] border border-[var(--border)]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: summary.isComplete
                  ? "var(--success)"
                  : "linear-gradient(90deg, var(--accent) 0%, var(--accent-dim) 100%)",
              }}
            />
          </div>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <dt className="dash-eyebrow">기준 자본금</dt>
          <dd className="mt-1 font-bold tabular-nums text-[var(--text)]">{fmt(summary.capitalWon)}원</dd>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <dt className="dash-eyebrow">남은 한도</dt>
          <dd className="mt-1 font-bold tabular-nums text-[var(--text)]">
            {summary.cannotAssess ? "—" : `${fmt(summary.remainingWon)}원`}
          </dd>
        </div>
      </dl>

      {summary.cannotAssess ? (
        <p className="mt-3 text-xs text-[var(--warn)]">자본금 미입력 — 한도 계산 불가</p>
      ) : null}
    </section>
  );
}
