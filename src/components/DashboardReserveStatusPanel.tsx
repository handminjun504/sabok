import type { TenantAdditionalReserveSummary } from "@/lib/domain/vendor-reserve";

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export function DashboardReserveStatusPanel({ summary }: { summary: TenantAdditionalReserveSummary }) {
  if (summary.kind === "NO_VENDORS") {
    return (
      <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-status-heading">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--accent)]"
            style={{ background: "var(--accent-soft)" }}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l2.5 2.5" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="reserve-status-heading" className="text-sm font-bold text-[var(--text)]">
              출연처 미등록
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
              법인은 사업주가 기금에 출연할 때 지출액의{" "}
              <strong className="text-[var(--text)]">20%를 추가로 적립</strong>해야 하며, 자본금의 50%에 도달하면 추가 적립이 끝납니다.
              거래처 메뉴에서 출연처를 등록하고 출연 금액을 입력하면 여기서 진행 현황을 볼 수 있습니다.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (summary.kind === "INDIVIDUAL") {
    return (
      <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-status-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="reserve-status-heading" className="text-sm font-bold text-[var(--text)]">
            추가 적립(출연) 누적
          </h2>
          <span className="badge badge-accent">개인 — 항상 +20% 적립</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          개인사업자는 출연 시{" "}
          <strong className="text-[var(--text)]">항상 지출액의 20%가 추가 적립</strong>됩니다. 법인처럼 자본금 50%
          누적 한도가 없어 누적만 표시합니다.
        </p>
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-4">
          <p className="dash-eyebrow">누적 추가 적립</p>
          <p className="mt-1.5 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--accent)]">
            {fmt(summary.accumulatedTotalWon)}<span className="ml-1 text-base font-bold text-[var(--muted)]">원</span>
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">활성 출연처 {summary.activeVendorCount}곳 합산</p>
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
        <p className="mt-3 text-xs text-[var(--warn)]">
          본사 자본금(거래처 등록 정보) 또는 출연처 사업장 자본금이 없어 50% 한도를 계산할 수 없습니다. 값을 넣으면 적립 완료 여부를 표시합니다.
        </p>
      ) : null}
    </section>
  );
}
