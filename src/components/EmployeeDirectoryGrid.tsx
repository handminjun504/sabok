import Link from "next/link";
import type { ReactNode } from "react";
import type {
  Employee,
  Level5Override,
  LevelPaymentRule,
  MonthlyEmployeeNote,
  QuarterlyEmployeeConfig,
} from "@/types/models";
import {
  computeActualYearlyWelfareForEmployee,
  effectiveAnnualSalaryWon,
  type CustomPaymentScheduleDef,
} from "@/lib/domain/schedule";
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
};

const EMPTY = "-";

function won(n: number | null | undefined): string {
  const s = formatWon(n ?? null);
  return s || EMPTY;
}

function monthWithSuffix(m: number | null | undefined): string {
  if (m == null) return EMPTY;
  return `${m}월`;
}

/** 금액·한 줄 값: 라벨(왼쪽) / 값(오른쪽, 줄바꿈 금지) — 좁은 칸에 숫자가 쪼개지는 것 방지 */
function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-[var(--border)]/70 py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1 pr-2 text-sm font-semibold leading-snug text-[var(--text)]">{label}</span>
      <span className="shrink-0 whitespace-nowrap text-right text-base font-bold tabular-nums tracking-tight text-[var(--text)]">
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-0 mt-5 border-b-2 border-[var(--border-strong)] pb-2 text-[0.9375rem] font-bold tracking-tight text-[var(--text)] first:mt-0">
      {children}
    </h3>
  );
}

/** 짧은 라벨 + 숫자 묶음 (가족 수 등) — 라벨은 한 줄 유지, 짧은 표기 + title로 풀네임 */
function StatChip({
  label,
  labelTitle,
  value,
}: {
  label: string;
  labelTitle?: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-[3.25rem] shrink-0">
      <p className="whitespace-nowrap text-xs font-bold text-[var(--muted)]" title={labelTitle}>
        {label}
      </p>
      <p className="mt-1 whitespace-nowrap text-lg font-bold tabular-nums text-[var(--text)]">{value}</p>
    </div>
  );
}

export function EmployeeDirectoryGrid({
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
  /** 있으면 기준 연도 기준 연간 사복·급여+사복 합계 표시(스케줄·분기·월별 노트와 동일 로직) */
  payrollYearContext?: EmployeeDirectoryPayrollYearContext;
}) {
  if (employees.length === 0) {
    return <p className="p-6 text-base font-medium text-[var(--muted)]">등록된 직원이 없습니다.</p>;
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
      {employees.map((e) => {
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
              )
            : 0;
        const salaryY = payrollYearContext != null ? effectiveAnnualSalaryWon(e) : 0;
        const totalY = salaryY + welfareY;
        return (
        <article
          key={e.id}
          className="surface surface-hoverable flex min-w-0 flex-col overflow-hidden shadow-[var(--shadow-card)]"
        >
          <header className="border-b border-[var(--border)] bg-[var(--surface-hover)]/40 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-bold tracking-tight text-[var(--text)]">{e.name}</h2>
                <p className="font-mono text-sm font-bold tabular-nums text-[var(--text)]">{e.employeeCode}</p>
                {e.position ? (
                  <p className="text-sm font-semibold text-[var(--text)]">직급 {e.position}</p>
                ) : null}
              </div>
              <Link
                href={`/dashboard/employees/${e.id}`}
                className="shrink-0 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--accent)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                상세
              </Link>
            </div>
          </header>

          <div className="space-y-0 px-5 pb-5 pt-3">
            <SectionTitle>급여·복지</SectionTitle>
            <div className="pt-1">
              <FieldRow label="기존연봉" value={won(e.baseSalary)} />
              <FieldRow label="조정급여" value={won(e.adjustedSalary)} />
              <FieldRow label="사복지급분" value={won(e.welfareAllocation)} />
              <FieldRow label="알아서금액" value={won(e.discretionaryAmount)} />
              {payrollYearContext != null ? (
                <>
                  <FieldRow
                    label={`${payrollYearContext.activeYear}년 연간 사복(스케줄·노트)`}
                    value={won(welfareY)}
                  />
                  <FieldRow
                    label={`${payrollYearContext.activeYear}년 연간 합계(급여+사복)`}
                    value={won(totalY)}
                  />
                </>
              ) : null}
            </div>

            {colRepReturn || colSpouseReceipt || colWorkerNet ? (
              <>
                <SectionTitle>표시 항목</SectionTitle>
                <div className="pt-1">
                  {colRepReturn ? <FieldRow label="대표반환" value={yn(e.flagRepReturn) || EMPTY} /> : null}
                  {colSpouseReceipt ? <FieldRow label="배우자수령" value={yn(e.flagSpouseReceipt) || EMPTY} /> : null}
                  {colWorkerNet ? <FieldRow label="근로자 실질 수령" value={yn(e.flagWorkerNet) || EMPTY} /> : null}
                </div>
              </>
            ) : null}

            <SectionTitle>가족·일정</SectionTitle>
            <div className="grid grid-cols-3 gap-4 border-b border-[var(--border)]/70 py-3 sm:gap-6">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--muted)]">입사 월</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text)]">{monthWithSuffix(e.hireMonth)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--muted)]">생일 월</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text)]">{monthWithSuffix(e.birthMonth)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--muted)]" title="결혼기념월">
                  결혼기념
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text)]">{monthWithSuffix(e.weddingMonth)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-x-6 gap-y-4 border-b border-[var(--border)]/70 py-4">
              <StatChip label="영유아" value={e.childrenInfant} />
              <StatChip label="미취학" labelTitle="미취학아동" value={e.childrenPreschool} />
              <StatChip label="청소년" value={e.childrenTeen} />
              <StatChip label="부모님" value={e.parentsCount} />
              <StatChip label="시부모님" value={e.parentsInLawCount} />
            </div>

            <SectionTitle>공제·지급</SectionTitle>
            <div className="pt-1">
              <FieldRow label="보험료" value={won(e.insurancePremium)} />
              <FieldRow label="대출이자" value={won(e.loanInterest)} />
              <FieldRow label="월세" value={won(e.monthlyRentAmount)} />
              <FieldRow label="급여일" value={e.payDay != null ? e.payDay : EMPTY} />
              <FieldRow label="레벨" value={e.level} />
              <FieldRow label="예상 인센" value={won(e.incentiveAmount)} />
            </div>
          </div>
        </article>
        );
      })}
    </div>
  );
}
