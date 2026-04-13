import Link from "next/link";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  levelTargetList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { customPaymentScheduleRows } from "@/lib/domain/payment-events";
import { computeTenantOperatingSummary } from "@/lib/domain/sheet-aggregate";

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function OperatingReportPage() {
  const { tenantId } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
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

  const targetByLevel = new Map(targets.map((t) => [t.level, Math.round(Number(t.targetAmount))]));

  return (
    <div className="space-y-8">
      <div>
        <p className="page-eyebrow">보고</p>
        <h1 className="page-hero-title mt-2 neu-title-gradient">운영상황 보고</h1>
        <p className="page-hero-sub text-sm sm:text-base">
          참고 스프레드시트 「취합」 탭과 같은 의미의 연도·레벨별 기금 합계·전사 요약입니다. 정기·분기·선택 복지 반영. 외부 시트와 연동하지 않습니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-prominent p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">기준 연도</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{summary.year}</p>
        </div>
        <div className="surface-prominent p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">창립월</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{summary.foundingMonth}월</p>
        </div>
        <div className="surface-prominent p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">등록 직원</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{summary.employeeCount}명</p>
        </div>
        <div className="surface-prominent p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">연간 기금 합계</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{format(summary.totalYearlyWelfare)}원</p>
        </div>
      </div>

      <div className="surface overflow-x-auto p-4">
        <h2 className="text-sm font-bold text-[var(--text)]">레벨별 (참고 시트 LEVEL 1~5 · 취합과 동일 의미)</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          귀속·지급: {summary.accrualCurrentMonthPayNext ? "당월 귀속·익월 지급" : "귀속·지급 동월"}
        </p>
        <table className="mt-4 w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
              <th className="px-3 py-2">레벨</th>
              <th className="px-3 py-2 text-right">인원</th>
              <th className="px-3 py-2 text-right">연간 기금 합계</th>
              <th className="px-3 py-2 text-right">목표(설정)</th>
              <th className="px-3 py-2 text-right">차이</th>
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

      <div className="surface p-5">
        <h2 className="text-sm font-bold text-[var(--text)]">급여·상한 힌트 (직원 마스터 합)</h2>
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
