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
  activeMonthsSortedForYear,
  buildMonthlyBreakdown,
  computeActualWelfareThroughPaidMonth,
  computeActualYearlyWelfareForEmployee,
  computeSalaryInclusionCapBlocks,
  employeeStatusForYear,
  monthIsActive,
  monthlyOverrideMapFromNotes,
  monthlySalaryPortion,
  regularAnnualTotalsByLevel,
  resolveEventAmount,
  welfareByScheduleDisplayMonth,
  welfareEligibleEmployees,
  welfareScheduleLinesByMonth,
} from "@/lib/domain/schedule";
import { PAYMENT_EVENT, PAYMENT_EVENT_LABELS, QUARTERLY_ITEM_LABELS } from "@/lib/business-rules";
import type { PaymentEventKey, QuarterlyItemKey } from "@/lib/business-rules";
import type {
  ScheduleEditAvailableEvent,
  ScheduleEditMonthEvent,
} from "@/components/ScheduleEmployeeEditModal";
import {
  computeLoweredSalaryPartialYearTrueUpWon,
  resolveEffectiveAdjustedSalaryForMonth,
} from "@/lib/domain/salary-inclusion";
import { effectiveEmployeeOperationMode, parseTenantOperationMode } from "@/lib/domain/tenant-profile";
import {
  summarizeTenantAdditionalReserve,
  tenantReserveTotalSumWon,
} from "@/lib/domain/vendor-reserve";
import {
  saveMonthlyNoteFormAction,
  setCompanyIncentiveNetRatioAction,
  setMonthPaidConfirmedAction,
  setMonthlyIncentiveAccrualCellAction,
  setMonthlyOptionalWelfareTextAction,
} from "@/app/actions/quarterly";
import {
  effectiveSalaryInclusionVarianceMode,
  salaryInclusionShowOverage,
  salaryInclusionShowShortfall,
} from "@/lib/domain/salary-inclusion-display";
import { CommaWonInput } from "@/components/CommaWonInput";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";
import { ScheduleEmployeeLevelAssignments } from "@/components/ScheduleEmployeeLevelAssignments";
import { MonthlyIncentiveAccrualGrid } from "@/components/MonthlyIncentiveAccrualGrid";
import { ScheduleWorkTabs } from "@/components/ScheduleWorkTabs";
import { AdjustedSalaryAuditPanel } from "@/components/AdjustedSalaryAuditPanel";
import { computeAdjustedSalaryAuditList } from "@/lib/domain/adjusted-salary-audit";
import {
  ScheduleEmployeeTable,
  type ScheduleTableEmploymentStatus,
  type ScheduleTableRow,
} from "@/components/ScheduleEmployeeTable";
import { ScheduleReserveTab } from "@/components/ScheduleReserveTab";
import { MonthlySchedulesPanel } from "@/components/MonthlySchedulesPanel";
import { OptionalWelfareGridPanel } from "@/components/OptionalWelfareGridPanel";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
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
  const tenantVarianceMode = settings?.salaryInclusionVarianceMode ?? "BOTH";

  const allEmployees = await employeeListByTenantCodeAsc(tenantId);
  /**
   * 사복 대상 직원만 — 스케줄·운영 보고·안내문 등 사복 화면은 모두 이 리스트로 동작.
   * `flagWelfareIneligible` 직원은 ‘월별 발생 인센’ 그리드(=allEmployees)와 직원 명부에만 보인다.
   */
  const employees = welfareEligibleEmployees(allEmployees);
  const ids = employees.map((e) => e.id);
  /**
   * `notes` 조회는 미대상자 인센·메모도 포함해야 그리드에 인센 기록을 쓸 수 있다.
   * 그 외 사복 계산은 위의 `employees` / `ids` 로 진행되므로 미대상자가 섞여도 영향 없음.
   */
  const allIds = allEmployees.map((e) => e.id);

  const vendors = await vendorListByTenant(tenantId);
  const reserveSummary =
    tenantRow != null
      ? summarizeTenantAdditionalReserve(
          {
            clientEntityType: tenantRow.clientEntityType,
            headOfficeCapital: tenantRow.headOfficeCapital,
            accumulatedReserveTotalWon: tenantReserveTotalSumWon(
              tenantRow.reserveMonthlyByYearWon,
              tenantRow.accumulatedReserveTotalWon,
              tenantRow.reserveBalanceWon,
            ),
          },
          vendors
        )
      : { kind: "NO_VENDORS" as const };
  /**
   * 「현재 +20% 적립 활성?」 판정은 「월별 안내」 페이지(`/dashboard/announcement`) 가 자체적으로 수행한다.
   * 본 화면(월별 스케줄) 은 적립 요약(`reserveSummary`) 만 적립금 탭에서 사용.
   */
  const canEditReserveNote = canEditCompanySettings(role) && settings != null;

  const [rules, overrides, quarterly, notes, monthPaidStatuses] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeIdsYear(ids, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids),
    /** 미대상 직원도 ‘월별 발생 인센’ 그리드를 통해 노트를 쓸 수 있어야 하므로 allIds 로 조회. */
    monthlyNoteListByTenantYear(tenantId, year, allIds),
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
    /**
     * 그 직원의 활성 월 1~12 「선택적복지(`optionalExtraAmount`)」 만의 연합.
     * `yearlyWelfare = 정기·분기 + 선택적복지` 의 부분 합계로, 표 합계 셀 아래에
     * 「ㄴ선택 X」 한 줄로 작게 보여 「합계 중 선택적이 얼마인지」 즉시 판독.
     */
    optionalAnnual: number;
    salaryMonth: number;
    /** 월별 조정급여 — 중도 재분배로 월별 오버라이드가 있으면 월별로 다를 수 있음 */
    salaryByMonth: Record<number, number>;
    /**
     * 급여분 멘트용 12개월 금액 — 연간 급여(상한−정기연합 등)에 대해 `floor(연간÷12)` 를 활성 월마다 동일 반복.
     * RSC→클라이언트 직렬화에서 `Record<number,_>` 키가 빠지는 것을 피하기 위해 배열로 둔다.
     */
    announcementSalaryByMonthList: readonly number[];
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
      customSchedule,
      fixedEventMonths,
      overrideMap,
    );
    /**
     * 사복 표시 가드 — `flagPayWelfareOnResignMonth` 까지 반영해 비활성 월(퇴사 후 / 부분 재직 외)에는
     * 어떤 라인도 노출되지 않도록 한다. 이 한 곳에서 막아야 카드/테이블/펼침/안내문 어디서도 새지 않는다.
     */
    const empStatus = employeeStatusForYear(emp, year);

    const noteByMonth = new Map<number, number>();
    for (const n of empNotes) {
      const extra = n.optionalExtraAmount != null ? Number(n.optionalExtraAmount) : 0;
      if (extra === 0) continue;
      /** 퇴사월 이후 임의로 남아 있는 노트가 있어도 표시·합산에서 제외. */
      if (!monthIsActive(empStatus, n.month)) continue;
      noteByMonth.set(n.month, (noteByMonth.get(n.month) ?? 0) + extra);
    }
    const welfareOverrideByAccrualMonth = new Map<number, number>();
    for (const [m, entry] of overrideMap) {
      if (entry.welfareOverrideAmount != null) {
        if (!monthIsActive(empStatus, m)) continue;
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
    /**
     * 마지막 안전망 — buildMonthlyBreakdown 가드를 우회하는 경로(예: 미래에 추가될 데이터 채널)가 생겨도
     * 비활성 월 키는 여기서 일괄 제거한다.
     */
    for (let m = 1; m <= 12; m++) {
      if (monthIsActive(empStatus, m)) continue;
      welfareByMonth.delete(m);
      welfareLinesByMonth.delete(m);
    }

    const yearlyWelfare = computeActualYearlyWelfareForEmployee(
      emp,
      year,
      foundingMonth,
      rules,
      ovr,
      qcfg,
      empNotes,
      customSchedule,
      fixedEventMonths,
    );
    /**
     * 선택적복지(노트의 `optionalExtraAmount`) 만의 연 합 — 활성 월(`noteByMonth` 가 이미
     * `monthIsActive` 가드를 통과한 값) 만 합산. 퇴사 후 잔존 노트는 자동 제외된다.
     */
    let optionalAnnual = 0;
    for (const v of noteByMonth.values()) optionalAnnual += v;
    const capBlocks = computeSalaryInclusionCapBlocks(
      emp,
      yearlyWelfare,
      empNotes,
      year,
      tenantOperationMode,
      12
    );

    const salaryByMonth: Record<number, number> = {};
    const hasSalaryOverride = empNotes.some(
      (n) => n.year === year && n.adjustedSalaryOverrideAmount != null,
    );
    const salaryActiveMonths = activeMonthsSortedForYear(empStatus);
    for (let m = 1; m <= 12; m++) {
      /** 비활성(퇴사 후) 월은 급여 라인도 0 — 표/카드 모두 ‘—’ 로 가려진다. */
      const v = monthIsActive(empStatus, m)
        ? resolveEffectiveAdjustedSalaryForMonth(emp, year, m, empNotes, salaryActiveMonths)
        : 0;
      salaryByMonth[m] = v;
    }

    const lastSalaryActiveMonth =
      salaryActiveMonths.length > 0 ? salaryActiveMonths[salaryActiveMonths.length - 1]! : null;
    let loweredTrueUpApplied = 0;
    let loweredTrueUpMonth: number | null = null;
    /**
     * 안내 멘트 전용 정산 — 운영보고 정산(`loweredTrueUpApplied`) 과 분리한다.
     * 운영자가 월별 `adjustedSalaryOverrideAmount` 로 수동 분배를 했더라도 안내 멘트는
     * 「받아야 할 누적 = 실제 누적」 룰을 그대로 따라야 하므로 `hasAdjustedSalaryOverride: false`
     * 로 호출해 가드를 우회한다.
     */
    let announcementTrueUpApplied = 0;
    let announcementTrueUpMonth: number | null = null;
    if (lastSalaryActiveMonth != null && salaryActiveMonths.length < 12) {
      const welfareYtdThroughLast = computeActualWelfareThroughPaidMonth(
        emp,
        year,
        foundingMonth,
        rules,
        ovr,
        qcfg,
        empNotes,
        lastSalaryActiveMonth,
        customSchedule,
        fixedEventMonths,
      );
      const loweredTrueUp = computeLoweredSalaryPartialYearTrueUpWon({
        employee: emp,
        activeMonthsSorted: salaryActiveMonths,
        welfareYtdThroughLastPaidMonth: welfareYtdThroughLast,
        hasAdjustedSalaryOverride: hasSalaryOverride,
      });
      if (loweredTrueUp > 0) {
        loweredTrueUpApplied = loweredTrueUp;
        loweredTrueUpMonth = lastSalaryActiveMonth;
        salaryByMonth[lastSalaryActiveMonth] =
          (salaryByMonth[lastSalaryActiveMonth] ?? 0) + loweredTrueUp;
      }
      const announcementTrueUp = computeLoweredSalaryPartialYearTrueUpWon({
        employee: emp,
        activeMonthsSorted: salaryActiveMonths,
        welfareYtdThroughLastPaidMonth: welfareYtdThroughLast,
        hasAdjustedSalaryOverride: false,
      });
      if (announcementTrueUp > 0) {
        announcementTrueUpApplied = announcementTrueUp;
        announcementTrueUpMonth = lastSalaryActiveMonth;
      }
    }

    /**
     * 급여분 멘트 월액 — 운용 방식(operationMode)에 따라 분기.
     *
     *   1) 「급여낮추기」 회사 (`SALARY_WELFARE`·`COMBINED`)
     *      → adjustedSalary 가 운영자가 의도한 "실제 받는 급여" 이므로 `adjustedSalary ÷ 12`.
     *        (`예상 사복 지급금 = baseSalary − adjustedSalary + 예상 인센` 정의의 자연스러운 귀결)
     *   2) 그 외 (`GENERAL`·`INCENTIVE_WELFARE`)
     *      → 급여 자체는 낮추지 않으므로 `baseSalary ÷ 12`.
     *
     * 어느 분기든 1순위 값이 비어 있으면 반대편 값으로 폴백, 둘 다 0이면
     * `monthlySalaryPortion(emp) × 12` 로 폴백한다. 모두 절사(floor)한다.
     */
    const baseAnnual = Math.round(Number(emp.baseSalary) || 0);
    const adjAnnual = Math.round(Number(emp.adjustedSalary) || 0);
    const isSalaryLowering =
      tenantOperationMode === "SALARY_WELFARE" || tenantOperationMode === "COMBINED";
    let salaryAnnualForNotice = isSalaryLowering
      ? adjAnnual > 0
        ? adjAnnual
        : baseAnnual
      : baseAnnual > 0
        ? baseAnnual
        : adjAnnual;
    if (salaryAnnualForNotice <= 0) {
      salaryAnnualForNotice = Math.round(monthlySalaryPortion(emp) * 12);
    }
    /**
     * 안내 멘트 월액 — 운영보고 `salaryByMonth` 와 정합되는 산출.
     *
     *   1) 활성 월: `resolveEffectiveAdjustedSalaryForMonth(proxy)` 로 계산.
     *      - 일반 활성월: floor(연간 ÷ 12)
     *      - 마지막 활성월: round(연간 × N ÷ 12) − floor(연간÷12) × (N−1) (round 잔차 흡수)
     *      - proxy 는 운용방식 분기 결과 1순위 연봉을 `adjustedSalary` 로 주입.
     *        (`baseSalary` 폴백·overrides 영향 없이 단일 소스)
     *   2) 활성월 < 12 이면 마지막 근무월에 `loweredTrueUpApplied` 가산
     *      (= base/12×N − round(adj×N/12) − 활성 사복 합).
     *
     * 위 식을 결합하면 마지막 근무월 = base/12×N − floor(adj/12)×(N−1) − 활성 사복 합 으로
     * 운영보고용 `salaryByMonth[lastActive]` 와 동일한 원 단위 결과가 나온다.
     */
    const noticeEmpProxy = (
      isSalaryLowering
        ? { adjustedSalary: salaryAnnualForNotice, baseSalary: 0 }
        : { adjustedSalary: 0, baseSalary: salaryAnnualForNotice }
    ) as Pick<Employee, "adjustedSalary" | "baseSalary">;
    const announcementSalaryByMonth: number[] = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      if (!monthIsActive(empStatus, m)) return 0;
      return resolveEffectiveAdjustedSalaryForMonth(
        noticeEmpProxy,
        year,
        m,
        [],
        salaryActiveMonths,
      );
    });
    if (announcementTrueUpApplied > 0 && announcementTrueUpMonth != null) {
      const idx = announcementTrueUpMonth - 1;
      announcementSalaryByMonth[idx] =
        (announcementSalaryByMonth[idx] ?? 0) + announcementTrueUpApplied;
    }
    const announcementSalaryByMonthList: readonly number[] = announcementSalaryByMonth;

    /**
     * 월별 개별 수정 모달 prefill — 각 월에 실제 발생하는 이벤트/분기 목록과 기본 금액·기존 override.
     *
     * `br` (buildMonthlyBreakdown 결과) 은 이미 eventAmountOverrides 가 반영돼 있으므로
     * `currentAmount` 는 "지금 보이는 값". `currentOverride` 는 원본 note 에서 직접 읽는다.
     */
    const editableEventsByMonth: Record<number, ScheduleEditMonthEvent[]> = {};
    const modifiedMonths = new Set<number>();
    const overridesByAccrualMonth = new Map<number, Record<string, number>>();
    /**
     * note.month 는 귀속월 기준이며, 「당월 귀속·차월 지급」 옵션 제거 후 paidMonth=accrualMonth 이므로
     * 강조 칼럼도 동일 월이다. 일관성을 위해 paidMonth lookup 경로는 그대로 유지한다.
     */
    const paidMonthByAccrual = new Map<number, number>(br.map((r) => [r.accrualMonth, r.paidMonth]));
    for (const n of empNotes) {
      if (n.year !== year) continue;
      if (n.eventAmountOverrides && Object.keys(n.eventAmountOverrides).length > 0) {
        overridesByAccrualMonth.set(n.month, n.eventAmountOverrides as Record<string, number>);
        modifiedMonths.add(paidMonthByAccrual.get(n.month) ?? n.month);
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
        /**
         * 표시 칼럼은 `welfareByScheduleDisplayMonth`/`welfareScheduleLinesByMonth` 와 동일하게
         * **paidMonth 기준**으로 통일한다(정기·분기 모두 row.paidMonth 키).
         * 사용자는 "2월 칸"을 "2월 지급분"으로 일관되게 인식한다.
         */
        editableEventsByMonth[row.paidMonth] = [
          ...(editableEventsByMonth[row.paidMonth] ?? []),
          ...evs,
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
    /** 월 임의 지급 키는 드롭다운 맨 위에 두어 "자연 이벤트 없이" 넣기 쉽게 한다. */
    const allKeys = allPaymentEventKeysForYear(settings, year);
    const adhoc = PAYMENT_EVENT.MONTHLY_ADHOC;
    const keysOrdered = allKeys.includes(adhoc)
      ? [adhoc, ...allKeys.filter((k) => k !== adhoc)]
      : [...allKeys];
    for (const eventKey of keysOrdered) {
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

    /** 활성 월 범위 — 위에서 만든 empStatus 를 그대로 재사용해 “부분 재직” 모달 노출 범위 계산. */
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
      optionalAnnual,
      salaryMonth: monthlySalaryPortion(emp),
      salaryByMonth,
      announcementSalaryByMonthList,
      hasSalaryOverride,
      capBlocks,
      editableEventsByMonth,
      availableEvents,
      activeRange,
      modifiedMonths,
    };
  });

  const canNote = canEditEmployees(role);

  /**
   * 직원×월 단위 보조 금액 맵을 헬퍼 한 방으로 추출.
   * `CompanySettings.{rep|spouse|disc}Schedule` 은 `{ empId: { "1": 금액, ... } }` 모양이라 그대로 1~12 인덱스로 정규화.
   */
  const monthlyRecordFor = (
    schedule: Record<string, Partial<Record<string, number>>> | null | undefined,
    employeeId: string,
  ): Record<number, number> => {
    const out: Record<number, number> = {};
    const row = schedule?.[employeeId];
    for (let m = 1; m <= 12; m++) {
      const v = row?.[String(m)];
      out[m] = typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
    }
    return out;
  };
  const repReturnSchedule = settings?.repReturnSchedule ?? null;
  const spouseReceiptSchedule = settings?.spouseReceiptSchedule ?? null;
  const discretionarySchedule = settings?.discretionarySchedule ?? null;
  const customReturnsCategories = settings?.customReturnsSchedule?.categories ?? [];

  /**
   * 직원별 「+ 반환 추가」 카테고리 — 카테고리 단위로 라벨·1~12 월 금액 맵을 만든 뒤,
   * 모든 칸이 0 인 카테고리는 제외해 안내 멘트 출력에서 빈 줄이 생기지 않도록 한다.
   */
  const customReturnsByMonthFor = (
    employeeId: string,
  ): Array<{ label: string; byMonth: Record<number, number> }> => {
    if (customReturnsCategories.length === 0) return [];
    const out: Array<{ label: string; byMonth: Record<number, number> }> = [];
    for (const cat of customReturnsCategories) {
      const byMonth = monthlyRecordFor(cat.byEmployeeMonth, employeeId);
      let any = false;
      for (let m = 1; m <= 12; m++) {
        if ((byMonth[m] ?? 0) > 0) { any = true; break; }
      }
      if (!any) continue;
      out.push({ label: cat.label, byMonth });
    }
    return out;
  };

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
      optionalYearlyWelfare: r.optionalAnnual,
      salaryMonth: r.salaryMonth,
      salaryByMonth: r.salaryByMonth,
      announcementSalaryByMonthList: r.announcementSalaryByMonthList,
      flagRepReturn: r.emp.flagRepReturn,
      repReturnByMonth: monthlyRecordFor(repReturnSchedule, r.emp.id),
      spouseReceiptByMonth: monthlyRecordFor(spouseReceiptSchedule, r.emp.id),
      discretionaryByMonth: monthlyRecordFor(discretionarySchedule, r.emp.id),
      customReturnsByMonth: customReturnsByMonthFor(r.emp.id),
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

  /**
   * 월별 발생 인센 그리드는 사복 대상·미대상 모두 노출. 미대상은 시각적 구분을 위해 행 끝으로 모은다.
   * 같은 그룹 내에서는 기존 employeeCode 순서를 유지(allEmployees 가 이미 코드 오름차순).
   *
   * 「INCENTIVE_WELFARE」 모드 직원의 한도(연 사복 스케줄 합계) 계산을 위해, 위에서 이미 계산된
   * `rows[].yearlyWelfare` 를 employeeId 기준 맵으로 변환하여 그리드 row prop 에 그대로 흘려보낸다.
   * 사복 미대상은 rows 에 없으므로 0 fallback → 한도 산정 불가로 자연스럽게 비활성된다.
   */
  const welfareScheduleTotalByEmployeeId = new Map<string, number>();
  for (const r of rows) {
    welfareScheduleTotalByEmployeeId.set(r.emp.id, r.yearlyWelfare);
  }
  const incentiveAccrualRows = [
    ...allEmployees.filter((e) => !e.flagWelfareIneligible),
    ...allEmployees.filter((e) => e.flagWelfareIneligible),
  ].map((emp) => {
    const empNotes = notes.filter((n) => n.employeeId === emp.id);
    const incentiveAccrualByMonth: Record<number, number | null> = {};
    const optionalWelfareTextByMonth: Record<number, string | null> = {};
    for (let m = 1; m <= 12; m++) {
      const hit = empNotes.find((x) => x.month === m);
      incentiveAccrualByMonth[m] = hit?.incentiveAccrualAmount ?? null;
      optionalWelfareTextByMonth[m] = hit?.optionalWelfareText ?? null;
    }
    /**
     * effective 운영 모드 — 직원 override 가 있으면 그것, 없으면 거래처 기본.
     * 한도 계산기는 INCENTIVE_WELFARE 일 때만 welfareScheduleTotalWon 을 쓰고 그 외엔 incentiveAmount 로 폴백한다.
     */
    const effectiveOperationMode = effectiveEmployeeOperationMode(emp.operationMode, tenantOperationMode);
    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.name,
      incentiveAccrualByMonth,
      optionalWelfareTextByMonth,
      /** 직원 마스터의 ‘예상 인센’ — INCENTIVE_WELFARE 외 모드에서 잔여 비교에 사용 */
      incentiveAmount: emp.incentiveAmount,
      /** 사복 미대상 — 행 끝 정렬·배지 표시에만 사용. 인센 기록 자체에는 영향 없음. */
      welfareIneligible: emp.flagWelfareIneligible,
      effectiveOperationMode,
      /** INCENTIVE_WELFARE 모드 직원의 사복 한도. 미대상/스케줄 없음이면 0(→ 한도 없음으로 폴백). */
      welfareScheduleTotalWon: welfareScheduleTotalByEmployeeId.get(emp.id) ?? 0,
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
   * 「대표반환·배우자수령·알아서금액」 탭 — 직원×1~12월 그리드 3종을 한 폼에 묶어 관리.
   * 데이터는 `CompanySettings.{repReturn|spouseReceipt|discretionary}Schedule` 에 JSON 으로 저장.
   * `canEdit` 은 전사 설정 권한과 동일하게 가져간다(기존 대표반환 입력이 있던 위치와 같은 권한).
   */
  const canEditMonthlySchedules = canEditCompanySettings(role);
  const monthlySchedulesTab = (
    <MonthlySchedulesPanel
      activeYear={year}
      employees={employees.map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        name: e.name,
        position: e.position,
        flagRepReturn: e.flagRepReturn,
        flagSpouseReceipt: e.flagSpouseReceipt,
        flagAutoAmount: e.flagAutoAmount,
      }))}
      repReturn={settings?.repReturnSchedule ?? {}}
      spouseReceipt={settings?.spouseReceiptSchedule ?? {}}
      discretionary={settings?.discretionarySchedule ?? {}}
      customReturns={settings?.customReturnsSchedule ?? null}
      canEdit={canEditMonthlySchedules}
    />
  );

  /**
   * 월별 메모 탭 — 기존 '월별 발생 인센' 그리드와 '선택적 복지·메모' 폼을 한 탭으로 합쳤음.
   * 두 기능 모두 `sabok_monthly_notes` 컬렉션을 직원·월 단위로 다루기 때문에 한 흐름에 두는 편이 자연스럽다.
   */
  /**
   * 새 「선택적 복지 그리드」 입력 — 직원×월 한 번에 일괄 입력.
   * 노트(`MonthlyEmployeeNote`) 의 `optionalExtraAmount` 한 필드만 부분 업데이트하므로
   * 메모/인센/오버라이드 같은 다른 필드는 그대로 보존된다.
   */
  const optionalAmountsByEmpMonth: Record<string, Record<string, number>> = {};
  for (const n of notes) {
    if (n.optionalExtraAmount == null) continue;
    const v = Number(n.optionalExtraAmount);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (n.year !== year) continue;
    if (!optionalAmountsByEmpMonth[n.employeeId]) optionalAmountsByEmpMonth[n.employeeId] = {};
    optionalAmountsByEmpMonth[n.employeeId][String(n.month)] = Math.round(v);
  }

  const monthlyNoteTab = (
    <div className="space-y-5">
      <div className="surface dash-panel-pad">
        <h3 className="mb-3 text-sm font-semibold tracking-normal text-[var(--text)]">월별 발생 인센</h3>
        <MonthlyIncentiveAccrualGrid
          year={year}
          rows={incentiveAccrualRows}
          canEdit={canNote}
          setCell={setMonthlyIncentiveAccrualCellAction}
          netRatioPercent={settings?.incentiveNetRatioPercent ?? null}
          setNetRatio={setCompanyIncentiveNetRatioAction}
          setOptionalWelfareText={setMonthlyOptionalWelfareTextAction}
        />
      </div>

      <div className="surface dash-panel-pad">
        <OptionalWelfareGridPanel
          activeYear={year}
          employees={employees.map((e) => ({
            id: e.id,
            employeeCode: e.employeeCode,
            name: e.name,
            position: e.position,
          }))}
          optionalAmounts={optionalAmountsByEmpMonth}
          canEdit={canNote}
        />
      </div>

      {canNote ? (
        <CollapsibleEditorPanel
          title="선택적 복지·메모 (단일 폼)"
          triggerLabel="열기"
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
                <select
                  name="month"
                  defaultValue=""
                  className="input w-[5.5rem] text-xs"
                  required
                  aria-label="대상 월 선택 (1~12월)"
                >
                  <option value="" disabled>—</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
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
      <PageHeader
        eyebrow={`월별 스케줄 · ${year}`}
        title="월별 지급 스케줄"
        meta={
          <>
            <span className="trust-pill">기준 연도 {year}</span>
            <span className="trust-pill">대상 직원 {employees.length}명</span>
          </>
        }
      />

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
      <ScheduleWorkTabs
        scheduleTab={scheduleTab}
        monthlyNoteTab={monthlyNoteTab}
        monthlySchedulesTab={monthlySchedulesTab}
        reserveTab={reserveTab}
        levelAssignmentTab={levelAssignmentTab}
        adjustedSalaryAuditTab={adjustedSalaryAuditTab}
      />
    </div>
  );
}
