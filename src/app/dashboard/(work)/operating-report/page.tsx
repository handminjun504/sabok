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
        { clientEntityType: tenant.clientEntityType, headOfficeCapital: tenant.headOfficeCapital },
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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-eyebrow">보고</p>
          <h1 className="page-hero-title mt-1 neu-title-gradient">운영상황 보고</h1>
        </div>
        <form className="flex items-center gap-2" method="get">
          <label className="text-xs text-[var(--muted)]">연도</label>
          <select name="year" defaultValue={String(year)} className="input text-sm">
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost text-xs">적용</button>
        </form>
      </div>

      {/* ─── 핵심 요약 표 ─── */}
      <div className="surface overflow-x-auto dash-panel-pad">
        <h2 className="mb-3 text-sm font-bold text-[var(--text)]">{year}년 사복 핵심 요약</h2>
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <tbody>
            <tr className="border-b border-[var(--border)]">
              <th className="w-[40%] bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">업체</th>
              <td className="px-3 py-2 font-medium text-[var(--text)]">{tenant?.name ?? "—"}</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">회계연도</th>
              <td className="px-3 py-2 font-mono tabular-nums text-[var(--text)]">{view.basic.accountingYearLabel}</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">사복 대상 직원</th>
              <td className="px-3 py-2 font-mono tabular-nums text-[var(--text)]">{summary.employeeCount}명</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">연간 기금 지급 합계</th>
              <td className="px-3 py-2 font-mono tabular-nums font-semibold text-[var(--text)]">{format(summary.totalYearlyWelfare)} 원</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">사업주 출연(자동)</th>
              <td className="px-3 py-2 font-mono tabular-nums text-[var(--text)]">{format(employerTotal)} 원</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">사업주 외 출연(자동)</th>
              <td className="px-3 py-2 font-mono tabular-nums text-[var(--text)]">{format(otherTotal)} 원</td>
            </tr>
            {/* 법인 전용: 추가 적립금 현황 */}
            {reserveSummary.kind === "CORPORATE" ? (
              <>
                <tr className="border-b border-[var(--border)]">
                  <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">본사 자본금</th>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--text)]">
                    {reserveSummary.capitalWon > 0 ? `${format(reserveSummary.capitalWon)} 원` : "— (미입력)"}
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">추가 적립 상한 (자본금 × 50%)</th>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--text)]">
                    {reserveSummary.capWon > 0 ? `${format(reserveSummary.capWon)} 원` : "—"}
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">누적 추가 적립금</th>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--text)]">
                    {format(reserveSummary.accumulatedTotalWon)} 원
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">남은 적립액</th>
                  <td className={`px-3 py-2 font-mono tabular-nums font-semibold ${reserveSummary.isComplete ? "text-[var(--success)]" : "text-[var(--warn)]"}`}>
                    {reserveSummary.isComplete
                      ? "✓ 적립 완료 — 추가 적립 필요 없음"
                      : `${format(reserveSummary.remainingWon)} 원 남음`}
                  </td>
                </tr>
              </>
            ) : reserveSummary.kind === "NO_VENDORS" && tenant?.clientEntityType === "CORPORATE" ? (
              <tr className="border-b border-[var(--border)]">
                <th className="bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">추가 적립금</th>
                <td className="px-3 py-2 text-xs text-[var(--muted)]">출연처 미등록 — 거래처 설정에서 등록하세요</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ─── 레벨별 + 법정코드 2열 표 ─── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 레벨별 */}
        <div className="surface overflow-x-auto dash-panel-pad">
          <h2 className="mb-3 text-sm font-bold text-[var(--text)]">레벨별 기금</h2>
          <table className="w-full min-w-[360px] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--border)]">
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
                    <td className="px-3 py-2 text-center font-medium">{row.level}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{format(row.yearlyWelfareSum)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--muted)]">{format(target)}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${deltaCls}`}>
                      {delta > 0 ? "+" : ""}{format(delta)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-hover)]/50 font-semibold">
                <td className="px-3 py-2 text-center">합계</td>
                <td className="px-3 py-2 text-right tabular-nums">{summary.employeeCount}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{format(summary.totalYearlyWelfare)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--muted)]">
                  {format(Array.from(targetByLevel.values()).reduce((a, b) => a + b, 0))}
                </td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${totalDelta > 0 ? "text-[var(--danger)]" : totalDelta < 0 ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
                  {totalDelta > 0 ? "+" : ""}{format(totalDelta)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 법정 코드별 */}
        <div className="surface overflow-x-auto dash-panel-pad">
          <h2 className="mb-3 text-sm font-bold text-[var(--text)]">복지비 구분 (법정 코드)</h2>
          <table className="w-full min-w-[320px] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--border)]">
                <th className="dash-table-head text-left">코드</th>
                <th className="dash-table-head text-left">구분</th>
                <th className="dash-table-head text-right">금액(원)</th>
              </tr>
            </thead>
            <tbody>
              {LEGAL_WELFARE_CATEGORY_ROWS.map((row) => {
                const amt = legalAllocByCode.get(row.code) ?? 0;
                return (
                  <tr key={row.code} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2 tabular-nums text-[var(--muted)]">{row.code}</td>
                    <td className="px-3 py-2">{row.label}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${amt === 0 ? "text-[var(--muted)]" : "text-[var(--text)]"}`}>
                      {format(amt)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-hover)]/50 font-semibold">
                <td className="px-3 py-2 text-[var(--muted)]" colSpan={2}>합계</td>
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
                  <h3 className="text-sm font-semibold text-[var(--text)]">① 기본정보 (읽기 전용)</h3>
                  <p className="text-xs text-[var(--muted)]">
                    수정은{" "}
                    <Link href="/dashboard/settings" className="text-[var(--accent)] hover:underline">
                      대시보드 설정 → 거래처 정보
                    </Link>
                    에서 합니다.
                  </p>
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
                  <p className="text-xs text-[var(--muted)]">사업주 출연·기본재산 사용은 자동 집계됩니다.</p>
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

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/schedule" className="text-[var(--accent)] hover:underline">월별지급스케줄 →</Link>
        <Link href="/dashboard/rules" className="text-[var(--accent)] hover:underline">레벨·정기지급 →</Link>
        <Link href="/dashboard/salary-inclusion-report" className="text-[var(--accent)] hover:underline">급여포함신고 →</Link>
        <Link href="/dashboard/employees" className="text-[var(--accent)] hover:underline">직원정보 →</Link>
      </div>
    </div>
  );
}
