import { companySettingsByTenant, glSyncJobListByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canTriggerGlSync } from "@/lib/permissions";
import { requestGlSyncFormAction } from "@/app/actions/gl";
import { redirect } from "next/navigation";

export default async function GlPage() {
  const { tenantId, role } = await requireTenantContext();
  if (!canTriggerGlSync(role)) {
    redirect("/dashboard");
  }

  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const jobs = await glSyncJobListByTenant(tenantId, 50);

  /** 연도 옵션 — 활성 연도 ±5 + 시스템 연도 ±5 합쳐 「현실적 범위」 만 노출. */
  const yearOptions = (() => {
    const now = new Date().getFullYear();
    const lo = Math.min(year - 5, now - 5);
    const hi = Math.max(year + 5, now + 5);
    const out: number[] = [];
    for (let y = lo; y <= hi; y++) out.push(y);
    return out;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">GL 동기화 (MCP 연동 준비)</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">요청만 큐에 넣습니다. GL 연동은 추후.</p>
      </div>

      <form action={requestGlSyncFormAction} className="surface dash-panel-pad space-y-4">
        <div>
          <label className="text-xs text-[var(--muted)]">연도</label>
          <select
            name="year"
            defaultValue={String(year)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">월 (선택, 비우면 연간)</label>
          <select
            name="month"
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          >
            <option value="">연간 (월 미선택)</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white">
          동기화 요청 등록
        </button>
      </form>

      <div className="surface dash-panel-pad">
        <h2 className="text-sm font-semibold">최근 작업</h2>
        <ul className="mt-3 space-y-2 text-xs text-[var(--muted)]">
          {jobs.map((j) => (
            <li key={j.id}>
              <span className="text-[var(--text)]">{j.createdAt.toISOString()}</span> — {j.status} — {j.id}
              {j.error && <span className="text-[var(--danger)]"> ({j.error})</span>}
            </li>
          ))}
        </ul>
        {jobs.length === 0 && <p className="text-sm">작업 없음</p>}
      </div>
    </div>
  );
}
