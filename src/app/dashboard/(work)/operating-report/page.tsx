import Link from "next/link";
import {
  baseAssetAnnualGet,
  bizResultAnnualGet,
  companySettingsByTenant,
  contribUsageAnnualGet,
  employeeListByTenantCodeAsc,
  fundOperationAnnualGet,
  fundSourceAnnualGet,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  levelTargetList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
  realEstateHoldingListByTenantYear,
  tenantGetById,
  vendorContributionListByTenantYear,
  vendorListByTenant,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { customPaymentScheduleRows, effectiveFixedEventMonthMap } from "@/lib/domain/payment-events";
import {
  aggregateWelfareSpendBySource,
  allocateYearlyWelfareToLegalCategories,
  LEGAL_WELFARE_CATEGORY_ROWS,
} from "@/lib/domain/operating-welfare-legal-categories";
import { computeTenantOperatingSummary } from "@/lib/domain/sheet-aggregate";
import {
  aggregateVendorContributions,
  computeOperatingReportView,
  estimateOptionalRecipientsByNotes,
  firstCeoNameFromEmployees,
} from "@/lib/domain/operating-report";
import {
  summarizeTenantAdditionalReserve,
  tenantReserveTotalSumWon,
} from "@/lib/domain/vendor-reserve";
import { welfareEligibleEmployees } from "@/lib/domain/schedule";
import { Tabs } from "@/components/Tabs";
import { OperatingReportPreviewClient } from "@/components/OperatingReportPreviewClient";
import { industryLabelOf } from "@/lib/domain/industry-categories";
import { BaseAssetAnnualForm } from "@/components/BaseAssetAnnualForm";
import { FundOperationAnnualForm } from "@/components/FundOperationAnnualForm";
import { FundSourceAnnualForm } from "@/components/FundSourceAnnualForm";
import { ContribUsageAnnualForm } from "@/components/ContribUsageAnnualForm";
import { BizResultAnnualForm } from "@/components/BizResultAnnualForm";
import { RealEstateHoldingsForm } from "@/components/RealEstateHoldingsForm";
import { PageHeader } from "@/components/ui/PageHeader";

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

function BasicRow({
  label,
  value,
  mono = false,
  full = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  const display = value?.toString().trim() ? value : "—";
  const valueCls =
    (mono ? "font-mono " : "") + (full ? "" : "") + "text-[var(--text)]";
  return (
    <tr className="border-b border-[var(--border)] last:border-b-0">
      <th className="w-[28%] bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">
        {label}
      </th>
      <td className={`px-3 py-2 ${valueCls}`}>{display}</td>
    </tr>
  );
}

type PageProps = {
  searchParams?: Promise<{ year?: string }>;
};

export default async function OperatingReportPage({ searchParams }: PageProps) {
  const { tenantId } = await requireTenantContext();
  const [tenant, settings] = await Promise.all([tenantGetById(tenantId), companySettingsByTenant(tenantId)]);

  const sp = (await searchParams) ?? {};
  const queryYear = sp.year ? Math.round(Number(sp.year)) : NaN;
  const activeYear = settings?.activeYear ?? new Date().getFullYear();
  const year = Number.isFinite(queryYear) && queryYear >= 2000 && queryYear <= 2100 ? queryYear : activeYear;
  const prevYear = year - 1;
  const foundingMonth = settings?.foundingMonth ?? 1;

  /**
   * 운영 보고는 사복 대상 직원만 — `flagWelfareIneligible` 직원은 ⑫~◯70 의 모든 인원·금액 집계에서 제외.
   * 그래야 기금 통계가 사복 미적용자를 섞어 보고하는 사고를 막을 수 있다.
   */
  const employees = welfareEligibleEmployees(await employeeListByTenantCodeAsc(tenantId));
  const ids = employees.map((e) => e.id);

  const [rules, overrides, quarterly, notes, targets] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeIdsYear(ids, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids),
    monthlyNoteListByTenantYear(tenantId, year, ids),
    levelTargetList(tenantId, year),
  ]);

  const customSchedule = customPaymentScheduleRows(settings, year);
  const fixedEventMonths = effectiveFixedEventMonthMap(settings);
  const summary = computeTenantOperatingSummary(
    employees,
    year,
    foundingMonth,
    rules,
    overrides,
    quarterly,
    notes,
    customSchedule,
    fixedEventMonths,
  );

  const spendBySource = aggregateWelfareSpendBySource(
    employees,
    year,
    foundingMonth,
    rules,
    overrides,
    quarterly,
    notes,
    customSchedule,
    fixedEventMonths,
  );
  const legalAllocByCode = allocateYearlyWelfareToLegalCategories(spendBySource, summary.totalYearlyWelfare);

  const [
    baseAsset,
    prevBaseAsset,
    fundOperation,
    fundSource,
    prevFundSource,
    usage,
    biz,
    realEstateRows,
    vendors,
    vendorContribs,
  ] = await Promise.all([
    baseAssetAnnualGet(tenantId, year),
    baseAssetAnnualGet(tenantId, prevYear),
    fundOperationAnnualGet(tenantId, year),
    fundSourceAnnualGet(tenantId, year),
    fundSourceAnnualGet(tenantId, prevYear),
    contribUsageAnnualGet(tenantId, year),
    bizResultAnnualGet(tenantId, year),
    realEstateHoldingListByTenantYear(tenantId, year),
    vendorListByTenant(tenantId),
    vendorContributionListByTenantYear(tenantId, year),
  ]);

  const { employerTotal, otherTotal } = aggregateVendorContributions(tenant, vendors, vendorContribs);
  const reserveSummary = tenant != null
    ? summarizeTenantAdditionalReserve(
        {
          clientEntityType: tenant.clientEntityType,
          headOfficeCapital: tenant.headOfficeCapital,
          accumulatedReserveTotalWon: tenantReserveTotalSumWon(
            tenant.reserveMonthlyByYearWon,
            tenant.accumulatedReserveTotalWon,
          ),
        },
        vendors,
      )
    : { kind: "NO_VENDORS" as const };
  const autoCeoName = firstCeoNameFromEmployees(employees);
  const autoOptionalRecipients = estimateOptionalRecipientsByNotes(notes, year);

  const computeArgs = {
    tenant,
    settings,
    year,
    inputs: {
      baseAsset,
      fundOperation,
      fundSource,
      usage,
      biz,
      realEstate: realEstateRows,
    },
    prevBaseAsset,
    prevFundSource,
    autos: {
      autoEmployerContribution: employerTotal,
      autoNonEmployerContribution: otherTotal,
      autoBaseAssetUsed: summary.totalYearlyWelfare,
      autoEmployeeCount: summary.employeeCount,
      legalAllocByCodeEntries: Array.from(legalAllocByCode.entries()) as Array<[number, number]>,
      autoCeoName,
      autoOptionalRecipients,
    },
  };
  const view = computeOperatingReportView({
    ...computeArgs,
    autos: {
      autoEmployerContribution: employerTotal,
      autoNonEmployerContribution: otherTotal,
      autoBaseAssetUsed: summary.totalYearlyWelfare,
      autoEmployeeCount: summary.employeeCount,
      legalAllocByCode,
      autoCeoName,
      autoOptionalRecipients,
    },
  });

  const targetByLevel = new Map(targets.map((t) => [t.level, Math.round(Number(t.targetAmount))]));

  const years: number[] = [];
  for (let y = year + 1; y >= year - 4; y--) years.push(y);

  const warningCount = view.warnings.length;

  /* ── 공통 요약 데이터 ── */
  const totalDelta = summary.byLevel.reduce((s, r) => {
    const target = targetByLevel.get(r.level) ?? 0;
    return s + (r.yearlyWelfareSum - target);
  }, 0);

  /** 법인 적립 진행도(%) — 0~100, 한도 산정 불가 시 null */
  const reserveProgressPct =
    reserveSummary.kind === "CORPORATE" && !reserveSummary.cannotAssess && reserveSummary.capWon > 0
      ? Math.min(100, Math.round((reserveSummary.accumulatedTotalWon / reserveSummary.capWon) * 100))
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`운영 보고 · ${year}`}
        title="운영상황 보고"
        actions={
          <form className="flex items-center gap-2" method="get">
            <label className="text-xs text-[var(--muted)]">연도</label>
            <select name="year" defaultValue={String(year)} className="input text-sm h-9">
              {years.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <button type="submit" className="btn btn-outline text-xs">적용</button>
          </form>
        }
      />

      {/* KPI 4종 — 핵심 숫자 */}
      <section aria-labelledby="op-kpi">
        <h2 id="op-kpi" className="sr-only">핵심 지표</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="kpi-card">
            <p className="kpi-card-label">사복 대상 직원</p>
            <p className="kpi-card-value">{summary.employeeCount}<span className="kpi-card-suffix">명</span></p>
          </div>
          <div className="kpi-card">
            <p className="kpi-card-label">연간 기금 지급</p>
            <p className="kpi-card-value text-[var(--accent)]">{format(summary.totalYearlyWelfare)}<span className="kpi-card-suffix">원</span></p>
          </div>
          <div className="kpi-card">
            <p className="kpi-card-label">사업주 출연</p>
            <p className="kpi-card-value">{format(employerTotal)}<span className="kpi-card-suffix">원</span></p>
          </div>
          <div className="kpi-card">
            <p className="kpi-card-label">그 외 출연</p>
            <p className="kpi-card-value">{format(otherTotal)}<span className="kpi-card-suffix">원</span></p>
          </div>
        </div>
      </section>

      {/* 법인 적립 진행도 — 법인이고 한도 산정 가능할 때 */}
      {reserveSummary.kind === "CORPORATE" ? (
        <section className="surface dash-panel-pad" aria-labelledby="reserve-progress">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="reserve-progress" className="section-title">법인 자본금 50% 한도 — 추가 적립 진행</h2>
            {reserveSummary.cannotAssess ? (
              <span className="badge badge-neutral">한도 산정 불가</span>
            ) : reserveSummary.isComplete ? (
              <span className="badge badge-success">적립 완료</span>
            ) : (
              <span className="badge badge-warn">진행 중 · {reserveProgressPct}%</span>
            )}
          </div>

          {!reserveSummary.cannotAssess && reserveProgressPct != null ? (
            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-xs text-[var(--muted)]">
                  <span className="font-bold tabular-nums text-[var(--accent)]">{format(reserveSummary.accumulatedTotalWon)}</span>
                  <span className="mx-1">/</span>
                  <span className="tabular-nums">{format(reserveSummary.capWon)}</span>
                  <span className="ml-1">원</span>
                </span>
                <span className="text-sm font-bold tabular-nums text-[var(--text)]">{reserveProgressPct}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-sunken)]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${reserveProgressPct}%`,
                    background: reserveSummary.isComplete
                      ? "var(--success)"
                      : "linear-gradient(90deg, var(--accent) 0%, var(--accent-dim) 100%)",
                  }}
                />
              </div>
            </div>
          ) : null}

          <dl className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
              <dt className="dash-eyebrow">본사 자본금</dt>
              <dd className="mt-1 font-bold tabular-nums text-[var(--text)]">
                {reserveSummary.capitalWon > 0 ? `${format(reserveSummary.capitalWon)}원` : "— (미입력)"}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
              <dt className="dash-eyebrow">상한 (50%)</dt>
              <dd className="mt-1 font-bold tabular-nums text-[var(--text)]">
                {reserveSummary.capWon > 0 ? `${format(reserveSummary.capWon)}원` : "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
              <dt className="dash-eyebrow">남은 적립액</dt>
              <dd className={`mt-1 font-bold tabular-nums ${reserveSummary.isComplete ? "text-[var(--success)]" : "text-[var(--warn)]"}`}>
                {reserveSummary.cannotAssess ? "—" : reserveSummary.isComplete ? "✓ 적립 완료" : `${format(reserveSummary.remainingWon)}원 남음`}
              </dd>
            </div>
          </dl>
        </section>
      ) : reserveSummary.kind === "NO_VENDORS" && tenant?.clientEntityType === "CORPORATE" ? (
        <section className="surface dash-panel-pad">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">법인 자본금 50% 한도</h2>
            <span className="text-xs text-[var(--muted)]">
              <strong className="text-[var(--text)]">설정 ▸ 적립금</strong>에서 입력
            </span>
          </div>
        </section>
      ) : null}

      {/* ─── 레벨별 + 법정코드 2열 표 ─── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 레벨별 */}
        <div className="surface overflow-x-auto">
          <div className="dash-panel-toolbar border-b border-[var(--border)]">
            <h2 className="section-title">레벨별 기금 vs 목표</h2>
          </div>
          <table className="table-zebra w-full min-w-[360px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)]">
                <th className="dash-table-head text-center">레벨</th>
                <th className="dash-table-head text-right">인원</th>
                <th className="dash-table-head text-right">연간 합계</th>
                <th className="dash-table-head text-right">목표</th>
                <th className="dash-table-head text-right">차이</th>
              </tr>
            </thead>
            <tbody>
              {summary.byLevel.map((row) => {
                const target = targetByLevel.get(row.level) ?? 0;
                const delta = row.yearlyWelfareSum - target;
                const deltaCls =
                  delta > 0 ? "text-[var(--danger)]" : delta < 0 ? "text-[var(--warn)]" : "text-[var(--muted)]";
                return (
                  <tr key={row.level} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2 text-center font-bold tabular-nums">Lv.{row.level}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{format(row.yearlyWelfareSum)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--muted)]">{format(target)}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${deltaCls}`}>
                      {delta > 0 ? "+" : ""}{format(delta)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--accent-soft)] font-semibold">
                <td className="px-3 py-2 text-center text-[var(--accent-dim)]">합계</td>
                <td className="px-3 py-2 text-right tabular-nums">{summary.employeeCount}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{format(summary.totalYearlyWelfare)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--muted)]">
                  {format(Array.from(targetByLevel.values()).reduce((a, b) => a + b, 0))}
                </td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums font-bold ${totalDelta > 0 ? "text-[var(--danger)]" : totalDelta < 0 ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
                  {totalDelta > 0 ? "+" : ""}{format(totalDelta)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 법정 코드별 */}
        <div className="surface overflow-x-auto">
          <div className="dash-panel-toolbar border-b border-[var(--border)]">
            <h2 className="section-title">복지비 구분 (법정 코드)</h2>
          </div>
          <table className="table-zebra w-full min-w-[320px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)]">
                <th className="dash-table-head text-left">코드</th>
                <th className="dash-table-head text-left">구분</th>
                <th className="dash-table-head text-right">금액 (원)</th>
              </tr>
            </thead>
            <tbody>
              {LEGAL_WELFARE_CATEGORY_ROWS.map((row) => {
                const amt = legalAllocByCode.get(row.code) ?? 0;
                return (
                  <tr key={row.code} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2 font-mono tabular-nums text-[var(--muted)]">{row.code}</td>
                    <td className="px-3 py-2">{row.label}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${amt === 0 ? "text-[var(--muted)]" : "text-[var(--text)]"}`}>
                      {format(amt)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--accent-soft)] font-semibold">
                <td className="px-3 py-2 text-[var(--accent-dim)]" colSpan={2}>합계</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{format(summary.totalYearlyWelfare)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── 탭: 미리보기 / 데이터 입력 ─── */}
      <Tabs
        tabs={[
          {
            label: warningCount > 0 ? `미리보기 (${warningCount})` : "미리보기",
            content: (
              <OperatingReportPreviewClient
                computeArgs={computeArgs}
                initialView={view}
                realEstate={realEstateRows}
              />
            ),
          },
          {
            label: "데이터 입력",
            content: (
              <div className="space-y-8">
                {/* 기본정보 */}
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[var(--text)]">① 기본정보 (읽기 전용)</h3>
                    <Link
                      href="/dashboard/settings"
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      설정 ▸ 거래처 정보에서 수정
                    </Link>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        <BasicRow label="기금법인명" value={view.basic.name} />
                        <BasicRow label="인가번호" value={view.basic.approvalNumber} mono />
                        <BasicRow label="사업자등록번호" value={tenant?.businessRegNo ?? ""} mono />
                        <BasicRow label="설립등기일" value={view.basic.incorporationDate} mono />
                        <BasicRow label="대표자" value={view.basic.ceoName} />
                        <BasicRow label="회계연도" value={view.basic.accountingYearLabel} mono />
                        <BasicRow
                          label="업종"
                          value={view.basic.industry ? `${view.basic.industry}. ${industryLabelOf(view.basic.industry)}` : ""}
                        />
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 기본재산 */}
                <section className="space-y-2 border-t border-[var(--border)] pt-6">
                  <h3 className="text-sm font-semibold text-[var(--text)]">② 기본재산 변동 ⑫~⑳</h3>
                  <BaseAssetAnnualForm
                    year={year}
                    record={baseAsset}
                    autoPrevYearEndTotal={view.baseAsset.prevYearEndTotal}
                    autoEmployerContribution={employerTotal}
                    autoNonEmployerContribution={otherTotal}
                    autoBaseAssetUsed={summary.totalYearlyWelfare}
                  />
                </section>

                {/* 기금운용 */}
                <section className="space-y-2 border-t border-[var(--border)] pt-6">
                  <h3 className="text-sm font-semibold text-[var(--text)]">③ 기금운용</h3>
                  <FundOperationAnnualForm
                    year={year}
                    record={fundOperation}
                    expectedTotalMatch={view.baseAsset.currentYearEndTotal}
                  />
                </section>

                {/* 기금재원 */}
                <section className="space-y-2 border-t border-[var(--border)] pt-6">
                  <h3 className="text-sm font-semibold text-[var(--text)]">④ 기금재원</h3>
                  <FundSourceAnnualForm
                    year={year}
                    tenant={tenant}
                    record={fundSource}
                    contribBase={view.baseAsset.employerContribution + view.baseAsset.nonEmployerContribution}
                    headOfficeCapital={view.basic.headOfficeCapital}
                    currentYearEndTotal={view.baseAsset.currentYearEndTotal}
                    prevYearEndTotal={view.baseAsset.prevYearEndTotal}
                    autoCarryover={prevFundSource?.carryover ?? 0}
                  />
                </section>

                {/* 사용현황 */}
                <section className="space-y-2 border-t border-[var(--border)] pt-6">
                  <h3 className="text-sm font-semibold text-[var(--text)]">⑤ 사용현황</h3>
                  <ContribUsageAnnualForm
                    year={year}
                    record={usage}
                    contribBase={view.baseAsset.employerContribution + view.baseAsset.nonEmployerContribution}
                    prevYearEndTotal={view.baseAsset.prevYearEndTotal}
                  />
                </section>

                {/* 사업실적 */}
                <section className="space-y-2 border-t border-[var(--border)] pt-6">
                  <h3 className="text-sm font-semibold text-[var(--text)]">⑥ 사업실적</h3>
                  <BizResultAnnualForm
                    year={year}
                    record={biz}
                    legalAllocByCode={legalAllocByCode}
                    baseAssetUsed={summary.totalYearlyWelfare}
                    fundSourceTotal={view.fundSource.total}
                    loanTotal={view.fundOperation.loan}
                    autoOptionalRecipients={autoOptionalRecipients}
                  />
                </section>

                {/* 부동산 */}
                <section className="space-y-2 border-t border-[var(--border)] pt-6">
                  <h3 className="text-sm font-semibold text-[var(--text)]">⑦ 부동산 보유 현황</h3>
                  <RealEstateHoldingsForm year={year} rows={realEstateRows} />
                </section>
              </div>
            ),
          },
        ]}
      />

      <nav className="flex flex-wrap gap-2 pt-2" aria-label="관련 화면">
        <Link href="/dashboard/schedule" className="btn btn-outline text-xs">월별 지급 스케줄 →</Link>
        <Link href="/dashboard/rules" className="btn btn-outline text-xs">지급 규칙 →</Link>
        <Link href="/dashboard/salary-inclusion-report" className="btn btn-outline text-xs">급여 포함 신고 →</Link>
        <Link href="/dashboard/employees" className="btn btn-outline text-xs">직원 정보 →</Link>
      </nav>
    </div>
  );
}
