import { companySettingsByTenant, employeeCountByTenant, tenantGetById } from "@/lib/pb/repository";
import { tenantClientEntityLabel, tenantOperationModeLabel } from "@/lib/domain/tenant-profile";
import { requireTenantContext } from "@/lib/tenant-context";
import Link from "next/link";

function dashText(s: string | null | undefined) {
  const t = s?.trim();
  return t ? t : "—";
}

function dashWon(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

export default async function DashboardHomePage() {
  const { tenantId } = await requireTenantContext();
  const [empCount, settings, tenant] = await Promise.all([
    employeeCountByTenant(tenantId),
    companySettingsByTenant(tenantId),
    tenantGetById(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();

  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <div>
          <p className="page-eyebrow">업무 홈</p>
          <h1 className="page-hero-title mt-2 neu-title-gradient">복지기금 운영 현황</h1>
          <p className="page-hero-sub">기준 연도와 주요 수치를 확인하세요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="trust-pill">기준 연도 {year}</span>
          <span className="trust-pill">등록 직원 {empCount}명</span>
        </div>
      </header>

      <section aria-labelledby="dash-stats">
        <h2 id="dash-stats" className="sr-only">
          요약 지표
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface-prominent p-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">등록 직원</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">{empCount}</p>
            <Link
              href="/dashboard/employees"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:gap-2 hover:underline"
            >
              직원 관리 <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="surface-prominent p-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">기준 연도</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">{year}</p>
            <Link
              href="/dashboard/settings"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:gap-2 hover:underline"
            >
              전사 설정 <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="surface-prominent p-6">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">창립월</p>
            <p className="mt-3 text-4xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">
              {settings?.foundingMonth ?? "—"}
              <span className="text-2xl font-bold text-[var(--muted)]">월</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">정기 지급·스케줄 기준</p>
          </div>
        </div>
      </section>

      {tenant ? (
        <section aria-labelledby="tenant-reg-info" className="surface-prominent p-6">
          <h2 id="tenant-reg-info" className="text-sm font-bold text-[var(--text)]">
            거래처 등록 정보
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">SABOK 거래처 등록 시 입력한 값입니다.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">거래처명</dt>
              <dd className="mt-1 text-sm font-semibold text-[var(--text)]">{tenant.name}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">코드</dt>
              <dd className="mt-1 font-mono text-sm text-[var(--text)]">{tenant.code}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">개인·법인 적립</dt>
              <dd className="mt-1 text-sm text-[var(--text)]">{tenantClientEntityLabel(tenant.clientEntityType)}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">기금 운영</dt>
              <dd className="mt-1 text-sm leading-snug text-[var(--text)]">{tenantOperationModeLabel(tenant.operationMode)}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">인가번호</dt>
              <dd className="mt-1 text-sm text-[var(--text)]">{dashText(tenant.approvalNumber)}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">사업자등록번호</dt>
              <dd className="mt-1 text-sm text-[var(--text)]">{dashText(tenant.businessRegNo)}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">본사 자본금</dt>
              <dd className="mt-1 text-sm tabular-nums text-[var(--text)]">{dashWon(tenant.headOfficeCapital)}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">메모</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-[var(--text)]">{dashText(tenant.memo ?? undefined)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
