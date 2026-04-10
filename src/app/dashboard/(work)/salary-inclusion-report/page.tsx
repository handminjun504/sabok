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
  computeActualYearlyWelfareForEmployee,
  computeWelfareCapVsActual,
} from "@/lib/domain/schedule";

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function SalaryInclusionReportPage() {
  const { tenantId } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const accrual = settings?.accrualCurrentMonthPayNext ?? false;

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
    const actual = computeActualYearlyWelfareForEmployee(
      emp,
      year,
      foundingMonth,
      accrual,
      rules,
      ovr,
      qcfg,
      empNotes,
      customSchedule
    );
    const capVs = computeWelfareCapVsActual(emp.welfareAllocation, actual);
    return { emp, capVs };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">급여포함신고</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도 <strong>{year}</strong> · 사복지급분(상한) vs 연간 실지급 · 초과·미달(급여포함신고)
        </p>
      </div>

      <div className="overflow-x-auto surface p-2">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
              <th className="px-3 py-2">코드</th>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">레벨</th>
              <th className="px-3 py-2 text-right">사복지급분(상한)</th>
              <th className="px-3 py-2 text-right">연간 실지급 합계</th>
              <th className="px-3 py-2 text-right">초과</th>
              <th className="px-3 py-2 text-right">미달(급여포함신고)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, capVs }) => (
              <tr key={emp.id} className="border-b border-[var(--border)]">
                <td className="px-3 py-2 font-mono">{emp.employeeCode}</td>
                <td className="px-3 py-2">{emp.name}</td>
                <td className="px-3 py-2">{emp.level}</td>
                <td className="px-3 py-2 text-right">{capVs.hasCap ? format(capVs.cap) : "—"}</td>
                <td className="px-3 py-2 text-right">{format(capVs.actual)}</td>
                <td className="px-3 py-2 text-right">
                  {capVs.hasCap && capVs.overage > 0 ? (
                    <span className="font-medium text-[var(--danger)]">{format(capVs.overage)}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {capVs.hasCap && capVs.underForSalaryReport > 0 ? (
                    <span className="font-medium text-[var(--warn)]">{format(capVs.underForSalaryReport)}</span>
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
  );
}
