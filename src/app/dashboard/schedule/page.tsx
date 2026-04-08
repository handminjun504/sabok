import type { Employee } from "@/types/models";
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
import { canEditEmployees } from "@/lib/permissions";
import {
  buildMonthlyBreakdown,
  computeActualYearlyWelfareForEmployee,
  computeWelfareCapVsActual,
  monthlySalaryPortion,
} from "@/lib/domain/schedule";
import { saveMonthlyNoteFormAction } from "@/app/actions/quarterly";

function format(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function SchedulePage() {
  const { tenantId, role } = await requireTenantContext();
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

  const targetByLevel = new Map(targets.map((t) => [t.level, Number(t.targetAmount)]));

  type Row = {
    emp: Employee;
    byPaidMonth: Map<number, number>;
    yearlyWelfare: number;
    salaryMonth: number;
    capVs: ReturnType<typeof computeWelfareCapVsActual>;
  };

  const rows: Row[] = employees.map((emp) => {
    const ovr = overrides.filter((x) => x.employeeId === emp.id);
    const qcfg = quarterly.filter((x) => x.employeeId === emp.id);
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const br = buildMonthlyBreakdown(emp, year, foundingMonth, rules, ovr, qcfg, accrual);
    const byPaidMonth = new Map<number, number>();
    for (const r of br) {
      byPaidMonth.set(r.paidMonth, (byPaidMonth.get(r.paidMonth) ?? 0) + r.totalWelfareMonth);
    }
    for (const n of empNotes) {
      const extra = n.optionalExtraAmount != null ? Number(n.optionalExtraAmount) : 0;
      if (extra === 0) continue;
      byPaidMonth.set(n.month, (byPaidMonth.get(n.month) ?? 0) + extra);
    }

    const yearlyWelfare = computeActualYearlyWelfareForEmployee(
      emp,
      year,
      foundingMonth,
      accrual,
      rules,
      ovr,
      qcfg,
      empNotes
    );
    const capVs = computeWelfareCapVsActual(emp.welfareAllocation, yearlyWelfare);

    return {
      emp,
      byPaidMonth,
      yearlyWelfare,
      salaryMonth: monthlySalaryPortion(emp),
      capVs,
    };
  });

  const levelAgg = new Map<number, { cnt: number; sum: number; target: number }>();
  for (let lv = 1; lv <= 5; lv++) {
    const em = rows.filter((r) => r.emp.level === lv);
    const sum = em.reduce((s, r) => s + r.yearlyWelfare, 0);
    levelAgg.set(lv, { cnt: em.length, sum, target: targetByLevel.get(lv) ?? 0 });
  }

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const canNote = canEditEmployees(role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">월별 지급 스케줄</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도 {year} — 지급월 기준 합계(정기+분기+선택적 복지 추가금). 급여는 조정 연봉(없으면 기존 연봉) ÷ 12
          로 표시합니다. {accrual ? "정기분은 당월 귀속·차월 지급으로 표시했습니다." : "정기분은 귀속·지급이 같은 달입니다."}{" "}
          직원별 <strong>사복지급분</strong>(상한)보다 연간 합계가 크면 &quot;초과&quot;로 표시합니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((lv) => {
          const a = levelAgg.get(lv)!;
          const delta = a.sum - a.target;
          return (
            <div key={lv} className="surface p-4 text-sm">
              <p className="font-semibold">레벨 {lv}</p>
              <p className="text-[var(--muted)]">인원 {a.cnt}</p>
              <p>연간 사복 합계 {format(a.sum)}</p>
              <p>목표액 {format(a.target)}</p>
              <p className={delta > 0 ? "text-[var(--danger)]" : delta < 0 ? "text-[var(--warn)]" : "text-[var(--success)]"}>
                차이 {format(delta)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto surface p-2">
        <table className="min-w-[1100px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="sticky left-0 bg-[var(--surface)] px-2 py-2">코드</th>
              <th className="px-2 py-2">이름</th>
              <th className="px-2 py-2">레벨</th>
              {months.map((m) => (
                <th key={m} className="px-1 py-2">
                  {m}월
                </th>
              ))}
              <th className="px-2 py-2">급여(월)</th>
              <th className="px-2 py-2">급여+사복(월평균)</th>
              <th className="px-2 py-2">연간 사복 합계</th>
              <th className="whitespace-nowrap px-2 py-2">상한(사복지급분)</th>
              <th className="px-2 py-2">초과</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const avgWelfare = r.yearlyWelfare / 12;
              const avgTotal = r.salaryMonth + avgWelfare;
              return (
                <tr key={r.emp.id} className="border-b border-[var(--border)]">
                  <td className="sticky left-0 bg-[var(--surface)] px-2 py-1 font-mono">{r.emp.employeeCode}</td>
                  <td className="px-2 py-1">{r.emp.name}</td>
                  <td className="px-2 py-1">{r.emp.level}</td>
                  {months.map((m) => (
                    <td key={m} className="px-1 py-1 text-right">
                      {format(r.byPaidMonth.get(m) ?? 0)}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right">{format(r.salaryMonth)}</td>
                  <td className="px-2 py-1 text-right">{format(Math.round(avgTotal))}</td>
                  <td className="px-2 py-1 text-right">{format(r.yearlyWelfare)}</td>
                  <td className="px-2 py-1 text-right text-[var(--muted)]">
                    {r.capVs.hasCap ? format(r.capVs.cap) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {r.capVs.hasCap && r.capVs.overage > 0 ? (
                      <span className="font-medium text-[var(--danger)]">{format(r.capVs.overage)}</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>}
      </div>

      {canNote && (
        <form action={saveMonthlyNoteFormAction} className="surface space-y-3 p-4">
          <h2 className="text-sm font-semibold">선택적 복지 메모·추가 금액 (지급월에 합산)</h2>
          <input type="hidden" name="year" value={year} />
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-[var(--muted)]">직원</label>
              <select name="employeeId" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeCode} — {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">월</label>
              <input name="month" type="number" min={1} max={12} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">추가 금액</label>
              <input name="optionalExtraAmount" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" placeholder="0" />
            </div>
            <div className="sm:col-span-4">
              <label className="text-xs text-[var(--muted)]">메모 (선택)</label>
              <input name="optionalWelfareText" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
            저장
          </button>
        </form>
      )}
    </div>
  );
}
