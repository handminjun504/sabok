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
  allPaymentEventKeysForYear,
  customPaymentDefsForYear,
  customPaymentScheduleRows,
  effectiveFixedEventMonthMap,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import {
  buildMonthlyBreakdown,
  computeActualYearlyWelfareForEmployee,
  computeSalaryInclusionCapBlocks,
  employeeStatusForYear,
  monthlyOverrideMapFromNotes,
  monthlySalaryPortion,
  regularAnnualTotalsByLevel,
  resolveEventAmount,
  welfareByScheduleDisplayMonth,
  welfareScheduleLinesByMonth,
} from "@/lib/domain/schedule";
import { PAYMENT_EVENT_LABELS, QUARTERLY_ITEM_LABELS } from "@/lib/business-rules";
import type { PaymentEventKey, QuarterlyItemKey } from "@/lib/business-rules";
import type {
  ScheduleEditAvailableEvent,
  ScheduleEditMonthEvent,
} from "@/components/ScheduleEmployeeEditModal";
import { resolveEffectiveAdjustedSalaryForMonth } from "@/lib/domain/salary-inclusion";
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
import { AdjustedSalaryAuditPanel } from "@/components/AdjustedSalaryAuditPanel";
import { computeAdjustedSalaryAuditList } from "@/lib/domain/adjusted-salary-audit";
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
    /** 월별 조정급여 — 중도 재분배로 월별 오버라이드가 있으면 월별로 다를 수 있음 */
    salaryByMonth: Record<number, number>;
    hasSalaryOverride: boolean;
    capBlocks: ReturnType<typeof computeSalaryInclusionCapBlocks>;
    /** 이 직원의 월별 편집 가능한 이벤트 목록 (모달 prefill 용) */
    editableEventsByMonth: Record<number, ScheduleEditMonthEvent[]>;
    /** "＋ 항목 추가" 드롭다운 후보 — 직원별 정기/커스텀/분기 모두 합친 목록 */
    availableEvents: ScheduleEditAvailableEvent[];
    /** 직원의 활성 월 범위(부분 재직자) — 모달에서 노출할 월 결정에 사용 */
    activeRange: { fromMonth: number; toMonth: number } | null;
    /** per-event/per-month 수정이 있는 월 (UI 배경색 강조 용) */
    modifiedMonths: Set<number>;
  };

  const customDefs = customPaymentDefsForYear(settings, year);
  const customSchedule = customPaymentScheduleRows(settings, year);
  /** 내장 정기 4종(NEW_YEAR_FEB/FAMILY_MAY/CHUSEOK_AUG/YEAR_END_NOV) 의 업체별 귀속월 오버라이드. */
  const fixedEventMonths = effectiveFixedEventMonthMap(settings);

  const rows: Row[] = employees.map((emp) => {
    const ovr = overrides.filter((x) => x.employeeId === emp.id);
    const qcfg = quarterly.filter((x) => x.employeeId === emp.id);
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const overrideMap = monthlyOverrideMapFromNotes(empNotes, year);
    const br = buildMonthlyBreakdown(
      emp,
      year,
      foundingMonth,
      rules,
      ovr,
      qcfg,
      accrual,
      customSchedule,
      fixedEventMonths,
      overrideMap,
    );
    const noteByMonth = new Map<number, number>();
    for (const n of empNotes) {
      const extra = n.optionalExtraAmount != null ? Number(n.optionalExtraAmount) : 0;
      if (extra === 0) continue;
      noteByMonth.set(n.month, (noteByMonth.get(n.month) ?? 0) + extra);
    }
    const welfareOverrideByAccrualMonth = new Map<number, number>();
    for (const [m, entry] of overrideMap) {
      if (entry.welfareOverrideAmount != null) {
        welfareOverrideByAccrualMonth.set(m, entry.welfareOverrideAmount);
      }
    }
    const welfareByMonth = welfareByScheduleDisplayMonth(
      br,
      noteByMonth,
      welfareOverrideByAccrualMonth,
    );
    const welfareLinesByMonth = welfareScheduleLinesByMonth(
      br,
      noteByMonth,
      customDefs,
      welfareOverrideByAccrualMonth,
    );

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

    const salaryByMonth: Record<number, number> = {};
    let hasSalaryOverride = false;
    for (let m = 1; m <= 12; m++) {
      const v = resolveEffectiveAdjustedSalaryForMonth(emp, year, m, empNotes);
      salaryByMonth[m] = v;
      const note = empNotes.find((n) => n.year === year && n.month === m);
      if (note?.adjustedSalaryOverrideAmount != null) hasSalaryOverride = true;
    }

    /**
     * 월별 개별 수정 모달 prefill — 각 월에 실제 발생하는 이벤트/분기 목록과 기본 금액·기존 override.
     *
     * `br` (buildMonthlyBreakdown 결과) 은 이미 eventAmountOverrides 가 반영돼 있으므로
     * `currentAmount` 는 "지금 보이는 값". `currentOverride` 는 원본 note 에서 직접 읽는다.
     */
    const editableEventsByMonth: Record<number, ScheduleEditMonthEvent[]> = {};
    const modifiedMonths = new Set<number>();
    const overridesByAccrualMonth = new Map<number, Record<string, number>>();
    for (const n of empNotes) {
      if (n.year !== year) continue;
      if (n.eventAmountOverrides && Object.keys(n.eventAmountOverrides).length > 0) {
        overridesByAccrualMonth.set(n.month, n.eventAmountOverrides as Record<string, number>);
        modifiedMonths.add(n.month);
      }
    }
    for (const row of br) {
      const evs: ScheduleEditMonthEvent[] = [];
      for (const reg of row.regularEvents) {
        if (reg.amount === 0 && reg.eventKey in PAYMENT_EVENT_LABELS === false) continue;
        /** 정기·커스텀 이벤트는 귀속월 기준 note 의 override 와 매칭 */
        const accrualOvr = overridesByAccrualMonth.get(row.accrualMonth)?.[reg.eventKey];
        const label =
          Object.prototype.hasOwnProperty.call(PAYMENT_EVENT_LABELS, reg.eventKey)
            ? PAYMENT_EVENT_LABELS[reg.eventKey as PaymentEventKey]
            : paymentEventLabel(reg.eventKey, customDefs);
        evs.push({
          eventKey: reg.eventKey,
          label: label.replace(/\s*\n\s*/g, " ").trim(),
          kind: "regular",
          currentAmount: reg.amount,
          currentOverride: accrualOvr != null ? accrualOvr : null,
        });
      }
      for (const q of row.quarterly) {
        /** 분기는 지급월 기준 — 그 지급월에 걸린 row 에 나타남. override 도 paidMonth note 에서 찾는다. */
        const paidOvr = overridesByAccrualMonth.get(row.paidMonth)?.[q.itemKey];
        const label = Object.prototype.hasOwnProperty.call(QUARTERLY_ITEM_LABELS, q.itemKey)
          ? QUARTERLY_ITEM_LABELS[q.itemKey as QuarterlyItemKey]
          : q.itemKey;
        evs.push({
          eventKey: q.itemKey,
          label,
          kind: "quarterly",
          currentAmount: q.amount,
          currentOverride: paidOvr != null ? paidOvr : null,
        });
      }
      if (evs.length > 0) {
        /** 이벤트의 귀속 기준은 row.accrualMonth, 분기는 paidMonth — 사용자는 "그 달에 보이는" 것으로 인식하므로 paidMonth 키로 합쳐 관리. */
        editableEventsByMonth[row.paidMonth] = [
          ...(editableEventsByMonth[row.paidMonth] ?? []),
          ...evs.filter((x) => x.kind === "quarterly"),
        ];
        editableEventsByMonth[row.accrualMonth] = [
          ...(editableEventsByMonth[row.accrualMonth] ?? []),
          ...evs.filter((x) => x.kind === "regular"),
        ];
      }
    }

    /**
     * "＋ 항목 추가" 드롭다운 후보 — 직원이 어느 달에든 새로 지급할 수 있는 정기/커스텀/분기 키 전체.
     *  - 정기/커스텀: `allPaymentEventKeysForYear` (테넌트 정의 기준)
     *  - 분기: 이 직원의 `quarterly` config 가 가진 itemKey
     *  - `suggestedAmount`: 모달에서 항목 추가 시 prefill 할 기본값
     *      · 정기 → `resolveEventAmount` 로 직원 레벨 기준 규칙 금액
     *      · 분기 → 그 직원 config 의 `amount`
     */
    const availableEvents: ScheduleEditAvailableEvent[] = [];
    for (const eventKey of allPaymentEventKeysForYear(settings, year)) {
      const label = Object.prototype.hasOwnProperty.call(PAYMENT_EVENT_LABELS, eventKey)
        ? PAYMENT_EVENT_LABELS[eventKey as PaymentEventKey]
        : paymentEventLabel(eventKey, customDefs);
      availableEvents.push({
        eventKey,
        label: label.replace(/\s*\n\s*/g, " ").trim(),
        kind: "regular",
        suggestedAmount: resolveEventAmount(emp, eventKey, year, rules, ovr),
      });
    }
    for (const q of qcfg) {
      const label = Object.prototype.hasOwnProperty.call(QUARTERLY_ITEM_LABELS, q.itemKey)
        ? QUARTERLY_ITEM_LABELS[q.itemKey as QuarterlyItemKey]
        : q.itemKey;
      availableEvents.push({
        eventKey: q.itemKey,
        label,
        kind: "quarterly",
        suggestedAmount: q.amount,
      });
    }

    /** 활성 월 범위 — 퇴사자/신규입사자는 부분 범위만 모달에 노출. */
    const empStatus = employeeStatusForYear(emp, year);
    const activeRange: { fromMonth: number; toMonth: number } | null =
      empStatus.kind === "ACTIVE_FULL_YEAR"
        ? { fromMonth: 1, toMonth: 12 }
        : empStatus.kind === "ACTIVE_PARTIAL"
          ? { fromMonth: empStatus.range.fromMonth, toMonth: empStatus.range.toMonth }
          : null;

    return {
      emp,
      welfareByMonth,
      welfareLinesByMonth,
      yearlyWelfare,
      salaryMonth: monthlySalaryPortion(emp),
      salaryByMonth,
      hasSalaryOverride,
      capBlocks,
      editableEventsByMonth,
      availableEvents,
      activeRange,
      modifiedMonths,
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
      salaryByMonth: r.salaryByMonth,
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
      editableEventsByMonth: r.editableEventsByMonth,
      availableEvents: r.availableEvents,
      activeRange: r.activeRange,
      modifiedMonths: Array.from(r.modifiedMonths),
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

  /**
   * 조정연봉 점검 — 조사표에 올린 `Employee.adjustedSalary` 와 월별 노트로 누적된
   * 실제 조정연봉을 비교해 불일치 직원을 목록화한다. `canNote` 와 동일한 권한으로
   * 재동기화 가능 (직원 정보 편집 권한).
   */
  const adjustedSalaryAudits = computeAdjustedSalaryAuditList(employees, year, notes);
  const adjustedSalaryAuditTab = (
    <AdjustedSalaryAuditPanel year={year} rows={adjustedSalaryAudits} canEdit={canNote} />
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

  /**
   * 월별 메모 탭 — 기존 '월별 발생 인센' 그리드와 '선택적 복지·메모' 폼을 한 탭으로 합쳤음.
   * 두 기능 모두 `sabok_monthly_notes` 컬렉션을 직원·월 단위로 다루기 때문에 한 흐름에 두는 편이 자연스럽다.
   */
  const monthlyNoteTab = (
    <div className="space-y-5">
      <div className="surface dash-panel-pad">
        <h3 className="mb-3 text-sm font-semibold tracking-normal text-[var(--text)]">월별 발생 인센</h3>
        <MonthlyIncentiveAccrualGrid
          year={year}
          rows={incentiveAccrualRows}
          canEdit={canNote}
          setCell={setMonthlyIncentiveAccrualCellAction}
        />
      </div>

      {canNote ? (
        <CollapsibleEditorPanel
          title="선택적 복지·메모"
          description="직원·월 단위로 선택 복지 금액·사복 인센 지급액·메모를 함께 저장합니다."
          triggerLabel="작성·수정 열기"
          defaultOpen={false}
        >
          <form action={saveMonthlyNoteFormAction} className="space-y-3">
            <input type="hidden" name="year" value={year} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="dash-field-label">직원</label>
                <select
                  name="employeeId"
                  className="input w-full max-w-md text-xs"
                  required
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="dash-field-label">월</label>
                <input
                  name="month"
                  type="number"
                  min={1}
                  max={12}
                  className="input w-[4.5rem] text-xs"
                  required
                />
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
                <input name="optionalWelfareText" className="input w-full text-xs" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">저장</button>
          </form>
        </CollapsibleEditorPanel>
      ) : (
        <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
      )}
    </div>
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
          카카오·문자 안내문은 <span className="font-semibold text-[var(--text)]">「안내 멘트」</span> 탭,
          월별 발생 인센·선택 복지·메모는 <span className="font-semibold text-[var(--text)]">「월별 메모」</span> 탭,
          자본금 50% 한도·추가 적립 누적은 <span className="font-semibold text-[var(--text)]">「적립금」</span> 탭,
          중도 변동으로 조사표 조정연봉이 어긋난 직원은{" "}
          <span className="font-semibold text-[var(--text)]">「조정연봉 점검」</span> 탭에서 확인·동기화할 수 있습니다.
        </p>
      </div>

      {quarterlyEmpty ? (
        <Alert tone="info" title="분기 지원이 아직 등록되지 않았습니다">
          월별 스케줄에는 정기 지급만 표시되고 있습니다. 분기 지원 금액을 함께 보려면{" "}
          <Link href="/dashboard/rules" className="font-semibold text-[var(--accent)] hover:underline">
            「지급 규칙 → 분기 대상자 체크」
          </Link>{" "}
          탭에서 항목·지급 월·금액을 등록하세요.
        </Alert>
      ) : quarterlyOnlySingleMonth ? (
        <Alert tone="warn" title="분기 지원의 지급 월이 1개씩만 저장되어 있습니다">
          PocketBase{" "}
          <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-xs">
            sabok_quarterly_employee_configs
          </code>{" "}
          컬렉션에 <strong>json 필드 paymentMonths</strong> 가 없으면 첫 달만 저장돼 스케줄·총 지급금액에도 일부만
          반영됩니다.{" "}
          <Link href="/dashboard/rules" className="font-semibold text-[var(--accent)] hover:underline">
            「지급 규칙 → 분기 대상자 체크」
          </Link>{" "}
          탭의 진단 배너를 따라 PB 필드를 추가한 뒤, 각 항목을 다시 저장해 주세요.
        </Alert>
      ) : null}
      <Tabs
        tabs={[
          { label: "월별 스케줄", content: scheduleTab },
          { label: "안내 멘트", content: announcementTab },
          { label: "월별 메모", content: monthlyNoteTab },
          { label: "적립금", content: reserveTab },
          { label: "레벨·예정액", content: levelAssignmentTab },
          { label: "조정연봉 점검", content: adjustedSalaryAuditTab },
        ]}
      />
    </div>
  );
}
