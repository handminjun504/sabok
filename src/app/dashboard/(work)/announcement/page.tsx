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
import {
  customPaymentScheduleRows,
  effectiveFixedEventMonthMap,
} from "@/lib/domain/payment-events";
import {
  activeMonthsSortedForYear,
  buildMonthlyBreakdown,
  computeActualWelfareThroughPaidMonth,
  employeeStatusForYear,
  monthIsActive,
  monthlyOverrideMapFromNotes,
  monthlySalaryPortion,
  welfareByScheduleDisplayMonth,
  welfareEligibleEmployees,
} from "@/lib/domain/schedule";
import {
  computeLoweredSalaryPartialYearTrueUpWon,
  resolveEffectiveAdjustedSalaryForMonth,
} from "@/lib/domain/salary-inclusion";
import { parseTenantOperationMode } from "@/lib/domain/tenant-profile";
import {
  additionalReserveStatus,
  summarizeTenantAdditionalReserve,
  tenantReserveTotalSumWon,
} from "@/lib/domain/vendor-reserve";
import { encodeAnnouncementPanelPayloadJson } from "@/lib/domain/schedule-announcement-payload";
import { AnnouncementPanelClient } from "@/components/AnnouncementPanelClient";
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";

/**
 * 「월별 안내」 메뉴 — 안내 멘트(급여분·사복) 생성·복사 전용 화면.
 *
 * 이 페이지는 「금액 입력」 칸을 일절 두지 않는다. 대표반환·배우자수령·알아서금액·선택적복지·발생 인센
 * 등 모든 금액 입력은 「월별 스케줄」(`/dashboard/schedule`) 에 모여 있고, 본 화면은 그 결과를
 * 안내 멘트로만 변환·복사한다.
 *
 * 내부적으로 스케줄 페이지의 안내 탭과 정확히 동일한 데이터 모델을 사용하기 위해, 직원·노트·룰
 * 등을 동일 함수로 다시 빌드한 뒤 `encodeAnnouncementPanelPayloadJson` 으로 직렬화한다.
 */
export default async function AnnouncementPage() {
  const { tenantId } = await requireTenantContext();
  const [settings, tenantRow] = await Promise.all([
    companySettingsByTenant(tenantId),
    tenantGetById(tenantId),
  ]);
  const tenantOperationMode = parseTenantOperationMode(tenantRow?.operationMode);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;

  const allEmployees = await employeeListByTenantCodeAsc(tenantId);
  const employees = welfareEligibleEmployees(allEmployees);
  const ids = employees.map((e) => e.id);

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
          vendors,
        )
      : { kind: "NO_VENDORS" as const };
  /**
   * 거래처 타입(개인/법인) + 자본금 50% 진행도로 “현재 +20% 적립 활성?” 결정.
   * 거래처 정보를 못 불러올 때는 보수적으로 활성(NO_VENDORS) 처리.
   */
  const reserveStatus = additionalReserveStatus(
    { clientEntityType: tenantRow?.clientEntityType ?? "INDIVIDUAL" },
    reserveSummary,
  );

  const [rules, overrides, quarterly, notes] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeIdsYear(ids, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids),
    monthlyNoteListByTenantYear(tenantId, year, ids),
  ]);

  const customSchedule = customPaymentScheduleRows(settings, year);
  const fixedEventMonths = effectiveFixedEventMonthMap(settings);

  /**
   * 직원×월 단위 보조 금액 맵을 헬퍼 한 방으로 추출.
   * `CompanySettings.{rep|spouse|disc}Schedule` 은 `{ empId: { "1": 금액, ... } }` 모양이라
   * 그대로 1~12 인덱스로 정규화. 0/음수/NaN 은 0 으로 처리.
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

  const customReturnsByMonthFor = (
    employeeId: string,
  ): Array<{ label: string; byMonth: Record<number, number> }> => {
    if (customReturnsCategories.length === 0) return [];
    const out: Array<{ label: string; byMonth: Record<number, number> }> = [];
    for (const cat of customReturnsCategories) {
      const byMonth = monthlyRecordFor(cat.byEmployeeMonth, employeeId);
      let any = false;
      for (let m = 1; m <= 12; m++) {
        if ((byMonth[m] ?? 0) > 0) {
          any = true;
          break;
        }
      }
      if (!any) continue;
      out.push({ label: cat.label, byMonth });
    }
    return out;
  };

  /**
   * 직원별 안내 row 빌드 — 스케줄 페이지의 row 빌드와 정합.
   * 안내에 필요한 필드만 만들고, 표·카드 전용(welfareLinesByMonth, capBlocks 등) 은 생략.
   */
  const cardRows = employees.map((emp) => {
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
    const empStatus = employeeStatusForYear(emp, year);

    /** 선택적복지(노트) 월별 합 — 활성 월만 합산. */
    const noteByMonth = new Map<number, number>();
    for (const n of empNotes) {
      const extra = n.optionalExtraAmount != null ? Number(n.optionalExtraAmount) : 0;
      if (extra === 0) continue;
      if (!monthIsActive(empStatus, n.month)) continue;
      noteByMonth.set(n.month, (noteByMonth.get(n.month) ?? 0) + extra);
    }
    /** 월별 사복 강제 오버라이드(중도 재분배) — 활성 월만 반영. */
    const welfareOverrideByAccrualMonth = new Map<number, number>();
    for (const [m, entry] of overrideMap) {
      if (entry.welfareOverrideAmount != null) {
        if (!monthIsActive(empStatus, m)) continue;
        welfareOverrideByAccrualMonth.set(m, entry.welfareOverrideAmount);
      }
    }
    const welfareByMonthMap = welfareByScheduleDisplayMonth(
      br,
      noteByMonth,
      welfareOverrideByAccrualMonth,
    );
    /** 마지막 안전망 — 비활성 월 키 제거(스케줄 페이지와 동일 가드). */
    for (let m = 1; m <= 12; m++) {
      if (monthIsActive(empStatus, m)) continue;
      welfareByMonthMap.delete(m);
    }
    const welfareByMonth: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      welfareByMonth[m] = welfareByMonthMap.get(m) ?? 0;
    }

    /**
     * 급여분 멘트 — 운용방식 분기.
     *  - SALARY_WELFARE / COMBINED: adjustedSalary ÷ 12 (없으면 baseSalary 폴백)
     *  - 그 외: baseSalary ÷ 12 (없으면 adjustedSalary 폴백)
     *  - 둘 다 0 이면 monthlySalaryPortion(emp) × 12 폴백.
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

    const salaryActiveMonths = activeMonthsSortedForYear(empStatus);
    const lastSalaryActiveMonth =
      salaryActiveMonths.length > 0 ? salaryActiveMonths[salaryActiveMonths.length - 1]! : null;
    /**
     * 안내 멘트 정산은 운영보고 `salaryByMonth` 정산과 분리한다 — `hasAdjustedSalaryOverride: false`
     * 로 호출해, 운영자가 월별 `adjustedSalaryOverrideAmount` 로 수동 분배했더라도
     * 안내 멘트는 「받아야 할 누적 = 실제 누적」 룰을 그대로 따른다.
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

    return {
      employeeCode: emp.employeeCode,
      name: emp.name,
      welfareByMonth,
      announcementSalaryByMonthList: announcementSalaryByMonth as readonly number[],
      salaryMonth: monthlySalaryPortion(emp),
      flagRepReturn: emp.flagRepReturn,
      repReturnByMonth: monthlyRecordFor(repReturnSchedule, emp.id),
      spouseReceiptByMonth: monthlyRecordFor(spouseReceiptSchedule, emp.id),
      discretionaryByMonth: monthlyRecordFor(discretionarySchedule, emp.id),
      customReturnsByMonth: customReturnsByMonthFor(emp.id),
    };
  });

  const announcementPayloadJson = encodeAnnouncementPanelPayloadJson(cardRows);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`월별 안내 · ${year}`}
        title="월별 안내 멘트"
        meta={
          <>
            <span className="trust-pill">기준 연도 {year}</span>
            <span className="trust-pill">대상 직원 {employees.length}명</span>
          </>
        }
      />
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        본 화면은 안내 멘트만 생성·복사합니다. 금액 입력(선택적복지·대표반환·배우자수령·알아서금액·발생 인센 등) 은 모두{" "}
        <Link href="/dashboard/schedule" className="font-semibold text-[var(--accent)] hover:underline">
          월별 스케줄
        </Link>{" "}
        화면에 모여 있습니다.
      </p>
      <AnnouncementPanelClient
        year={year}
        payloadJson={announcementPayloadJson}
        operationMode={tenantOperationMode}
        reserveStatus={reserveStatus}
        announcementMode={tenantRow?.announcementMode ?? "SINGLE"}
        defaultBatchFromMonth={tenantRow?.announcementBatchFromMonth ?? null}
        defaultBatchToMonth={tenantRow?.announcementBatchToMonth ?? null}
      />
    </div>
  );
}
