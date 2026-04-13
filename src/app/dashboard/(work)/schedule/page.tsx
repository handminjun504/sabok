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
import { customPaymentScheduleRows } from "@/lib/domain/payment-events";
import {
  buildMonthlyBreakdown,
  computeActualYearlyWelfareForEmployee,
  computeSalaryInclusionVsActual,
  monthlySalaryPortion,
} from "@/lib/domain/schedule";
import { saveMonthlyNoteFormAction } from "@/app/actions/quarterly";
import { CommaWonInput } from "@/components/CommaWonInput";
import { Tabs } from "@/components/Tabs";

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
    capVs: ReturnType<typeof computeSalaryInclusionVsActual>;
  };

  const customSchedule = customPaymentScheduleRows(settings, year);

  const rows: Row[] = employees.map((emp) => {
    const ovr = overrides.filter((x) => x.employeeId === emp.id);
    const qcfg = quarterly.filter((x) => x.employeeId === emp.id);
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const br = buildMonthlyBreakdown(emp, year, foundingMonth, rules, ovr, qcfg, accrual, customSchedule);
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
      empNotes,
      customSchedule
    );
    const capVs = computeSalaryInclusionVsActual(emp, yearlyWelfare);

    return { emp, byPaidMonth, yearlyWelfare, salaryMonth: monthlySalaryPortion(emp), capVs };
  });

  const levelAgg = new Map<number, { cnt: number; sum: number; target: number }>();
  for (let lv = 1; lv <= 5; lv++) {
    const em = rows.filter((r) => r.emp.level === lv);
    const sum = em.reduce((s, r) => s + r.yearlyWelfare, 0);
    levelAgg.set(lv, { cnt: em.length, sum, target: targetByLevel.get(lv) ?? 0 });
  }

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const canNote = canEditEmployees(role);

  const scheduleTab = (
    <div className="space-y-5">
      {/* 레벨별 요약 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((lv) => {
          const a = levelAgg.get(lv)!;
          const delta = a.sum - a.target;
          const deltaColor =
            delta > 0 ? "text-[var(--danger)]" : delta < 0 ? "text-[var(--warn)]" : "text-[var(--success)]";
          return (
            <div key={lv} className="surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">레벨 {lv}</p>
              <p className="mt-1 text-lg font-bold text-[var(--text)]">{a.cnt}명</p>
              <div className="mt-2 space-y-0.5 text-xs text-[var(--muted)]">
                <p>연간 {format(a.sum)}</p>
                <p>목표 {format(a.target)}</p>
                <p className={`font-medium ${deltaColor}`}>
                  차이 {delta > 0 ? "+" : ""}{format(delta)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 월별 스케줄 표 */}
      <div className="surface overflow-x-auto p-2">
        <table className="min-w-[1100px] text-left text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="sticky left-0 bg-[var(--surface)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">코드</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">이름</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">레벨</th>
              {months.map((m) => (
                <th key={m} className="px-1.5 py-2.5 text-[10px] font-semibold tracking-wide text-[var(--muted)]">
                  {m}월
                </th>
              ))}
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">급여(월)</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">급여+기금(월평)</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">연간 기금 합계</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">상한</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">초과</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const avgWelfare = r.yearlyWelfare / 12;
              const avgTotal = r.salaryMonth + avgWelfare;
              return (
                <tr key={r.emp.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                  <td className="sticky left-0 bg-[var(--surface)] px-3 py-2 font-mono group-hover:bg-[var(--surface-hover)]">{r.emp.employeeCode}</td>
                  <td className="px-3 py-2">{r.emp.name}</td>
                  <td className="px-3 py-2 text-center">{r.emp.level}</td>
                  {months.map((m) => (
                    <td key={m} className="px-1.5 py-2 text-right tabular-nums">
                      {format(r.byPaidMonth.get(m) ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">{format(r.salaryMonth)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{format(Math.round(avgTotal))}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{format(r.yearlyWelfare)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                    {r.capVs.hasCap ? format(r.capVs.cap) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
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
        {rows.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>}
      </div>
    </div>
  );

  const noteTab = canNote ? (
    <div className="surface p-5">
      <p className="mb-4 text-sm text-[var(--muted)]">
        선택 복지는 여기서만 입력 · 해당 월 합계에 더해집니다.
        인센을 사복으로 지급하는 경우 같은 직원·연도·월에 <strong className="text-[var(--text)]">발생 인센</strong>과{" "}
        <strong className="text-[var(--text)]">사복으로 지급할 인센</strong>을 넣으면, 급여포함신고 화면에서 누적 차액을 봅니다.
      </p>
      <form action={saveMonthlyNoteFormAction} className="space-y-4">
        <input type="hidden" name="year" value={year} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">직원</label>
            <select name="employeeId"
              className="input"
              required>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">월</label>
            <input name="month" type="number" min={1} max={12}
              className="input"
              required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">선택적 복지 금액</label>
            <CommaWonInput name="optionalExtraAmount" className="input" placeholder="원 단위" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">발생 인센 (선택)</label>
            <CommaWonInput name="incentiveAccrualAmount" className="input" placeholder="그 달 귀속" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">사복으로 지급할 인센 (선택)</label>
            <CommaWonInput name="incentiveWelfarePaymentAmount" className="input" placeholder="그 달 사복 지급분" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">메모 (선택)</label>
            <input name="optionalWelfareText"
              className="input" />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">저장</button>
      </form>
    </div>
  ) : (
    <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">월별 지급 스케줄</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도 <strong>{year}</strong> · 지급월 합계(정기+분기+선택 복지).{" "}
          {accrual ? "정기는 당월 귀속·익월 지급." : "정기는 귀속·지급 동월."} 연간 기금 합계 대비 상한은{" "}
          <strong className="text-[var(--text)]">예상 인센</strong>(입력 시) 또는 <strong className="text-[var(--text)]">사복지급분</strong>입니다.
        </p>
      </div>
      <Tabs
        tabs={[
          { label: "월별 스케줄", content: scheduleTab },
          { label: "선택적 복지·메모", content: noteTab },
        ]}
      />
    </div>
  );
}
