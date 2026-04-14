import Link from "next/link";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  levelTargetList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
  tenantGetById,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { customPaymentScheduleRows } from "@/lib/domain/payment-events";
import {
  aggregateWelfareSpendBySource,
  allocateYearlyWelfareToLegalCategories,
  LEGAL_WELFARE_CATEGORY_ROWS,
} from "@/lib/domain/operating-welfare-legal-categories";
import { computeTenantOperatingSummary } from "@/lib/domain/sheet-aggregate";
import { OperatingReportTenantIdentifiersForm } from "@/components/OperatingReportTenantIdentifiersForm";

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function OperatingReportPage() {
  const { tenantId } = await requireTenantContext();
  const [tenant, settings] = await Promise.all([tenantGetById(tenantId), companySettingsByTenant(tenantId)]);
  const tenantName = tenant?.name ?? "—";
  const approvalNumber = tenant?.approvalNumber?.trim() || "—";
  const businessRegNo = tenant?.businessRegNo?.trim() || "—";
  const year = settings?.activeYear ?? new Date().getFullYear();
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
  const summary = computeTenantOperatingSummary(
    employees,
    year,
    foundingMonth,
    accrual,
    rules,
    overrides,
    quarterly,
    notes,
    customSchedule
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
    customSchedule
  );
  const legalAlloc = allocateYearlyWelfareToLegalCategories(spendBySource, summary.totalYearlyWelfare);

  const targetByLevel = new Map(targets.map((t) => [t.level, Math.round(Number(t.targetAmount))]));

  return (
    <div className="space-y-8">
      <div>
        <p className="page-eyebrow">보고</p>
        <h1 className="page-hero-title mt-2 neu-title-gradient">운영상황 보고</h1>
        <p className="page-hero-sub text-sm sm:text-base">
          참고 스프레드시트 「취합」 탭과 같은 의미의 연도·레벨별 기금 합계·전사 요약입니다. 정기·분기·선택 복지 반영. 외부 시트와 연동하지 않습니다.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          업체 이름(거래처명) 수정은{" "}
          <Link href="/dashboard" className="text-[var(--accent)] hover:underline">
            대시보드
          </Link>
          의 「거래처 등록 정보」에서 할 수 있습니다.
        </p>
      </div>

      <div className="surface dash-panel-pad">
        <h2 className="text-sm font-bold tracking-normal text-[var(--text)]">보고서 상단 정보</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="dash-eyebrow">업체 이름</dt>
            <dd className="mt-1 font-medium text-[var(--text)]">{tenantName}</dd>
          </div>
          <div>
            <dt className="dash-eyebrow">인가번호</dt>
            <dd className="mt-1 font-mono text-[var(--text)]">{approvalNumber}</dd>
          </div>
          <div>
            <dt className="dash-eyebrow">사업자등록번호</dt>
            <dd className="mt-1 font-mono text-[var(--text)]">{businessRegNo}</dd>
          </div>
        </dl>
        {tenant ? <OperatingReportTenantIdentifiersForm tenant={tenant} /> : null}
      </div>

      <div className="surface overflow-x-auto dash-panel-pad">
        <h2 className="text-sm font-bold tracking-normal text-[var(--text)]">연간 지급액 — 복지비 구분(자동 배분)</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          정기·분기·선택 복지 원천을 구분 코드에 매핑한 뒤, 한 항목에만 몰리지 않도록 상한(연간 합계의 약 34%)을 넘는 금액은 다른 구분으로 나눕니다. 58·61·65 등 데이터에 없는 구분은 재분배 과정에서 채워질 수 있습니다. 합계는 위 「연간 기금 합계」와 동일합니다.
        </p>
        <table className="mt-4 w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="dash-table-head text-left">코드</th>
              <th className="dash-table-head text-left">구분</th>
              <th className="dash-table-head text-right">금액(원)</th>
            </tr>
          </thead>
          <tbody>
            {LEGAL_WELFARE_CATEGORY_ROWS.map((row) => (
              <tr key={row.code} className="border-b border-[var(--border)]">
                <td className="px-3 py-2 tabular-nums text-[var(--muted)]">{row.code}</td>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{format(legalAlloc.get(row.code) ?? 0)}</td>
              </tr>
            ))}
            <tr className="bg-[var(--surface-hover)]/50 font-semibold">
              <td className="px-3 py-2 text-[var(--muted)]" colSpan={2}>
                합계
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{format(summary.totalYearlyWelfare)}</td>
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
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{format(summary.totalYearlyWelfare)}원</p>
        </div>
      </div>

      <div className="surface overflow-x-auto dash-panel-pad">
        <h2 className="text-sm font-bold tracking-normal text-[var(--text)]">레벨별 (참고 시트 LEVEL 1~5 · 취합과 동일 의미)</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          귀속·지급: {summary.accrualCurrentMonthPayNext ? "당월 귀속·익월 지급" : "귀속·지급 동월"}
        </p>
        <table className="mt-4 w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="dash-table-head text-left">레벨</th>
              <th className="dash-table-head text-right">인원</th>
              <th className="dash-table-head text-right">연간 기금 합계</th>
              <th className="dash-table-head text-right">목표(설정)</th>
              <th className="dash-table-head text-right">차이</th>
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
                  <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{format(row.yearlyWelfareSum)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">{format(target)}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${deltaCls}`}>
                    {delta > 0 ? "+" : ""}
                    {format(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="surface dash-panel-pad">
        <h2 className="text-sm font-bold tracking-normal text-[var(--text)]">급여·상한 힌트 (직원 마스터 합)</h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li>
            기존연봉 합: <span className="font-mono text-[var(--text)]">{format(summary.sumBaseSalary)}</span>원
          </li>
          <li>
            조정급여 합: <span className="font-mono text-[var(--text)]">{format(summary.sumAdjustedSalary)}</span>원
          </li>
          <li>
            사복지급분 합: <span className="font-mono text-[var(--text)]">{format(summary.sumWelfareAllocation)}</span>원
          </li>
          <li>
            예상 인센(입력분) 합: <span className="font-mono text-[var(--text)]">{format(summary.sumIncentiveAmount)}</span>원
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/schedule" className="text-[var(--accent)] hover:underline">
          월별지급스케줄 →
        </Link>
        <Link href="/dashboard/levels" className="text-[var(--accent)] hover:underline">
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
