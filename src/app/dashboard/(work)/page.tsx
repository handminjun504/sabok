import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
  tenantGetById,
  vendorListByTenant,
} from "@/lib/pb/repository";
import { DashboardReserveStatusPanel } from "@/components/DashboardReserveStatusPanel";
import {
  summarizeTenantAdditionalReserve,
  tenantReserveTotalSumWon,
} from "@/lib/domain/vendor-reserve";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { employeeIsInactiveForYear, welfareEligibleEmployees } from "@/lib/domain/schedule";
import {
  computeWelfareTotalsForYear,
  sumWelfareByMonth,
} from "@/lib/domain/welfare-totals";
import {
  computeFeeBilling,
  feeBillingModeLabel,
  resolveFeeRate,
} from "@/lib/domain/fee-billing";
import { YearSwitchPanel } from "@/components/YearSwitchPanel";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

const KOREAN_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function fmtWon(n: number): string {
  return Math.round(Math.max(0, n)).toLocaleString("ko-KR");
}

export default async function DashboardHomePage() {
  const { tenantId, role } = await requireTenantContext();
  const [employees, settings, tenant, vendors] = await Promise.all([
    employeeListByTenantCodeAsc(tenantId),
    companySettingsByTenant(tenantId),
    tenantGetById(tenantId),
    vendorListByTenant(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const activeCount = employees.filter((e) => !employeeIsInactiveForYear(e, year)).length;
  const inactiveCount = employees.length - activeCount;

  /**
   * 사복 집행 합계는 「사복 대상 직원」 만 대상. 노트는 미대상자도 포함해야 인센·메모 그리드 정합이 깨지지 않지만,
   * 대시보드 합계는 사복 대상 직원의 노트만 합산해야 직원 명부와 일치한다.
   */
  const eligible = welfareEligibleEmployees(employees);
  const eligibleIds = eligible.map((e) => e.id);
  const [rules, overrides, quarterly, notes] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeIdsYear(eligibleIds, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, eligibleIds),
    monthlyNoteListByTenantYear(tenantId, year, eligibleIds),
  ]);
  const totals = computeWelfareTotalsForYear({
    employees: eligible,
    year,
    settings: settings ?? null,
    rules,
    overrides,
    quarterly,
    notes,
  });
  const scheduleAnnualWon = sumWelfareByMonth(totals.scheduleByMonth);
  const optionalAnnualWon = sumWelfareByMonth(totals.optionalByMonth);

  const clientEntityType = tenant?.clientEntityType ?? "INDIVIDUAL";
  const feeRate = resolveFeeRate(settings?.feeRatePercent ?? null, clientEntityType);
  const feeMode = settings?.feeBillingMode ?? "EVEN_12";
  /** 수수료 변경점 — 비어 있으면 단일 요율(기존 동작과 동일). */
  const feeBreakpoints = settings?.feeRateBreakpoints ?? null;
  const feeA = computeFeeBilling(totals.baseAOptionalOnlyByMonth, feeRate, feeMode, feeBreakpoints);
  const feeB = computeFeeBilling(totals.baseBScheduleOnlyByMonth, feeRate, feeMode, feeBreakpoints);
  /** 「현재 달 청구」 — 활성 연도와 시스템 시계의 연도가 같을 때만 의미가 있다. 다르면 1월(인덱스 0). */
  const currentMonthIdx = (() => {
    const now = new Date();
    if (now.getFullYear() !== year) return 0;
    return now.getMonth();
  })();
  const feeAThisMonth = feeA.monthlyFees[currentMonthIdx] ?? 0;
  const feeBThisMonth = feeB.monthlyFees[currentMonthIdx] ?? 0;
  const feeAThisMonthVat = feeA.monthlyFeesWithVat[currentMonthIdx] ?? 0;
  const feeBThisMonthVat = feeB.monthlyFeesWithVat[currentMonthIdx] ?? 0;
  const feeBillingLabel = feeBillingModeLabel(feeMode);
  /**
   * 「10.0%」 또는 「10% → 7월부터 8%」 형태의 짧은 라벨.
   * segments 가 1개면 단일 요율, 2개 이상이면 변경점 시점·요율을 화살표로 잇는다.
   */
  const formatRateLabel = (segs: typeof feeA.segments): string => {
    if (segs.length <= 1) return `${segs[0]?.ratePercent ?? feeRate}%`;
    return segs
      .map((s, i) => (i === 0 ? `${s.ratePercent}%` : `${s.fromMonth}월부터 ${s.ratePercent}%`))
      .join(" → ");
  };
  const feeRateLabel = formatRateLabel(feeA.segments);

  const reserveSummary = tenant
    ? summarizeTenantAdditionalReserve(
        {
          clientEntityType: tenant.clientEntityType,
          headOfficeCapital: tenant.headOfficeCapital,
          accumulatedReserveTotalWon: tenantReserveTotalSumWon(
            tenant.reserveMonthlyByYearWon,
            tenant.accumulatedReserveTotalWon,
            tenant.reserveBalanceWon,
          ),
        },
        vendors,
      )
    : { kind: "NO_VENDORS" as const };

  const canEdit = canEditCompanySettings(role);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={`업무 홈 · ${year}`}
        title="복지기금 운영 현황"
        meta={
          <>
            <span className="trust-pill">기준 연도 {year}</span>
            <span className="trust-pill">{year}년 재직 {activeCount}명</span>
            {inactiveCount > 0 ? (
              <span className="trust-pill">비활성 {inactiveCount}명</span>
            ) : null}
            {settings?.foundingMonth ? (
              <span className="trust-pill">창립월 {settings.foundingMonth}월</span>
            ) : null}
          </>
        }
      />

      {/* KPI 카드 ─ 핵심 숫자 3개 */}
      <section aria-labelledby="dash-kpi">
        <h2 id="dash-kpi" className="sr-only">요약 지표</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/dashboard/employees" className="kpi-card group">
            <p className="kpi-card-label">{year}년 재직 직원</p>
            <p className="kpi-card-value">
              {activeCount}
              <span className="kpi-card-suffix">명</span>
            </p>
            <div className="kpi-card-foot">
              <span>전체 {employees.length}명{inactiveCount > 0 ? ` · 비활성 ${inactiveCount}` : ""}</span>
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                직원 →
              </span>
            </div>
          </Link>

          <Link href="/dashboard/rules" className="kpi-card group">
            <p className="kpi-card-label">기준 연도</p>
            <p className="kpi-card-value">{year}<span className="kpi-card-suffix">년</span></p>
            <div className="kpi-card-foot">
              <span />
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                규칙 →
              </span>
            </div>
          </Link>

          <Link href="/dashboard/settings" className="kpi-card group">
            <p className="kpi-card-label">창립월</p>
            <p className="kpi-card-value">
              {settings?.foundingMonth ?? "—"}
              <span className="kpi-card-suffix">월</span>
            </p>
            <div className="kpi-card-foot">
              <span />
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                설정 →
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* 사복 집행·수수료 KPI 4종 */}
      <section aria-labelledby="dash-fee">
        <h2 id="dash-fee" className="section-title mb-3">사복 집행 및 수수료</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/dashboard/schedule" className="kpi-card group">
            <p className="kpi-card-label">사복 총 집행 ({year}년)</p>
            <p className="kpi-card-value">
              <span className="tabular-nums">{fmtWon(scheduleAnnualWon)}</span>
              <span className="kpi-card-suffix">원</span>
            </p>
            <div className="kpi-card-foot">
              <span>정기·분기 합 — 선택적복지·대표반환 제외</span>
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                스케줄 →
              </span>
            </div>
          </Link>

          <Link href="/dashboard/schedule" className="kpi-card group">
            <p className="kpi-card-label">선택적복지 합계 ({year}년)</p>
            <p className="kpi-card-value">
              <span className="tabular-nums">{fmtWon(optionalAnnualWon)}</span>
              <span className="kpi-card-suffix">원</span>
            </p>
            <div className="kpi-card-foot">
              <span>월별 노트의 선택적 복지 입력 합</span>
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                메모·인센 →
              </span>
            </div>
          </Link>

          <Link href="/dashboard/settings" className="kpi-card group">
            <p className="kpi-card-label">수수료 A · 선택적복지만</p>
            <p className="kpi-card-value">
              <span className="tabular-nums">{fmtWon(feeA.annualFee)}</span>
              <span className="kpi-card-suffix">원/년</span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              VAT {feeA.vatRatePercent}% 포함{" "}
              <span className="tabular-nums font-semibold text-[var(--text)]">
                {fmtWon(feeA.annualFeeWithVat)}
              </span>
              원/년
            </p>
            <div className="kpi-card-foot flex-wrap">
              <span>
                {feeBillingLabel} · {feeRateLabel} · 이번 달 {fmtWon(feeAThisMonth)}원
                <span className="text-[var(--muted)]"> / VAT 포함 {fmtWon(feeAThisMonthVat)}원</span>
              </span>
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                설정 →
              </span>
            </div>
          </Link>

          <Link href="/dashboard/settings" className="kpi-card group">
            <p className="kpi-card-label">수수료 B · 정기·분기만</p>
            <p className="kpi-card-value">
              <span className="tabular-nums">{fmtWon(feeB.annualFee)}</span>
              <span className="kpi-card-suffix">원/년</span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              VAT {feeB.vatRatePercent}% 포함{" "}
              <span className="tabular-nums font-semibold text-[var(--text)]">
                {fmtWon(feeB.annualFeeWithVat)}
              </span>
              원/년
            </p>
            <div className="kpi-card-foot flex-wrap">
              <span>
                {feeBillingLabel} · {feeRateLabel} · 이번 달 {fmtWon(feeBThisMonth)}원
                <span className="text-[var(--muted)]"> / VAT 포함 {fmtWon(feeBThisMonthVat)}원</span>
              </span>
              <span className="font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" aria-hidden>
                설정 →
              </span>
            </div>
          </Link>
        </div>

        {/* 월별 청구액 미니 표 — 각 수수료마다 「공급가 / VAT 10% 포함」 두 줄로 비교 */}
        <div className="surface mt-4 overflow-x-auto p-3">
          {feeA.segments.length > 1 ? (
            <p className="mb-2 text-[0.7rem] text-[var(--muted)]">
              구간별 요율: <span className="text-[var(--text)]">{feeRateLabel}</span>
              {" — "}
              EVEN_12 모드는 각 구간을 「구간 base × 구간 요율 ÷ 구간 개월」 로 균등 분배(rolling).
            </p>
          ) : null}
          <table className="min-w-max border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)]">
                <th className="px-2 py-2 text-left text-[var(--muted)]">청구 월</th>
                {KOREAN_MONTHS.map((m) => {
                  /** 변경점이 있는 첫 달은 헤더에 시각 단서 — 작은 점 표시. */
                  const isBp = feeA.segments.length > 1 && feeA.segments.some((s) => s.fromMonth === m && m !== 1);
                  return (
                    <th
                      key={m}
                      className={
                        "px-2 py-2 text-right tabular-nums text-[var(--muted)]" +
                        (isBp ? " border-l border-[var(--accent)]/40" : "")
                      }
                      title={isBp ? `요율 변경점 (${m}월부터)` : undefined}
                    >
                      {m}월{isBp ? <span className="ml-0.5 text-[var(--accent)]" aria-hidden>•</span> : null}
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-right text-[var(--muted)]">연 합계</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-[var(--text)]">
                  수수료 A
                </td>
                {KOREAN_MONTHS.map((m) => (
                  <td key={m} className="px-2 py-1.5 text-right tabular-nums text-[var(--text)]">
                    {fmtWon(feeA.monthlyFees[m - 1] ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-bold tabular-nums text-[var(--accent)]">
                  {fmtWon(feeA.annualFee)}
                </td>
              </tr>
              <tr className="border-b border-[var(--border)]/60 text-[var(--muted)]">
                <td className="px-2 py-1.5 whitespace-nowrap pl-4 text-[10px]">
                  ㄴ VAT {feeA.vatRatePercent}% 포함
                </td>
                {KOREAN_MONTHS.map((m) => (
                  <td key={m} className="px-2 py-1.5 text-right tabular-nums">
                    {fmtWon(feeA.monthlyFeesWithVat[m - 1] ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {fmtWon(feeA.annualFeeWithVat)}
                </td>
              </tr>
              <tr>
                <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-[var(--text)]">
                  수수료 B
                </td>
                {KOREAN_MONTHS.map((m) => (
                  <td key={m} className="px-2 py-1.5 text-right tabular-nums text-[var(--text)]">
                    {fmtWon(feeB.monthlyFees[m - 1] ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-bold tabular-nums text-[var(--accent)]">
                  {fmtWon(feeB.annualFee)}
                </td>
              </tr>
              <tr className="text-[var(--muted)]">
                <td className="px-2 py-1.5 whitespace-nowrap pl-4 text-[10px]">
                  ㄴ VAT {feeB.vatRatePercent}% 포함
                </td>
                {KOREAN_MONTHS.map((m) => (
                  <td key={m} className="px-2 py-1.5 text-right tabular-nums">
                    {fmtWon(feeB.monthlyFeesWithVat[m - 1] ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {fmtWon(feeB.annualFeeWithVat)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 적립 현황 + 연도 전환 ─ 2열 (관리자), 일반은 1열 */}
      <section className={canEdit ? "grid gap-6 lg:grid-cols-[1fr_minmax(20rem,24rem)]" : ""}>
        <div>
          <h2 className="section-title mb-3">추가 적립 현황</h2>
          <DashboardReserveStatusPanel summary={reserveSummary} />
        </div>

        {canEdit ? (
          <div>
            <h2 className="section-title mb-3">연도 전환</h2>
            <YearSwitchPanel currentYear={year} canEdit={canEdit} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
