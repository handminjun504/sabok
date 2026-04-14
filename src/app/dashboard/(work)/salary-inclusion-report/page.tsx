import Link from "next/link";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { customPaymentScheduleRows } from "@/lib/domain/payment-events";
import {
  SALARY_INCLUSION_VARIANCE_MODES,
  salaryInclusionShowOverage,
  salaryInclusionShowShortfall,
} from "@/lib/domain/salary-inclusion-display";
import {
  computeActualWelfareThroughPaidMonth,
  computeIncentiveWelfareSalaryInclusionYtd,
  computeSalaryInclusionVsActual,
  salaryInclusionCapLabel,
} from "@/lib/domain/schedule";

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

function parseThroughMonth(v: string | string[] | undefined): number {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = raw != null && raw !== "" ? Number(raw) : 12;
  if (!Number.isInteger(n) || n < 1 || n > 12) return 12;
  return n;
}

export default async function SalaryInclusionReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const throughMonth = parseThroughMonth(sp.throughMonth);

  const { tenantId } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const accrual = settings?.accrualCurrentMonthPayNext ?? false;
  const varianceMode = settings?.salaryInclusionVarianceMode ?? "BOTH";
  const showOver = salaryInclusionShowOverage(varianceMode);
  const showUnder = salaryInclusionShowShortfall(varianceMode);
  const varianceModeLabel =
    SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === varianceMode)?.label ?? varianceMode;

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
    const capVs = computeSalaryInclusionVsActual(emp, actual);
    const incentiveWelfare = computeIncentiveWelfareSalaryInclusionYtd(empNotes, year, throughMonth);
    return { emp, capVs, incentiveWelfare };
  });

  const monthLinks = (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-[var(--muted)]">누적 지급월:</span>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
        <Link
          key={m}
          href={m === 12 ? "/dashboard/salary-inclusion-report" : `/dashboard/salary-inclusion-report?throughMonth=${m}`}
          className={
            throughMonth === m
              ? "rounded-md bg-[var(--accent)] px-2 py-0.5 font-medium text-white"
              : "rounded-md px-2 py-0.5 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          }
        >
          {m === 12 ? "연간(12월)" : `${m}월까지`}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">급여포함신고</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도 <strong>{year}</strong> · 지급월 <strong>1~{throughMonth}월</strong> 누적 실지급 vs 상한.
          예상 인센(<code className="text-xs">인센티브</code> 필드)이 있으면 그 금액이 연간 상한이고, 없으면 사복지급분이 상한입니다.
          {showOver ? (
            <>
              {" "}
              실지급이 상한을 넘기면 <strong className="text-[var(--text)]">초과분은 급여(과세)에 포함해 신고</strong>하는 흐름을
              전제로 합니다.
            </>
          ) : null}
          {showUnder && !showOver ? (
            <>
              {" "}
              아래 표는 <strong className="text-[var(--text)]">상한보다 적게 지급한 금액(미달)</strong>만 열로 보여 줍니다.
            </>
          ) : null}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          표시 방식: <strong className="text-[var(--text)]">{varianceModeLabel}</strong> ·{" "}
          <Link href="/dashboard/settings" className="text-[var(--accent)] hover:underline">
            전사 설정
          </Link>
          에서 변경
        </p>
        {monthLinks}
      </div>

      <div className="surface overflow-x-auto dash-panel-pad">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
              <th className="px-3 py-2">코드</th>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">레벨</th>
              <th className="px-3 py-2 text-right">상한</th>
              <th className="px-3 py-2">상한 기준</th>
              <th className="px-3 py-2 text-right">누적 실지급</th>
              {showOver ? <th className="px-3 py-2 text-right">초과(급여 포함)</th> : null}
              {showUnder ? <th className="px-3 py-2 text-right">미달(급여포함신고)</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, capVs }) => (
              <tr key={emp.id} className="border-b border-[var(--border)]">
                <td className="px-3 py-2 font-mono">{emp.employeeCode}</td>
                <td className="px-3 py-2">{emp.name}</td>
                <td className="px-3 py-2">{emp.level}</td>
                <td className="px-3 py-2 text-right">{capVs.hasCap ? format(capVs.cap) : "—"}</td>
                <td className="px-3 py-2 text-xs text-[var(--muted)]">{salaryInclusionCapLabel(capVs.capSource)}</td>
                <td className="px-3 py-2 text-right">{format(capVs.actual)}</td>
                {showOver ? (
                  <td className="px-3 py-2 text-right">
                    {capVs.hasCap && capVs.overage > 0 ? (
                      <span className="font-medium text-[var(--danger)]">{format(capVs.overage)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
                {showUnder ? (
                  <td className="px-3 py-2 text-right">
                    {capVs.hasCap && capVs.underForSalaryReport > 0 ? (
                      <span className="font-medium text-[var(--warn)]">{format(capVs.underForSalaryReport)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">인센 → 사복 (월별 노트)</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          인센을 사복으로 지급하기로 한 경우, <strong className="text-[var(--text)]">스케줄 → 선택적 복지·메모</strong>에서
          해당 월의 <strong className="text-[var(--text)]">발생 인센</strong>과 <strong className="text-[var(--text)]">사복으로 지급할 인센</strong>을
          넣습니다. 지급월 1~{throughMonth}월 누적 발생이 누적 사복(인센) 지급보다 크면, 차액은 급여에 포함해 신고합니다.
          (예: 1월 발생 307,000 + 2월 발생 203,100 = 510,100, 2월 사복 지급 500,000 → 차액 10,100)
        </p>
        <div className="surface mt-3 overflow-x-auto dash-panel-pad">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
                <th className="px-3 py-2">코드</th>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2 text-right">발생 인센 누적</th>
                <th className="px-3 py-2 text-right">사복(인센) 지급 누적</th>
                <th className="px-3 py-2 text-right">차액(급여포함)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ emp, incentiveWelfare }) => (
                <tr key={`inc-${emp.id}`} className="border-b border-[var(--border)]">
                  <td className="px-3 py-2 font-mono">{emp.employeeCode}</td>
                  <td className="px-3 py-2">{emp.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{format(incentiveWelfare.accrualYtd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{format(incentiveWelfare.welfarePaymentYtd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
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
    </div>
  );
}
