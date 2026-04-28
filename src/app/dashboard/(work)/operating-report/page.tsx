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
import { Tabs } from "@/components/Tabs";
import { OperatingReportPreview } from "@/components/OperatingReportPreview";
import { OperatingReportTenantBasicForm } from "@/components/OperatingReportTenantBasicForm";
import { BaseAssetAnnualForm } from "@/components/BaseAssetAnnualForm";
import { FundOperationAnnualForm } from "@/components/FundOperationAnnualForm";
import { FundSourceAnnualForm } from "@/components/FundSourceAnnualForm";
import { ContribUsageAnnualForm } from "@/components/ContribUsageAnnualForm";
import { BizResultAnnualForm } from "@/components/BizResultAnnualForm";
import { RealEstateHoldingsForm } from "@/components/RealEstateHoldingsForm";

function format(n: number) {
  return n.toLocaleString("ko-KR");
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
  const accrual = settings?.accrualCurrentMonthPayNext ?? false;

  const employees = await employeeListByTenantCodeAsc(tenantId);
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
    accrual,
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
    accrual,
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
  const autoCeoName = firstCeoNameFromEmployees(employees);
  const autoOptionalRecipients = estimateOptionalRecipientsByNotes(notes, year);

  const view = computeOperatingReportView({
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
      legalAllocByCode,
      autoCeoName,
      autoOptionalRecipients,
    },
  });

  const targetByLevel = new Map(targets.map((t) => [t.level, Math.round(Number(t.targetAmount))]));

  const years: number[] = [];
  for (let y = year + 1; y >= year - 4; y--) years.push(y);

  const warningCount = view.warnings.length;

  return (
    <div className="space-y-8">
      <div>
        <p className="page-eyebrow">보고</p>
        <h1 className="page-hero-title mt-2 neu-title-gradient">운영상황 보고</h1>
      </div>

      <div className="surface dash-panel-pad flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-[var(--muted)]">
          업체: <span className="font-medium text-[var(--text)]">{tenant?.name ?? "—"}</span>
          <span className="mx-2">·</span>
          회계연도:
          <span className="ml-2 font-mono tabular-nums text-[var(--text)]">
            {view.basic.accountingYearLabel}
          </span>
        </div>
        <form className="flex items-center gap-2" method="get">
          <label className="text-xs text-[var(--muted)]">연도</label>
          <select
            name="year"
            defaultValue={String(year)}
            className="input text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost text-xs">
            적용
          </button>
        </form>
      </div>

      <Tabs
        tabs={[
          {
            label: warningCount > 0 ? `미리보기 (${warningCount})` : "미리보기",
            content: <OperatingReportPreview view={view} year={year} />,
          },
          {
            label: "기본정보",
            content: tenant ? (
              <div className="space-y-3">
                <p className="text-xs text-[var(--muted)]">
                  양식 ③~⑧, ⑪ 칸에 직접 반영됩니다. ⑦ 대표자를 비워 두면 position=대표이사 직원({" "}
                  <b>{autoCeoName ?? "미지정"}</b>)으로 자동 표시됩니다.
                </p>
                <OperatingReportTenantBasicForm tenant={tenant} />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">사업체 정보가 없습니다.</p>
            ),
          },
          {
            label: "기본재산",
            content: (
              <div className="space-y-3">
                <p className="text-xs text-[var(--muted)]">
                  양식 ⑫~⑳ (기본재산 변동). 사업주 출연·사업주 외 출연은 거래처 원장에서 자동 집계되며,
                  ⑰ 기본재산 사용은 연간 지급 총액으로 고정됩니다.
                </p>
                <BaseAssetAnnualForm
                  year={year}
                  record={baseAsset}
                  autoPrevYearEndTotal={view.baseAsset.prevYearEndTotal}
                  autoEmployerContribution={employerTotal}
                  autoNonEmployerContribution={otherTotal}
                  autoBaseAssetUsed={summary.totalYearlyWelfare}
                />
              </div>
            ),
          },
          {
            label: "기금운용",
            content: (
              <FundOperationAnnualForm
                year={year}
                record={fundOperation}
                expectedTotalMatch={view.baseAsset.currentYearEndTotal}
              />
            ),
          },
          {
            label: "기금재원",
            content: (
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
            ),
          },
          {
            label: "사용현황",
            content: (
              <ContribUsageAnnualForm
                year={year}
                record={usage}
                contribBase={view.baseAsset.employerContribution + view.baseAsset.nonEmployerContribution}
                prevYearEndTotal={view.baseAsset.prevYearEndTotal}
              />
            ),
          },
          {
            label: "사업실적",
            content: (
              <BizResultAnnualForm
                year={year}
                record={biz}
                legalAllocByCode={legalAllocByCode}
                baseAssetUsed={summary.totalYearlyWelfare}
                fundSourceTotal={view.fundSource.total}
                loanTotal={view.fundOperation.loan}
                autoOptionalRecipients={autoOptionalRecipients}
              />
            ),
          },
          {
            label: "부동산",
            content: <RealEstateHoldingsForm year={year} rows={realEstateRows} />,
          },
        ]}
      />

      <div className="surface overflow-x-auto dash-panel-pad">
        <h2 className="text-sm font-bold tracking-normal text-[var(--text)]">
          연간 지급액 — 복지비 구분(자동 배분)
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          정기 지급(event)·분기 항목·선택 복지를 법정 코드(57~66, 71)에{" "}
          <strong className="text-[var(--text)]">성격에 맞게</strong> 매핑합니다. 빈 칸에 균등 배분 없이, 이미 매핑된 구분의 비율대로 가감됩니다.
        </p>
        <table className="mt-4 w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="dash-table-head text-left">코드</th>
              <th className="dash-table-head text-left">구분</th>
              <th className="dash-table-head dash-table-vline-strong text-right">금액(원)</th>
            </tr>
          </thead>
          <tbody>
            {LEGAL_WELFARE_CATEGORY_ROWS.map((row) => (
              <tr key={row.code} className="border-b border-[var(--border)]">
                <td className="px-3 py-2 tabular-nums text-[var(--muted)]">{row.code}</td>
                <td className="px-3 py-2">{row.label}</td>
                <td className="dash-table-vline-strong px-3 py-2 text-right font-mono tabular-nums">
                  {format(legalAllocByCode.get(row.code) ?? 0)}
                </td>
              </tr>
            ))}
            <tr className="bg-[var(--surface-hover)]/50 font-semibold">
              <td className="px-3 py-2 text-[var(--muted)]" colSpan={2}>
                합계
              </td>
              <td className="dash-table-vline-strong px-3 py-2 text-right font-mono tabular-nums">
                {format(summary.totalYearlyWelfare)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-prominent dash-panel-pad">
          <p className="dash-eyebrow">기준 연도</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{summary.year}</p>
        </div>
        <div className="surface-prominent dash-panel-pad">
          <p className="dash-eyebrow">창립월</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{summary.foundingMonth}월</p>
        </div>
        <div className="surface-prominent dash-panel-pad">
          <p className="dash-eyebrow">등록 직원</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{summary.employeeCount}명</p>
        </div>
        <div className="surface-prominent dash-panel-pad">
          <p className="dash-eyebrow">연간 기금 합계</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">
            {format(summary.totalYearlyWelfare)}원
          </p>
        </div>
      </div>

      <div className="surface overflow-x-auto dash-panel-pad">
        <h2 className="text-sm font-bold tracking-normal text-[var(--text)]">레벨별</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          귀속·지급: {summary.accrualCurrentMonthPayNext ? "당월 귀속·익월 지급" : "귀속·지급 동월"}
        </p>
        <table className="mt-4 w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="dash-table-head text-left">레벨</th>
              <th className="dash-table-head dash-table-vline-strong text-right">인원</th>
              <th className="dash-table-head dash-table-vline text-right">연간 기금 합계</th>
              <th className="dash-table-head dash-table-vline text-right">목표(설정)</th>
              <th className="dash-table-head dash-table-vline text-right">차이</th>
            </tr>
          </thead>
          <tbody>
            {summary.byLevel.map((row) => {
              const target = targetByLevel.get(row.level) ?? 0;
              const delta = row.yearlyWelfareSum - target;
              const deltaCls =
                delta > 0 ? "text-[var(--danger)]" : delta < 0 ? "text-[var(--warn)]" : "text-[var(--success)]";
              return (
                <tr key={row.level} className="border-b border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">{row.level}</td>
                  <td className="dash-table-vline-strong px-3 py-2 text-right tabular-nums">{row.count}</td>
                  <td className="dash-table-vline px-3 py-2 text-right tabular-nums">
                    {format(row.yearlyWelfareSum)}
                  </td>
                  <td className="dash-table-vline px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                    {format(target)}
                  </td>
                  <td className={`dash-table-vline px-3 py-2 text-right font-medium tabular-nums ${deltaCls}`}>
                    {delta > 0 ? "+" : ""}
                    {format(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/schedule" className="text-[var(--accent)] hover:underline">
          월별지급스케줄 →
        </Link>
        <Link href="/dashboard/rules" className="text-[var(--accent)] hover:underline">
          레벨·정기지급 →
        </Link>
        <Link href="/dashboard/salary-inclusion-report" className="text-[var(--accent)] hover:underline">
          급여포함신고 →
        </Link>
        <Link href="/dashboard/employees" className="text-[var(--accent)] hover:underline">
          직원정보 →
        </Link>
      </div>
    </div>
  );
}
