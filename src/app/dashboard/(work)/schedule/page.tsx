import type { Employee } from "@/types/models";

export const dynamic = "force-dynamic";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees } from "@/lib/permissions";
import { customPaymentDefsForYear, customPaymentScheduleRows } from "@/lib/domain/payment-events";
import {
  buildMonthlyBreakdown,
  computeActualYearlyWelfareForEmployee,
  computeSalaryInclusionVsActual,
  monthlySalaryPortion,
  regularAnnualTotalsByLevel,
  welfareByScheduleDisplayMonth,
  welfareScheduleLinesByMonth,
} from "@/lib/domain/schedule";
import { saveMonthlyNoteFormAction } from "@/app/actions/quarterly";
import {
  salaryInclusionShowOverage,
  salaryInclusionShowShortfall,
} from "@/lib/domain/salary-inclusion-display";
import { CommaWonInput } from "@/components/CommaWonInput";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";
import { Tabs } from "@/components/Tabs";
import { ScheduleEmployeeLevelAssignments } from "@/components/ScheduleEmployeeLevelAssignments";
import { ScheduleEmployeeCards } from "@/components/ScheduleEmployeeCards";

export default async function SchedulePage() {
  const { tenantId, role } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const accrual = settings?.accrualCurrentMonthPayNext ?? false;
  const varianceMode = settings?.salaryInclusionVarianceMode ?? "BOTH";
  const showCapOver = salaryInclusionShowOverage(varianceMode);
  const showCapUnder = salaryInclusionShowShortfall(varianceMode);

  const employees = await employeeListByTenantCodeAsc(tenantId);
  const ids = employees.map((e) => e.id);

  const [rules, overrides, quarterly, notes] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeIdsYear(ids, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids),
    monthlyNoteListByTenantYear(tenantId, year, ids),
  ]);

  const regularTotalsByLevel = regularAnnualTotalsByLevel(rules, year);

  type Row = {
    emp: Employee;
    /** 1~12월 열: 정기=귀속월, 분기·선택 복지=지급월 */
    welfareByMonth: Map<number, number>;
    /** 월별 항목 내역(합계와 동일 귀속·지급 기준) */
    welfareLinesByMonth: Map<number, { label: string; amount: number }[]>;
    yearlyWelfare: number;
    salaryMonth: number;
    capVs: ReturnType<typeof computeSalaryInclusionVsActual>;
  };

  const customDefs = customPaymentDefsForYear(settings, year);
  const customSchedule = customPaymentScheduleRows(settings, year);

  const rows: Row[] = employees.map((emp) => {
    const ovr = overrides.filter((x) => x.employeeId === emp.id);
    const qcfg = quarterly.filter((x) => x.employeeId === emp.id);
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const br = buildMonthlyBreakdown(emp, year, foundingMonth, rules, ovr, qcfg, accrual, customSchedule);
    const noteByMonth = new Map<number, number>();
    for (const n of empNotes) {
      const extra = n.optionalExtraAmount != null ? Number(n.optionalExtraAmount) : 0;
      if (extra === 0) continue;
      noteByMonth.set(n.month, (noteByMonth.get(n.month) ?? 0) + extra);
    }
    const welfareByMonth = welfareByScheduleDisplayMonth(br, noteByMonth);
    const welfareLinesByMonth = welfareScheduleLinesByMonth(br, noteByMonth, customDefs);

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

    return {
      emp,
      welfareByMonth,
      welfareLinesByMonth,
      yearlyWelfare,
      salaryMonth: monthlySalaryPortion(emp),
      capVs,
    };
  });

  const canNote = canEditEmployees(role);

  const scheduleCardRows = rows.map((r) => {
    const welfareByMonth: Record<number, number> = {};
    const linesByMonth: Record<number, { label: string; amount: number }[]> = {};
    for (let m = 1; m <= 12; m++) {
      welfareByMonth[m] = r.welfareByMonth.get(m) ?? 0;
      linesByMonth[m] = r.welfareLinesByMonth.get(m) ?? [];
    }
    return {
      employeeId: r.emp.id,
      employeeCode: r.emp.employeeCode,
      name: r.emp.name,
      level: r.emp.level,
      welfareByMonth,
      linesByMonth,
      yearlyWelfare: r.yearlyWelfare,
      salaryMonth: r.salaryMonth,
      capVs: {
        hasCap: r.capVs.hasCap,
        cap: r.capVs.cap,
        overage: r.capVs.overage,
        underForSalaryReport: r.capVs.underForSalaryReport,
      },
    };
  });

  const scheduleTab = (
    <div className="space-y-5">
      <div className="surface dash-panel-pad">
        <p className="mb-4 text-xs leading-relaxed text-[var(--muted)]">
          정기 행사는 귀속 월, 분기·선택 복지는 설정한 지급 월 열에 표시됩니다. (기존 시트 「월별지급스케줄」과 동일 규칙)
        </p>
        <ScheduleEmployeeCards
          year={year}
          rows={scheduleCardRows}
          showCapOver={showCapOver}
          showCapUnder={showCapUnder}
        />
      </div>
    </div>
  );

  const levelAssignmentTab = (
    <div className="space-y-4">
      <ScheduleEmployeeLevelAssignments
        employees={employees.map((e) => ({
          id: e.id,
          employeeCode: e.employeeCode,
          name: e.name,
          level: e.level,
          expectedYearlyWelfare: e.expectedYearlyWelfare,
        }))}
        regularTotalsByLevel={regularTotalsByLevel}
        canEdit={canNote}
      />
    </div>
  );

  const noteTab = canNote ? (
    <CollapsibleEditorPanel
      title="선택적 복지·메모"
      triggerLabel="작성·수정 열기"
      defaultOpen={false}
    >
      <form action={saveMonthlyNoteFormAction} className="space-y-3">
        <input type="hidden" name="year" value={year} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="dash-field-label">직원</label>
            <select name="employeeId"
              className="input w-full max-w-md text-xs"
              required>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="dash-field-label">월</label>
            <input name="month" type="number" min={1} max={12}
              className="input w-[4.5rem] text-xs"
              required />
          </div>
          <div>
            <label className="dash-field-label">선택적 복지 금액</label>
            <CommaWonInput name="optionalExtraAmount" className="input w-full max-w-xs text-xs" placeholder="원 단위" />
          </div>
          <div>
            <label className="dash-field-label">발생 인센 (선택)</label>
            <CommaWonInput name="incentiveAccrualAmount" className="input w-full max-w-xs text-xs" placeholder="그 달 귀속" />
          </div>
          <div>
            <label className="dash-field-label">사복으로 지급할 인센 (선택)</label>
            <CommaWonInput name="incentiveWelfarePaymentAmount" className="input w-full max-w-xs text-xs" placeholder="그 달 사복 지급분" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="dash-field-label">메모 (선택)</label>
            <input name="optionalWelfareText"
              className="input w-full text-xs" />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">저장</button>
      </form>
    </CollapsibleEditorPanel>
  ) : (
    <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">월별 지급 스케줄</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{year}년</p>
        <p className="mt-2 max-w-xl text-xs text-[var(--muted)]">
          레벨 규칙·예정액·레벨 변경은 「레벨·예정액」 탭, 행사별 금액·목표는 「레벨/행사」 메뉴입니다.
        </p>
      </div>
      <Tabs
        tabs={[
          { label: "월별 스케줄", content: scheduleTab },
          { label: "레벨·예정액", content: levelAssignmentTab },
          { label: "선택적 복지·메모", content: noteTab },
        ]}
      />
    </div>
  );
}
