"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type {
  Employee,
  Level5Override,
  LevelPaymentRule,
  MonthlyEmployeeNote,
  QuarterlyEmployeeConfig,
} from "@/types/models";
import type { PaymentEventKey } from "@/lib/business-rules";
import {
  computeActualYearlyWelfareForEmployee,
  effectiveAnnualSalaryWon,
  employeeStatusForYear,
  type CustomPaymentScheduleDef,
  type EmployeeStatusForYear,
} from "@/lib/domain/schedule";
import { effectiveWelfareAllocationWon } from "@/lib/domain/salary-inclusion";
import { computeAdjustedSalaryAudit } from "@/lib/domain/adjusted-salary-audit";
import { formatWon, yn } from "@/lib/spreadsheet-format";

export type EmployeeDirectoryPayrollYearContext = {
  activeYear: number;
  foundingMonth: number;
  accrualCurrentMonthPayNext: boolean;
  rules: LevelPaymentRule[];
  overrides: Level5Override[];
  quarterly: QuarterlyEmployeeConfig[];
  monthlyNotes: MonthlyEmployeeNote[];
  customSchedule: CustomPaymentScheduleDef[];
  /** 내장 정기 4종 귀속월 업체 오버라이드. 미전달이면 코드 기본값. */
  fixedEventMonths?: Partial<Record<PaymentEventKey, number>>;
};

const EM = "—";

function won(n: number | null | undefined): string {
  return formatWon(n ?? null) || EM;
}

function monthLabel(m: number | null | undefined): string {
  return m != null ? `${m}월` : EM;
}

function statusBadge(status: EmployeeStatusForYear | null): ReactNode {
  if (!status) return null;
  if (status.kind === "ACTIVE_FULL_YEAR") return <span className="badge badge-success">재직</span>;
  if (status.kind === "ACTIVE_PARTIAL") {
    const { fromMonth, toMonth } = status.range;
    const label =
      fromMonth === 1 ? `~${toMonth}월 재직` : toMonth === 12 ? `${fromMonth}월~ 재직` : `${fromMonth}~${toMonth}월 재직`;
    return <span className="badge badge-warn">{label}</span>;
  }
  return (
    <span className="badge badge-neutral">
      {status.resignYear}년{status.resignMonth ? ` ${status.resignMonth}월` : ""} 퇴사
    </span>
  );
}

/** 펼침 영역 내부 — 한 라벨/값 행 */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--border)]/50">
      <span className="shrink-0 text-xs text-[var(--muted)]">{label}</span>
      <span className="min-w-0 truncate text-right text-sm tabular-nums text-[var(--text)]">{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="dash-eyebrow mb-1.5">{children}</p>;
}

export function EmployeeDirectoryTable({
  employees,
  colRepReturn,
  colSpouseReceipt,
  colWorkerNet,
  payrollYearContext,
}: {
  employees: Employee[];
  colRepReturn: boolean;
  colSpouseReceipt: boolean;
  colWorkerNet: boolean;
  payrollYearContext?: EmployeeDirectoryPayrollYearContext;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const hasCtx = payrollYearContext != null;

  const rows = useMemo(() => {
    return employees.map((e) => {
      const status =
        payrollYearContext != null ? employeeStatusForYear(e, payrollYearContext.activeYear) : null;
      const ovr = payrollYearContext?.overrides.filter((x) => x.employeeId === e.id) ?? [];
      const q = payrollYearContext?.quarterly.filter((x) => x.employeeId === e.id) ?? [];
      const n = payrollYearContext?.monthlyNotes.filter((x) => x.employeeId === e.id) ?? [];
      const welfareY =
        payrollYearContext != null
          ? computeActualYearlyWelfareForEmployee(
              e,
              payrollYearContext.activeYear,
              payrollYearContext.foundingMonth,
              payrollYearContext.accrualCurrentMonthPayNext,
              payrollYearContext.rules,
              ovr,
              q,
              n,
              payrollYearContext.customSchedule,
              payrollYearContext.fixedEventMonths ?? {},
            )
          : 0;
      const salaryY = payrollYearContext != null ? effectiveAnnualSalaryWon(e) : 0;
      /**
       * 조정연봉 감사 — 조사표(`Employee.adjustedSalary`) vs 월별 누적(`resolveEffectiveAdjustedSalary` 합).
       * 중도 변동(월별 `adjustedSalaryOverrideAmount`) 이 있는 직원만 유의미한 차이가 발생한다.
       */
      const salaryAudit =
        payrollYearContext != null
          ? computeAdjustedSalaryAudit(e, payrollYearContext.activeYear, n)
          : null;
      return { e, status, welfareY, totalY: salaryY + welfareY, salaryAudit };
    });
  }, [employees, payrollYearContext]);

  const allExpanded = rows.length > 0 && rows.every((r) => expanded.has(r.e.id));

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAll(open: boolean) {
    setExpanded(open ? new Set(rows.map((r) => r.e.id)) : new Set());
  }

  /**
   * sticky 헤더 폭 안정화를 위해 각 컬럼 폭을 일관되게 두 번째 행 colspan 도 동일.
   *  컬럼: 펼침 / 코드 / 이름 / 직급 / Lv / 상태 / 사복지급분 / [연간 기금] / 편집
   */
  const totalCols = hasCtx ? 9 : 8;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          한 줄에 핵심 정보만 표시 — 왼쪽 ▶ 를 누르면 가족·일정·공제 등 세부가 펼쳐집니다.
        </p>
        <button
          type="button"
          onClick={() => setAll(!allExpanded)}
          className="btn btn-outline text-xs"
        >
          {allExpanded ? "모두 접기" : "모두 펼치기"}
        </button>
      </div>

      <div className="surface overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)] bg-[var(--surface-hover)]/40">
              <th className="dash-table-th-md w-10 text-center" aria-label="세부 펼침" />
              <th className="dash-table-th-md text-left">코드</th>
              <th className="dash-table-th-md text-left">이름</th>
              <th className="dash-table-th-md text-left">직급</th>
              <th className="dash-table-th-md text-center">Lv</th>
              <th className="dash-table-th-md text-left">상태</th>
              <th className="dash-table-th-md text-right">사복지급분</th>
              {hasCtx ? (
                <th className="dash-table-th-md text-right">{payrollYearContext.activeYear}년 사복</th>
              ) : null}
              <th className="dash-table-th-md w-20 text-center">편집</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = r.e;
              const isOpen = expanded.has(e.id);
              const dimmed = r.status?.kind === "AFTER_RESIGN";
              const eff = effectiveWelfareAllocationWon(e);
              const showEffWelfare =
                e.priorOverpaidWelfareWon != null && Number(e.priorOverpaidWelfareWon) > 0;

              return (
                <Fragment key={e.id}>
                  <tr
                    className={
                      "border-b border-[var(--border)] dash-table-row " + (dimmed ? "opacity-70" : "")
                    }
                  >
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => toggle(e.id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "세부 접기" : "세부 펼치기"}
                        className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                      >
                        {isOpen ? "▼" : "▶"}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs tabular-nums text-[var(--muted)]">
                      {e.employeeCode}
                    </td>
                    <td className="px-2 py-2.5 text-sm font-bold text-[var(--text)]">{e.name}</td>
                    <td className="px-2 py-2.5 text-xs text-[var(--muted)]">{e.position || EM}</td>
                    <td className="px-2 py-2.5 text-center text-xs font-semibold tabular-nums text-[var(--muted)]">
                      Lv.{e.level}
                    </td>
                    <td className="px-2 py-2.5">{statusBadge(r.status)}</td>
                    <td className="px-2 py-2.5 text-right text-sm tabular-nums">
                      {showEffWelfare ? (
                        <span title={`사복 ${won(e.welfareAllocation)} − 전기 ${won(e.priorOverpaidWelfareWon)} = 실효 ${won(eff)}`}>
                          <span className="font-semibold text-[var(--accent)]">{won(eff)}</span>
                          <span className="ml-1 text-[var(--muted)]">/{won(e.welfareAllocation)}</span>
                        </span>
                      ) : (
                        won(e.welfareAllocation)
                      )}
                    </td>
                    {hasCtx ? (
                      <td className="px-2 py-2.5 text-right text-sm font-bold tabular-nums text-[var(--accent)]">
                        {won(r.welfareY)}
                      </td>
                    ) : null}
                    <td className="text-center">
                      <Link
                        href={`/dashboard/employees/${e.id}`}
                        className="text-xs font-bold text-[var(--accent)] hover:underline"
                      >
                        편집
                      </Link>
                    </td>
                  </tr>

                  {isOpen ? (
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]/30">
                      <td colSpan={totalCols} className="px-4 py-4">
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {/* 급여·복지 */}
                          <div>
                            <SectionTitle>급여 · 복지</SectionTitle>
                            <Row label="기존연봉" value={`${won(e.baseSalary)}원`} />
                            <Row
                              label="조정급여"
                              value={
                                r.salaryAudit && r.salaryAudit.overrideMonths.length > 0 && r.salaryAudit.diff !== 0 ? (
                                  <span
                                    className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5"
                                    title={`조사표 ${won(r.salaryAudit.surveyAdjustedAnnual)}원 vs 실제 누적 ${won(r.salaryAudit.actualAdjustedAnnual)}원 — 월별 재분배 ${r.salaryAudit.overrideMonths.length}개월`}
                                  >
                                    <span>{won(e.adjustedSalary)}원</span>
                                    <span className="badge badge-warn">
                                      중도변동 {r.salaryAudit.diff > 0 ? "+" : "−"}
                                      {won(Math.abs(r.salaryAudit.diff))}원
                                    </span>
                                  </span>
                                ) : (
                                  `${won(e.adjustedSalary)}원`
                                )
                              }
                            />
                            <Row label="사복지급분" value={`${won(e.welfareAllocation)}원`} />
                            {showEffWelfare ? (
                              <>
                                <Row
                                  label="전기 더 받음"
                                  value={
                                    <span className="text-[var(--danger)]">−{won(e.priorOverpaidWelfareWon)}원</span>
                                  }
                                />
                                <Row
                                  label="실효 사복지급분"
                                  value={<span className="font-bold text-[var(--accent)]">{won(eff)}원</span>}
                                />
                              </>
                            ) : null}
                            <Row label="알아서금액" value={`${won(e.discretionaryAmount)}원`} />
                            <Row label="예상 인센" value={`${won(e.incentiveAmount)}원`} />
                            {hasCtx ? (
                              <>
                                <Row
                                  label={`${payrollYearContext.activeYear}년 연간 사복`}
                                  value={<span className="font-bold text-[var(--accent)]">{won(r.welfareY)}원</span>}
                                />
                                <Row
                                  label="연간 합계 (급여+사복)"
                                  value={<span className="font-semibold">{won(r.totalY)}원</span>}
                                />
                              </>
                            ) : null}
                          </div>

                          {/* 일정 */}
                          <div>
                            <SectionTitle>일정</SectionTitle>
                            <Row label="입사월" value={monthLabel(e.hireMonth)} />
                            <Row
                              label="퇴사"
                              value={
                                e.resignYear != null
                                  ? `${e.resignYear}${e.resignMonth != null ? `.${e.resignMonth}` : ""}`
                                  : e.resignMonth != null
                                    ? `${e.resignMonth}월`
                                    : "재직 중"
                              }
                            />
                            <Row label="생일월" value={monthLabel(e.birthMonth)} />
                            <Row label="결혼기념월" value={monthLabel(e.weddingMonth)} />
                            <Row label="급여일" value={e.payDay != null ? `${e.payDay}일` : EM} />
                          </div>

                          {/* 가족 */}
                          <div>
                            <SectionTitle>가족 수</SectionTitle>
                            <Row label="영유아" value={e.childrenInfant} />
                            <Row label="미취학" value={e.childrenPreschool} />
                            <Row label="청소년" value={e.childrenTeen} />
                            <Row label="부모님" value={e.parentsCount} />
                            <Row label="시부모님" value={e.parentsInLawCount} />
                          </div>

                          {/* 공제·플래그 */}
                          <div>
                            <SectionTitle>공제 · 표시</SectionTitle>
                            <Row label="보험료" value={`${won(e.insurancePremium)}원`} />
                            <Row label="대출이자" value={`${won(e.loanInterest)}원`} />
                            <Row label="월세" value={`${won(e.monthlyRentAmount)}원`} />
                            {colRepReturn ? <Row label="대표반환" value={yn(e.flagRepReturn) || EM} /> : null}
                            {colSpouseReceipt ? (
                              <Row label="배우자수령" value={yn(e.flagSpouseReceipt) || EM} />
                            ) : null}
                            {colWorkerNet ? (
                              <Row label="근로자 실질" value={yn(e.flagWorkerNet) || EM} />
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
