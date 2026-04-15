import Link from "next/link";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
  tenantGetById,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { customPaymentScheduleRows } from "@/lib/domain/payment-events";
import {
  SALARY_INCLUSION_VARIANCE_MODES,
  effectiveSalaryInclusionVarianceMode,
  salaryInclusionShowOverage,
  salaryInclusionShowShortfall,
} from "@/lib/domain/salary-inclusion-display";
import {
  computeActualWelfareThroughPaidMonth,
  computeIncentiveWelfareSalaryInclusionYtd,
  computeSalaryInclusionCapBlocks,
} from "@/lib/domain/schedule";
import { parseTenantOperationMode } from "@/lib/domain/tenant-profile";

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

function parseThroughMonth(v: string | string[] | undefined): number {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = raw != null && raw !== "" ? Number(raw) : 12;
  if (!Number.isInteger(n) || n < 1 || n > 12) return 12;
  return n;
}

const MONTH_LINKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export default async function SalaryInclusionReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const throughMonth = parseThroughMonth(sp.throughMonth);

  const { tenantId } = await requireTenantContext();
  const [settings, tenantRow] = await Promise.all([
    companySettingsByTenant(tenantId),
    tenantGetById(tenantId),
  ]);
  const tenantOperationMode = parseTenantOperationMode(tenantRow?.operationMode);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const accrual = settings?.accrualCurrentMonthPayNext ?? false;
  const tenantVarianceMode = settings?.salaryInclusionVarianceMode ?? "BOTH";
  const tenantVarianceLabel =
    SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === tenantVarianceMode)?.label ?? tenantVarianceMode;

  const employees = await employeeListByTenantCodeAsc(tenantId);
  const ids = employees.map((e) => e.id);

  const [rules, overrides, quarterly, notes] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeIdsYear(ids, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids),
    monthlyNoteListByTenantYear(tenantId, year, ids),
  ]);

  const customSchedule = customPaymentScheduleRows(settings, year);

  const rows = employees.map((emp) => {
    const ovr = overrides.filter((x) => x.employeeId === emp.id);
    const qcfg = quarterly.filter((x) => x.employeeId === emp.id);
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const actual = computeActualWelfareThroughPaidMonth(
      emp,
      year,
      foundingMonth,
      accrual,
      rules,
      ovr,
      qcfg,
      empNotes,
      throughMonth,
      customSchedule
    );
    const capBlocks = computeSalaryInclusionCapBlocks(
      emp,
      actual,
      empNotes,
      year,
      tenantOperationMode,
      throughMonth
    );
    const incentiveWelfare = computeIncentiveWelfareSalaryInclusionYtd(empNotes, year, throughMonth);
    const eff = effectiveSalaryInclusionVarianceMode(emp, tenantVarianceMode);
    const showOver = salaryInclusionShowOverage(eff);
    const showUnder = salaryInclusionShowShortfall(eff);
    const effLabel = SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === eff)?.label ?? eff;
    return { emp, capBlocks, incentiveWelfare, showOver, showUnder, effLabel };
  });

  const colShowOver = rows.some((r) => r.showOver);
  const colShowUnder = rows.some((r) => r.showUnder);

  return (
    <div className="space-y-8">
      <header className="surface dash-panel-pad border border-[var(--border)] shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="neu-title-gradient text-2xl font-bold tracking-tight">급여포함신고</h1>
            <p className="text-sm text-[var(--muted)]">
              <span className="font-medium text-[var(--text)]">{year}년</span>
              <span className="mx-1.5 text-[var(--border)]">·</span>
              지급월 누적 <span className="tabular-nums text-[var(--text)]">1–{throughMonth}월</span>
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
              <span>
                전사 기본 표시:{" "}
                <strong className="text-[var(--text)]">{tenantVarianceLabel}</strong>
                <Link href="/dashboard/settings" className="ml-1.5 text-[var(--accent)] hover:underline">
                  설정에서 변경
                </Link>
              </span>
              <span className="hidden sm:inline">|</span>
              <span>
                직원별로 다르게 두면{" "}
                <Link href="/dashboard/employees" className="text-[var(--accent)] hover:underline">
                  직원 추가·수정
                </Link>
                에서 덮어씁니다.
              </span>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]/50 p-3 text-xs text-[var(--muted)] lg:max-w-md">
            <p className="font-semibold text-[var(--text)]">누적 지급월</p>
            <p className="mt-1 leading-relaxed">
              아래 표의 기금 실적·인센 사복 합은 선택한 월까지 합산됩니다. 열이 숨겨진 직원은 해당 표시 방식을 쓰지
              않는 경우입니다.
            </p>
          </div>
        </div>

        <nav className="mt-5 border-t border-[var(--border)] pt-4" aria-label="누적 지급월 선택">
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-12">
            {MONTH_LINKS.map((m) => {
              const active = throughMonth === m;
              const href =
                m === 12 ? "/dashboard/salary-inclusion-report" : `/dashboard/salary-inclusion-report?throughMonth=${m}`;
              const label = m === 12 ? "연간" : `${m}월`;
              return (
                <Link
                  key={m}
                  href={href}
                  className={`rounded-lg border px-2 py-2 text-center text-xs font-medium tabular-nums transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="surface overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-hover)]/40 px-4 py-2.5 text-xs text-[var(--muted)]">
          <span>
            <span className="inline-block size-2 rounded-full bg-[var(--danger)] align-middle" aria-hidden /> 초과
          </span>
          <span>
            <span className="inline-block size-2 rounded-full bg-[var(--warn)] align-middle" aria-hidden /> 미달
          </span>
        </div>
        <div className="overflow-x-auto dash-panel-pad">
          <table className="min-w-[920px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-xs font-medium text-[var(--muted)]">
                <th className="sticky left-0 z-[1] bg-[var(--bg)] px-3 py-2.5 shadow-[2px_0_0_var(--border)]">코드</th>
                <th className="px-3 py-2.5">이름</th>
                <th className="px-3 py-2.5 text-center">레벨</th>
                <th className="hidden md:table-cell px-3 py-2.5">표시</th>
                <th className="dash-table-vline-strong px-3 py-2.5 text-right">상한</th>
                <th className="dash-table-vline px-3 py-2.5">상한 · 실적 기준</th>
                <th className="dash-table-vline px-3 py-2.5 text-right">누적 실지급</th>
                {colShowOver ? (
                  <th className="dash-table-vline px-3 py-2.5 text-right">초과(급여 포함)</th>
                ) : null}
                {colShowUnder ? (
                  <th className="dash-table-vline px-3 py-2.5 text-right">미달(급여포함신고)</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.flatMap(({ emp, capBlocks, showOver, showUnder, effLabel }) =>
                capBlocks.map((b, idx) => (
                  <tr key={`${emp.id}-${b.key}`} className="border-b border-[var(--border)]/80">
                    {idx === 0 ? (
                      <>
                        <td
                          className="sticky left-0 z-[1] bg-[var(--surface)] px-3 py-2.5 font-mono text-xs font-medium tabular-nums align-top shadow-[2px_0_0_var(--border)]"
                          rowSpan={capBlocks.length}
                        >
                          {emp.employeeCode}
                        </td>
                        <td className="px-3 py-2.5 align-top font-medium" rowSpan={capBlocks.length}>
                          {emp.name}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums align-top" rowSpan={capBlocks.length}>
                          {emp.level}
                        </td>
                        <td
                          className="hidden max-w-[8.5rem] px-3 py-2.5 align-top text-[0.65rem] leading-snug text-[var(--muted)] md:table-cell"
                          rowSpan={capBlocks.length}
                          title={effLabel}
                        >
                          {effLabel}
                        </td>
                      </>
                    ) : null}
                    <td className="dash-table-vline-strong px-3 py-2.5 text-right tabular-nums align-top">
                      {b.hasCap ? format(b.cap) : "—"}
                    </td>
                    <td className="dash-table-vline px-3 py-2.5 align-top">
                      <div className="font-medium text-[var(--text)]">{b.title}</div>
                      <div className="mt-0.5 text-[0.65rem] leading-snug text-[var(--muted)]">실적: {b.actualLabel}</div>
                    </td>
                    <td className="dash-table-vline px-3 py-2.5 text-right tabular-nums align-top">{format(b.actual)}</td>
                    {colShowOver ? (
                      <td className="dash-table-vline px-3 py-2.5 text-right tabular-nums align-top">
                        {showOver ? (
                          b.hasCap && b.overage > 0 ? (
                            <span className="font-medium text-[var(--danger)]">{format(b.overage)}</span>
                          ) : (
                            "—"
                          )
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    ) : null}
                    {colShowUnder ? (
                      <td className="dash-table-vline px-3 py-2.5 text-right tabular-nums align-top">
                        {showUnder ? (
                          b.hasCap && b.underForSalaryReport > 0 ? (
                            <span className="font-medium text-[var(--warn)]">{format(b.underForSalaryReport)}</span>
                          ) : (
                            "—"
                          )
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">인센 → 사복 (월별 노트)</h2>
        <div className="surface overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto dash-panel-pad">
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-xs font-medium text-[var(--muted)]">
                  <th className="px-3 py-2.5">코드</th>
                  <th className="px-3 py-2.5">이름</th>
                  <th className="dash-table-vline-strong px-3 py-2.5 text-right">발생 인센 누적</th>
                  <th className="dash-table-vline px-3 py-2.5 text-right">사복(인센) 지급 누적</th>
                  <th className="dash-table-vline px-3 py-2.5 text-right">차액(급여포함)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ emp, incentiveWelfare }) => (
                  <tr key={`inc-${emp.id}`} className="border-b border-[var(--border)]/80">
                    <td className="px-3 py-2.5 font-mono text-xs">{emp.employeeCode}</td>
                    <td className="px-3 py-2.5">{emp.name}</td>
                    <td className="dash-table-vline-strong px-3 py-2.5 text-right tabular-nums">
                      {format(incentiveWelfare.accrualYtd)}
                    </td>
                    <td className="dash-table-vline px-3 py-2.5 text-right tabular-nums">
                      {format(incentiveWelfare.welfarePaymentYtd)}
                    </td>
                    <td className="dash-table-vline px-3 py-2.5 text-right tabular-nums">
                      {incentiveWelfare.excessForSalary > 0 ? (
                        <span className="font-medium text-[var(--danger)]">{format(incentiveWelfare.excessForSalary)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
