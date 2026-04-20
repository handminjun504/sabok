import type { Employee } from "@/types/models";

export const dynamic = "force-dynamic";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  monthlyNoteListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
  tenantGetById,
  vendorListByTenant,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings, canEditEmployees } from "@/lib/permissions";
import { customPaymentDefsForYear, customPaymentScheduleRows } from "@/lib/domain/payment-events";
import {
  buildMonthlyBreakdown,
  computeActualYearlyWelfareForEmployee,
  computeSalaryInclusionCapBlocks,
  monthlySalaryPortion,
  regularAnnualTotalsByLevel,
  welfareByScheduleDisplayMonth,
  welfareScheduleLinesByMonth,
} from "@/lib/domain/schedule";
import { parseTenantOperationMode } from "@/lib/domain/tenant-profile";
import { additionalReserveStatus, summarizeTenantAdditionalReserve } from "@/lib/domain/vendor-reserve";
import {
  saveMonthlyIncentiveAccrualYearFormAction,
  saveMonthlyNoteFormAction,
} from "@/app/actions/quarterly";
import {
  effectiveSalaryInclusionVarianceMode,
  salaryInclusionShowOverage,
  salaryInclusionShowShortfall,
} from "@/lib/domain/salary-inclusion-display";
import { CommaWonInput } from "@/components/CommaWonInput";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";
import { Tabs } from "@/components/Tabs";
import { ScheduleEmployeeLevelAssignments } from "@/components/ScheduleEmployeeLevelAssignments";
import { MonthlyIncentiveAccrualGrid } from "@/components/MonthlyIncentiveAccrualGrid";
import { ScheduleAnnouncementPanel } from "@/components/ScheduleAnnouncementPanel";
import { ScheduleEmployeeCards } from "@/components/ScheduleEmployeeCards";
import { ScheduleReserveTab } from "@/components/ScheduleReserveTab";

export default async function SchedulePage() {
  const { tenantId, role } = await requireTenantContext();
  const [settings, tenantRow] = await Promise.all([
    companySettingsByTenant(tenantId),
    tenantGetById(tenantId),
  ]);
  const tenantOperationMode = parseTenantOperationMode(tenantRow?.operationMode);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const accrual = settings?.accrualCurrentMonthPayNext ?? false;
  const tenantVarianceMode = settings?.salaryInclusionVarianceMode ?? "BOTH";

  const employees = await employeeListByTenantCodeAsc(tenantId);
  const ids = employees.map((e) => e.id);

  const vendors = await vendorListByTenant(tenantId);
  const reserveSummary =
    tenantRow != null
      ? summarizeTenantAdditionalReserve(
          { clientEntityType: tenantRow.clientEntityType, headOfficeCapital: tenantRow.headOfficeCapital },
          vendors
        )
      : { kind: "NO_VENDORS" as const };
  /** 거래처 타입(개인/법인) + 자본금 50% 진행도로 “현재 +20% 적립 활성?” 결정.
   *  거래처 정보를 못 불러올 때는 보수적으로 활성(NO_VENDORS) 처리. */
  const reserveStatus = additionalReserveStatus(
    { clientEntityType: tenantRow?.clientEntityType ?? "INDIVIDUAL" },
    reserveSummary,
  );
  const canEditReserveNote = canEditCompanySettings(role) && settings != null;

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
    capBlocks: ReturnType<typeof computeSalaryInclusionCapBlocks>;
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
    const capBlocks = computeSalaryInclusionCapBlocks(
      emp,
      yearlyWelfare,
      empNotes,
      year,
      tenantOperationMode,
      12
    );

    return {
      emp,
      welfareByMonth,
      welfareLinesByMonth,
      yearlyWelfare,
      salaryMonth: monthlySalaryPortion(emp),
      capBlocks,
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
    const eff = effectiveSalaryInclusionVarianceMode(r.emp, tenantVarianceMode);
    return {
      employeeId: r.emp.id,
      employeeCode: r.emp.employeeCode,
      name: r.emp.name,
      level: r.emp.level,
      welfareByMonth,
      linesByMonth,
      yearlyWelfare: r.yearlyWelfare,
      salaryMonth: r.salaryMonth,
      flagRepReturn: r.emp.flagRepReturn,
      discretionaryAmount: r.emp.discretionaryAmount,
      showCapOver: salaryInclusionShowOverage(eff),
      showCapUnder: salaryInclusionShowShortfall(eff),
      capBlocks: r.capBlocks.map((b) => ({
        key: b.key,
        title: b.title,
        actualLabel: b.actualLabel,
        hasCap: b.hasCap,
        cap: b.cap,
        actual: b.actual,
        overage: b.overage,
        underForSalaryReport: b.underForSalaryReport,
      })),
    };
  });

  const incentiveAccrualRows = employees.map((emp) => {
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const incentiveAccrualByMonth: Record<number, number | null> = {};
    for (let m = 1; m <= 12; m++) {
      const hit = empNotes.find((x) => x.month === m);
      incentiveAccrualByMonth[m] = hit?.incentiveAccrualAmount ?? null;
    }
    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.name,
      incentiveAccrualByMonth,
    };
  });

  const scheduleTab = <ScheduleEmployeeCards year={year} rows={scheduleCardRows} />;

  const announcementTab = (
    <ScheduleAnnouncementPanel
      year={year}
      rows={scheduleCardRows}
      operationMode={tenantOperationMode}
      reserveStatus={reserveStatus}
      announcementMode={tenantRow?.announcementMode ?? "SINGLE"}
      defaultBatchFromMonth={tenantRow?.announcementBatchFromMonth ?? null}
      defaultBatchToMonth={tenantRow?.announcementBatchToMonth ?? null}
    />
  );

  const reserveTab =
    tenantRow != null ? (
      <ScheduleReserveTab
        summary={reserveSummary}
        clientEntityType={tenantRow.clientEntityType}
        headOfficeCapitalWon={tenantRow.headOfficeCapital}
        initialNote={settings?.reserveProgressNote ?? null}
        canEdit={canEditReserveNote}
        settingsMissing={!settings}
      />
    ) : (
      <p className="text-sm text-[var(--muted)]">거래처 정보를 불러올 수 없습니다.</p>
    );

  const incentiveAccrualTab = (
    <div className="surface dash-panel-pad">
      <MonthlyIncentiveAccrualGrid
        year={year}
        rows={incentiveAccrualRows}
        canEdit={canNote}
        saveAction={saveMonthlyIncentiveAccrualYearFormAction}
      />
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
        <p className="mt-2 text-sm text-[var(--muted)]">
          카카오·문자 안내문은 <span className="font-semibold text-[var(--text)]">「안내 멘트」</span> 탭에서,
          자본금 50% 한도·추가 적립 누적·메모는 <span className="font-semibold text-[var(--text)]">「적립금」</span>{" "}
          탭에서 확인할 수 있습니다.
        </p>
      </div>
      <Tabs
        tabs={[
          { label: "월별 스케줄", content: scheduleTab },
          { label: "안내 멘트", content: announcementTab },
          { label: "적립금", content: reserveTab },
          { label: "월별 발생 인센", content: incentiveAccrualTab },
          { label: "레벨·예정액", content: levelAssignmentTab },
          { label: "선택적 복지·메모", content: noteTab },
        ]}
      />
    </div>
  );
}
