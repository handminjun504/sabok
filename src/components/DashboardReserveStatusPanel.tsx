import type { TenantAdditionalReserveSummary } from "@/lib/domain/vendor-reserve";

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export function DashboardReserveStatusPanel({ summary }: { summary: TenantAdditionalReserveSummary }) {
  if (summary.kind === "NO_VENDORS") {
    return (
      <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-status-heading">
        <h2 id="reserve-status-heading" className="text-sm font-bold text-[var(--text)]">
          추가 적립(출연) 누적
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          활성 출연(위탁) 거래처가 없어 적립 완료 여부를 표시할 수 없습니다. 출연처를 두고 출연 금액을 반영하면
          여기서 법인 자본금의 50% 한도 대비 누적 추가 적립을 볼 수 있습니다.
        </p>
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
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          개인사업자는 출연 시{" "}
          <strong className="text-[var(--text)]">항상 지출액의 20%가 추가 적립</strong>됩니다. 법인처럼 자본금 50%
          누적 한도가 없어 “적립 진행” 메모를 따로 적어 둘 필요가 없습니다 — 누적만 표시합니다.
        </p>
        <p className="mt-3 text-lg font-bold tabular-nums text-[var(--text)]">
          누적 추가 적립 합 <span className="text-[var(--accent)]">{fmt(summary.accumulatedTotalWon)}</span>원
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">활성 출연처 {summary.activeVendorCount}곳 합산</p>
      </section>
    );
  }

  const badge = summary.cannotAssess ? (
    <span className="rounded-full border border-[var(--border)] bg-[var(--surface-hover)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">
      한도 산정 불가
    </span>
  ) : summary.isComplete ? (
    <span className="rounded-full border border-[var(--success)]/40 bg-[var(--success)]/15 px-2.5 py-0.5 text-xs font-semibold text-[var(--success)]">
      적립 완료
    </span>
  ) : (
    <span className="rounded-full border border-[var(--warn)]/50 bg-[var(--warn)]/15 px-2.5 py-0.5 text-xs font-semibold text-[var(--warn)]">
      적립 진행 중
    </span>
  );

  return (
    <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-status-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reserve-status-heading" className="text-sm font-bold text-[var(--text)]">
          추가 적립(출연) — 법인 한도
        </h2>
        {badge}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        출연 시 추가 적립 누적이 자본금의 50%에 도달했는지 표시합니다. 본사 자본금이 있으면 그 값을, 없으면
        활성 출연처 중 가장 큰 사업장 자본금을 사용합니다(출연 등록 로직과 동일).
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <dt className="dash-eyebrow">기준 자본금</dt>
          <dd className="mt-1 font-bold tabular-nums text-[var(--text)]">{fmt(summary.capitalWon)}원</dd>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <dt className="dash-eyebrow">추가 적립 상한(50%)</dt>
          <dd className="mt-1 font-bold tabular-nums text-[var(--text)]">{fmt(summary.capWon)}원</dd>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <dt className="dash-eyebrow">누적 추가 적립 합</dt>
          <dd className="mt-1 font-bold tabular-nums text-[var(--accent)]">{fmt(summary.accumulatedTotalWon)}원</dd>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <dt className="dash-eyebrow">남은 한도</dt>
          <dd className="mt-1 font-bold tabular-nums text-[var(--text)]">
            {summary.cannotAssess ? "—" : `${fmt(summary.remainingWon)}원`}
          </dd>
        </div>
      </dl>
      {summary.cannotAssess ? (
        <p className="mt-3 text-xs text-[var(--warn)]">
          본사 자본금(거래처 등록 정보) 또는 출연처 사업장 자본금이 없어 50% 한도를 계산할 수 없습니다. 값을
          넣으면 적립 완료 여부를 표시합니다.
        </p>
      ) : null}
    </section>
  );
}
