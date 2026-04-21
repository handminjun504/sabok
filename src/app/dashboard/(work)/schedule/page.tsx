import type { Employee } from "@/types/models";

export const dynamic = "force-dynamic";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeIdsYear,
  levelPaymentRuleList,
  monthlyNoteListByTenantYear,
  monthlyPaymentStatusListByTenantYear,
  quarterlyEmployeeConfigListByTenantYear,
  tenantGetById,
  vendorListByTenant,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings, canEditEmployees } from "@/lib/permissions";
import {
  customPaymentDefsForYear,
  customPaymentScheduleRows,
  effectiveFixedEventMonthMap,
} from "@/lib/domain/payment-events";
import {
  buildMonthlyBreakdown,
  computeActualYearlyWelfareForEmployee,
  computeSalaryInclusionCapBlocks,
  employeeStatusForYear,
  monthlySalaryPortion,
  regularAnnualTotalsByLevel,
  welfareByScheduleDisplayMonth,
  welfareScheduleLinesByMonth,
} from "@/lib/domain/schedule";
import { parseTenantOperationMode } from "@/lib/domain/tenant-profile";
import { additionalReserveStatus, summarizeTenantAdditionalReserve } from "@/lib/domain/vendor-reserve";
import {
  saveMonthlyNoteFormAction,
  setMonthPaidConfirmedAction,
  setMonthlyIncentiveAccrualCellAction,
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
import {
  ScheduleEmployeeTable,
  type ScheduleTableEmploymentStatus,
  type ScheduleTableRow,
} from "@/components/ScheduleEmployeeTable";
import { ScheduleReserveTab } from "@/components/ScheduleReserveTab";
import { Alert } from "@/components/ui/Alert";
import Link from "next/link";

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

  const [rules, overrides, quarterly, notes, monthPaidStatuses] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeIdsYear(ids, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids),
    monthlyNoteListByTenantYear(tenantId, year, ids),
    monthlyPaymentStatusListByTenantYear(tenantId, year),
  ]);
  /** 1~12 → 해당 월이 ‘지급완료’ 표시되었는지(테넌트·연 단위). 누락된 월은 false. */
  const paidByMonth: Record<number, boolean> = {};
  for (let m = 1; m <= 12; m++) paidByMonth[m] = false;
  for (const s of monthPaidStatuses) {
    if (s.month >= 1 && s.month <= 12) paidByMonth[s.month] = s.paidConfirmed === true;
  }

  const regularTotalsByLevel = regularAnnualTotalsByLevel(rules, year);

  type Row = {
    emp: Employee;
    /** 1~12월 열: 정기=귀속월, 분기·선택 복지=지급월 */
    welfareByMonth: Map<number, number>;
    /** 월별 항목 내역(합계와 동일 귀속·지급 기준) */
    welfareLinesByMonth: Map<number, { label: string; amount: number; kind: "regular" | "quarterly" | "note" }[]>;
    yearlyWelfare: number;
    salaryMonth: number;
    capBlocks: ReturnType<typeof computeSalaryInclusionCapBlocks>;
  };

  const customDefs = customPaymentDefsForYear(settings, year);
  const customSchedule = customPaymentScheduleRows(settings, year);
  /** 내장 정기 4종(NEW_YEAR_FEB/FAMILY_MAY/CHUSEOK_AUG/YEAR_END_NOV) 의 업체별 귀속월 오버라이드. */
  const fixedEventMonths = effectiveFixedEventMonthMap(settings);

  const rows: Row[] = employees.map((emp) => {
    const ovr = overrides.filter((x) => x.employeeId === emp.id);
    const qcfg = quarterly.filter((x) => x.employeeId === emp.id);
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const br = buildMonthlyBreakdown(emp, year, foundingMonth, rules, ovr, qcfg, accrual, customSchedule, fixedEventMonths);
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
      customSchedule,
      fixedEventMonths,
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
    const linesByMonth: Record<number, { label: string; amount: number; kind?: "regular" | "quarterly" | "note" }[]> = {};
    for (let m = 1; m <= 12; m++) {
      welfareByMonth[m] = r.welfareByMonth.get(m) ?? 0;
      linesByMonth[m] = (r.welfareLinesByMonth.get(m) ?? []).map((line) => ({
        label: line.label,
        amount: line.amount,
        kind: line.kind,
      }));
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

  /**
   * 표(테이블) 모드용 행 — 카드 행에 직원 활성 상태(퇴사자 취소선·비활성 월 표시)를 더한 형태.
   * 위에서 만든 카드 행을 그대로 활용해 동일 데이터를 두 번 만들지 않는다.
   */
  const scheduleTableRows: ScheduleTableRow[] = rows.map((r, idx) => {
    const card = scheduleCardRows[idx]!;
    const status = employeeStatusForYear(r.emp, year);
    const tableStatus: ScheduleTableEmploymentStatus =
      status.kind === "ACTIVE_PARTIAL"
        ? { kind: "ACTIVE_PARTIAL", fromMonth: status.range.fromMonth, toMonth: status.range.toMonth }
        : status.kind === "AFTER_RESIGN"
          ? { kind: "AFTER_RESIGN", resignYear: status.resignYear, resignMonth: status.resignMonth }
          : { kind: "ACTIVE_FULL_YEAR" };
    return { ...card, status: tableStatus };
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
      /** 직원 마스터의 ‘예상 인센’ — 행 끝 ‘잔여(예상−누적)’ 비교에 사용 */
      incentiveAmount: emp.incentiveAmount,
    };
  });

  const scheduleTab = (
    <ScheduleEmployeeTable
      year={year}
      rows={scheduleTableRows}
      canEdit={canNote}
      paidByMonth={paidByMonth}
      setMonthPaidConfirmed={setMonthPaidConfirmedAction}
    />
  );

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
        setCell={setMonthlyIncentiveAccrualCellAction}
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

  /** 분기 항목이 등록은 됐지만 paymentMonths 가 한 달뿐인 게 전부면, PB 컬럼이 빠진 사고일 가능성 — 스케줄 카드에 분기 합이 한 달만 잡혀 보일 수 있어 한 번 더 안내. */
  const quarterlyOnlySingleMonth =
    quarterly.length > 0 && quarterly.every((c) => c.paymentMonths.length <= 1);
  /** 등록된 분기 항목 자체가 0건 — “분기가 안 보인다” 가 사실 “등록을 안 했다” 인 경우. */
  const quarterlyEmpty = quarterly.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">월별 지급 스케줄</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{year}년 — 정기 지급(귀속월) + 분기 지원(지급월) + 선택 복지를 같은 칸에 합산해 표시합니다.</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          카카오·문자 안내문은 <span className="font-semibold text-[var(--text)]">「안내 멘트」</span> 탭에서,
          자본금 50% 한도·추가 적립 누적·메모는 <span className="font-semibold text-[var(--text)]">「적립금」</span>{" "}
          탭에서 확인할 수 있습니다.
        </p>
      </div>

      {quarterlyEmpty ? (
        <Alert tone="info" title="분기 지원이 아직 등록되지 않았습니다">
          월별 스케줄에는 정기 지급만 표시되고 있습니다. 분기 지원 금액을 함께 보려면{" "}
          <Link href="/dashboard/quarterly" className="font-semibold text-[var(--accent)] hover:underline">
            「분기 지원금」
          </Link>{" "}
          메뉴에서 항목·지급 월·금액을 등록하세요.
        </Alert>
      ) : quarterlyOnlySingleMonth ? (
        <Alert tone="warn" title="분기 지원의 지급 월이 1개씩만 저장되어 있습니다">
          PocketBase{" "}
          <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-xs">
            sabok_quarterly_employee_configs
          </code>{" "}
          컬렉션에 <strong>json 필드 paymentMonths</strong> 가 없으면 첫 달만 저장돼 스케줄·총 지급금액에도 일부만
          반영됩니다.{" "}
          <Link href="/dashboard/quarterly" className="font-semibold text-[var(--accent)] hover:underline">
            「분기 지원금」
          </Link>{" "}
          페이지의 진단 배너를 따라 PB 필드를 추가한 뒤, 각 항목을 다시 저장해 주세요.
        </Alert>
      ) : null}
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
