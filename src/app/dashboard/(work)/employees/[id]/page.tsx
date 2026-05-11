import { notFound } from "next/navigation";
import {
  companySettingsByTenant,
  employeeFindFirst,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeYear,
  levelPaymentRuleList,
  levelTargetList,
  monthlyNoteListByEmployeeYear,
  quarterlyEmployeeConfigListByTenantYear,
  tenantGetById,
  vendorListByTenant,
} from "@/lib/pb/repository";
import { parseTenantOperationMode } from "@/lib/domain/tenant-profile";
import { koreaMinimumAnnualSalaryWon } from "@/lib/domain/korea-minimum-wage";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees, canEditLevelRules } from "@/lib/permissions";
import { EmployeeForm } from "@/components/EmployeeForm";
import {
  allPaymentEventKeysForYear,
  customPaymentDefsForYear,
  customPaymentScheduleRows,
  effectiveFixedEventMonthMap,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";
import { Level5OverrideMatrixForm, type Level5OverrideRow } from "@/components/Level5OverrideMatrixForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmployeeYearOverviewPanel } from "@/components/EmployeeYearOverviewPanel";
import {
  activeMonthsSortedForYear,
  announcementStatusForYear,
  buildMonthlyBreakdown,
  computeActualWelfareThroughPaidMonth,
  employeeStatusForYear,
  monthIsActive,
  monthlyOverrideMapFromNotes,
  monthlySalaryPortion,
  welfareByScheduleDisplayMonth,
} from "@/lib/domain/schedule";
import { resolveEffectiveAdjustedSalaryForMonth } from "@/lib/domain/salary-inclusion";
import {
  computeAnnouncementTrueUpDetail,
  formatAnnouncementTrueUpBreakdownLine,
} from "@/lib/domain/announcement-trueup";
import {
  additionalReserveStatus,
  summarizeTenantAdditionalReserve,
  tenantReserveTotalSumWon,
} from "@/lib/domain/vendor-reserve";
import { encodeAnnouncementPanelPayloadJson } from "@/lib/domain/schedule-announcement-payload";
import type { Employee } from "@/types/models";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function OverrideMatrix({
  employeeId,
  tenantId,
  year,
}: {
  employeeId: string;
  tenantId: string;
  year: number;
}) {
  const settings = await companySettingsByTenant(tenantId);
  const customDefs = customPaymentDefsForYear(settings, year);
  const eventKeys = allPaymentEventKeysForYear(settings, year);

  const [rules, overrides] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeYear(employeeId, year),
  ]);

  const level5DefaultByEvent = new Map<string, number>();
  for (const r of rules) {
    if (r.year === year && r.level === 5) {
      level5DefaultByEvent.set(r.eventKey, Math.round(r.amount));
    }
  }
  const overrideByEvent = new Map<string, number>();
  for (const o of overrides) {
    overrideByEvent.set(o.eventKey, Math.round(o.amount));
  }

  const rows: Level5OverrideRow[] = eventKeys.map((ev) => ({
    eventKey: ev,
    label: paymentEventLabel(ev, customDefs),
    defaultAmountWon: level5DefaultByEvent.get(ev) ?? 0,
    overrideAmountWon: overrideByEvent.has(ev) ? (overrideByEvent.get(ev) ?? 0) : null,
  }));

  const rulesSignature = `${year}|${eventKeys.join(",")}`;

  return (
    <Level5OverrideMatrixForm
      employeeId={employeeId}
      year={year}
      rows={rows}
      rulesSignature={rulesSignature}
    />
  );
}

/**
 * 「이 직원 12개월 한눈에」 — 스케줄/안내 페이지의 직원 1명 row 빌드를 그대로 수행해 안내 패널 와이어 페이로드(1 row)로 직렬화한다.
 * 이렇게 하면 클라이언트(`EmployeeYearOverviewPanel`) 가 12개월 표·안내 멘트 모두 동일 데이터로 만들 수 있다.
 *
 * 향후 스케줄/안내 페이지와 같은 빌드를 도메인 헬퍼로 추출(PR-2)할 때 이 함수도 같이 통합한다.
 */
async function buildEmployeeYearOverviewPayload(args: {
  emp: Employee;
  tenantId: string;
  year: number;
  foundingMonth: number;
  tenantOperationMode: ReturnType<typeof parseTenantOperationMode>;
  settings: Awaited<ReturnType<typeof companySettingsByTenant>>;
}): Promise<{ payloadJson: string; reserveStatus: ReturnType<typeof additionalReserveStatus> }> {
  const { emp, tenantId, year, foundingMonth, tenantOperationMode, settings } = args;

  const [rules, overrides, quarterly, notes, vendors, tenantRow] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeYear(emp.id, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, [emp.id]),
    monthlyNoteListByEmployeeYear(emp.id, year),
    vendorListByTenant(tenantId),
    tenantGetById(tenantId),
  ]);

  const customSchedule = customPaymentScheduleRows(settings, year);
  const fixedEventMonths = effectiveFixedEventMonthMap(settings);

  const overrideMap = monthlyOverrideMapFromNotes(notes, year);
  const br = buildMonthlyBreakdown(
    emp,
    year,
    foundingMonth,
    rules,
    overrides,
    quarterly,
    customSchedule,
    fixedEventMonths,
    overrideMap,
  );

  const empStatus = employeeStatusForYear(emp, year);
  const announcementStatus = announcementStatusForYear(emp, year);

  /** 노트 → 선택적복지 월별 (활성 월만) */
  const noteByMonth = new Map<number, number>();
  for (const n of notes) {
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
  const welfareByMonthMap = welfareByScheduleDisplayMonth(br, noteByMonth, welfareOverrideByAccrualMonth);
  for (let m = 1; m <= 12; m++) {
    if (monthIsActive(empStatus, m)) continue;
    welfareByMonthMap.delete(m);
  }
  const welfareByMonth: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) welfareByMonth[m] = welfareByMonthMap.get(m) ?? 0;

  /** 급여분 멘트 월액 — 안내 페이지와 동일 식 */
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
  const salaryActiveMonths = activeMonthsSortedForYear(announcementStatus);
  const lastSalaryActiveMonth =
    salaryActiveMonths.length > 0 ? salaryActiveMonths[salaryActiveMonths.length - 1]! : null;

  let announcementTrueUpApplied = 0;
  let announcementTrueUpMonth: number | null = null;
  let announcementTrueUpBreakdown: string | null = null;
  if (isSalaryLowering && lastSalaryActiveMonth != null && salaryActiveMonths.length < 12) {
    const welfareYtdThroughLast = computeActualWelfareThroughPaidMonth(
      emp,
      year,
      foundingMonth,
      rules,
      overrides,
      quarterly,
      notes,
      lastSalaryActiveMonth,
      customSchedule,
      fixedEventMonths,
    );
    let incentiveAccrualYtd = 0;
    for (const n of notes) {
      if (n.year !== year) continue;
      if (!monthIsActive(announcementStatus, n.month)) continue;
      const v = n.incentiveAccrualAmount != null ? Number(n.incentiveAccrualAmount) : 0;
      if (Number.isFinite(v) && v > 0) incentiveAccrualYtd += Math.round(v);
    }
    const detail = computeAnnouncementTrueUpDetail({
      employee: emp,
      activeMonthsCount: salaryActiveMonths.length,
      incentiveAccrualYtdWon: incentiveAccrualYtd,
      welfarePaidYtdWon: welfareYtdThroughLast,
    });
    if (detail.trueUpWon > 0) {
      announcementTrueUpApplied = detail.trueUpWon;
      announcementTrueUpMonth = lastSalaryActiveMonth;
      announcementTrueUpBreakdown = formatAnnouncementTrueUpBreakdownLine(detail);
    }
  }

  const noticeEmpProxy = (
    isSalaryLowering
      ? { adjustedSalary: salaryAnnualForNotice, baseSalary: 0 }
      : { adjustedSalary: 0, baseSalary: salaryAnnualForNotice }
  ) as Pick<Employee, "adjustedSalary" | "baseSalary">;
  const announcementSalaryByMonth: number[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    if (!monthIsActive(announcementStatus, m)) return 0;
    return resolveEffectiveAdjustedSalaryForMonth(noticeEmpProxy, year, m, [], salaryActiveMonths);
  });
  if (announcementTrueUpApplied > 0 && announcementTrueUpMonth != null) {
    const idx = announcementTrueUpMonth - 1;
    announcementSalaryByMonth[idx] = (announcementSalaryByMonth[idx] ?? 0) + announcementTrueUpApplied;
  }

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
  const customReturnsByMonthFor = (
    employeeId: string,
  ): Array<{ label: string; byMonth: Record<number, number> }> => {
    const cats = settings?.customReturnsSchedule?.categories ?? [];
    if (cats.length === 0) return [];
    const out: Array<{ label: string; byMonth: Record<number, number> }> = [];
    for (const cat of cats) {
      const byMonth = monthlyRecordFor(cat.byEmployeeMonth, employeeId);
      let any = false;
      for (let m = 1; m <= 12; m++) if ((byMonth[m] ?? 0) > 0) { any = true; break; }
      if (!any) continue;
      out.push({ label: cat.label, byMonth });
    }
    return out;
  };

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
  const reserveStatus = additionalReserveStatus(
    { clientEntityType: tenantRow?.clientEntityType ?? "INDIVIDUAL" },
    reserveSummary,
  );

  const payloadJson = encodeAnnouncementPanelPayloadJson([
    {
      employeeCode: emp.employeeCode,
      name: emp.name,
      welfareByMonth,
      announcementSalaryByMonthList: announcementSalaryByMonth as readonly number[],
      salaryMonth: monthlySalaryPortion(emp),
      flagRepReturn: emp.flagRepReturn,
      repReturnByMonth: monthlyRecordFor(settings?.repReturnSchedule ?? null, emp.id),
      spouseReceiptByMonth: monthlyRecordFor(settings?.spouseReceiptSchedule ?? null, emp.id),
      discretionaryByMonth: monthlyRecordFor(settings?.discretionarySchedule ?? null, emp.id),
      customReturnsByMonth: customReturnsByMonthFor(emp.id),
      trueUp:
        announcementTrueUpMonth != null && announcementTrueUpBreakdown
          ? { month: announcementTrueUpMonth, breakdown: announcementTrueUpBreakdown }
          : null,
    },
  ]);

  return { payloadJson, reserveStatus };
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantContext();
  const emp = await employeeFindFirst(id, tenantId);
  if (!emp) notFound();

  const [settings, allEmployees, tenant] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
    tenantGetById(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const tenantOperationMode = parseTenantOperationMode(tenant?.operationMode);
  const minimumAnnualSalaryWon = koreaMinimumAnnualSalaryWon(year);
  const existingEmployees = allEmployees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.name,
    position: e.position,
  }));
  const levelTargets = await levelTargetList(tenantId, year);

  const { payloadJson, reserveStatus } = await buildEmployeeYearOverviewPayload({
    emp,
    tenantId,
    year,
    foundingMonth,
    tenantOperationMode,
    settings,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="직원 상세"
        title={emp.name}
        actions={
          <Link href="/dashboard/employees" className="btn btn-outline text-sm">
            ← 직원 목록
          </Link>
        }
        meta={
          <>
            <span className="trust-pill">사번 {emp.employeeCode}</span>
            <span className="trust-pill">Lv.{emp.level}</span>
            {emp.position ? <span className="trust-pill">{emp.position}</span> : null}
            {emp.flagWelfareIneligible ? <span className="trust-pill text-[var(--warn)]">사복 미대상</span> : null}
            {emp.resignYear === year && emp.resignMonth ? (
              <span className="trust-pill text-[var(--warn)]">{emp.resignMonth}월 퇴사 예정</span>
            ) : null}
          </>
        }
      />

      {/**
       * 「12개월 한눈에 + 안내 미리보기」 — 운영자가 메뉴를 옮기지 않고 한 직원의 연간 상태와
       * 그 달 안내 멘트를 동시에 검증할 수 있도록 페이지 최상단에 배치한다.
       */}
      <section className="surface dash-panel-pad" aria-labelledby="overview-title">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="overview-title" className="text-sm font-semibold tracking-normal text-[var(--text)]">
            {year}년 한눈에
          </h2>
          <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
            <Link href="/dashboard/schedule" className="hover:underline">
              월별 스케줄에서 수정 →
            </Link>
          </div>
        </div>
        <EmployeeYearOverviewPanel
          year={year}
          payloadJson={payloadJson}
          operationMode={tenantOperationMode}
          reserveStatus={reserveStatus}
        />
      </section>

      {/**
       * 인사·운영모드·플래그 폼 — 검증 시 항상 펼치지 않아도 되도록 collapsible 로 둔다.
       * 수정이 필요할 때만 「수정」 버튼으로 펼쳐 사용한다.
       */}
      {canEditEmployees(role) ? (
        <CollapsibleEditorPanel
          title="인사 정보 · 운영모드 · 플래그"
          description="기본 정보·연봉·인센·퇴사 정보·운영모드·차감 등 직원 마스터 데이터."
          triggerLabel="수정"
          closeLabel="접기"
          summary={
            <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <SummaryItem label="기본 연봉" value={fmtWonOrDash(emp.baseSalary)} />
              <SummaryItem label="조정 연봉" value={fmtWonOrDash(emp.adjustedSalary)} />
              <SummaryItem label="예상 인센" value={fmtWonOrDash(emp.incentiveAmount)} />
              <SummaryItem label="예상 사복" value={fmtWonOrDash(emp.expectedYearlyWelfare)} />
              <SummaryItem
                label="운영모드(직원)"
                value={emp.operationMode ?? "— (거래처 기본)"}
              />
              {emp.salaryTrueUpDeductionWon != null && emp.salaryTrueUpDeductionWon > 0 ? (
                <SummaryItem
                  label="정산 차감"
                  value={`${emp.salaryTrueUpDeductionWon.toLocaleString("ko-KR")} 원${
                    emp.salaryTrueUpDeductionMemo ? ` · ${emp.salaryTrueUpDeductionMemo}` : ""
                  }`}
                />
              ) : null}
            </div>
          }
        >
          <EmployeeForm
            employee={emp}
            activeYear={year}
            foundingMonth={foundingMonth}
            minimumAnnualSalaryWon={minimumAnnualSalaryWon}
            tenantSalaryInclusionVarianceMode={settings?.salaryInclusionVarianceMode ?? "BOTH"}
            tenantOperationMode={tenantOperationMode}
            surveyShowRepReturn={settings?.surveyShowRepReturn ?? false}
            surveyShowSpouseReceipt={settings?.surveyShowSpouseReceipt ?? false}
            surveyShowWorkerNet={settings?.surveyShowWorkerNet ?? false}
            existingEmployees={existingEmployees}
            levelTargets={levelTargets}
          />
        </CollapsibleEditorPanel>
      ) : (
        <p className="text-sm text-[var(--muted)]">조회 전용입니다.</p>
      )}

      {emp.level === 5 && canEditLevelRules(role) && (
        <CollapsibleEditorPanel
          title="레벨 5 · 이벤트별 금액 오버라이드"
          triggerLabel="열기"
          defaultOpen={false}
        >
          <OverrideMatrix employeeId={emp.id} tenantId={tenantId} year={year} />
        </CollapsibleEditorPanel>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}

function fmtWonOrDash(n: number | null | undefined): string {
  if (n == null || Number(n) <= 0) return "—";
  return `${Math.round(Number(n)).toLocaleString("ko-KR")} 원`;
}
