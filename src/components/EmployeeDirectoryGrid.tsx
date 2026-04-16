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

const EM = "—";

function won(n: number | null | undefined): string {
  return formatWon(n ?? null) || EM;
}

function monthLabel(m: number | null | undefined): string {
  return m != null ? `${m}월` : EM;
}

/** 라벨 + 값 한 행 */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 py-2 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--border)]/60">
      <span className="shrink-0 text-xs font-medium text-[var(--muted)]">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-semibold tabular-nums text-[var(--text)]">
        {value}
      </span>
    </div>
  );
}

/** 섹션 소제목 */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="dash-eyebrow mb-2 mt-4 first:mt-0">{children}</p>
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
  payrollYearContext?: EmployeeDirectoryPayrollYearContext;
}) {
  if (employees.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--muted)]">등록된 직원이 없습니다.</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
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
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
          >
            {/* 헤더 */}
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-hover)]/50 px-4 py-3.5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-mono text-xs font-semibold tabular-nums text-[var(--muted)]">{e.employeeCode}</p>
                <p className="text-lg font-bold leading-tight tracking-tight text-[var(--text)]">{e.name}</p>
                {e.position ? (
                  <p className="text-xs text-[var(--muted)]">{e.position}</p>
                ) : null}
              </div>
              <Link
                href={`/dashboard/employees/${e.id}`}
                className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                상세
              </Link>
            </header>

            <div className="px-4 py-3">
              {/* 급여·복지 */}
              <SectionLabel>급여 · 복지</SectionLabel>
              <Row label="기존연봉" value={won(e.baseSalary)} />
              <Row label="조정급여" value={won(e.adjustedSalary)} />
              <Row label="사복지급분" value={won(e.welfareAllocation)} />
              <Row label="알아서금액" value={won(e.discretionaryAmount)} />
              {payrollYearContext != null ? (
                <>
                  <Row label={`${payrollYearContext.activeYear}년 연간 사복`} value={won(welfareY)} />
                  <Row label="연간 합계 (급여+사복)" value={won(totalY)} />
                </>
              ) : null}

              {/* 표시항목 (설정된 것만) */}
              {(colRepReturn || colSpouseReceipt || colWorkerNet) ? (
                <>
                  <SectionLabel>표시 항목</SectionLabel>
                  {colRepReturn ? <Row label="대표반환" value={yn(e.flagRepReturn) || EM} /> : null}
                  {colSpouseReceipt ? <Row label="배우자수령" value={yn(e.flagSpouseReceipt) || EM} /> : null}
                  {colWorkerNet ? <Row label="근로자 실질 수령" value={yn(e.flagWorkerNet) || EM} /> : null}
                </>
              ) : null}

              {/* 일정 */}
              <SectionLabel>일정</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "입사월", value: monthLabel(e.hireMonth) },
                  { label: "생일월", value: monthLabel(e.birthMonth) },
                  { label: "결혼기념", value: monthLabel(e.weddingMonth) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--surface-hover)]/50 px-2 py-2 text-center">
                    <p className="text-[0.65rem] font-semibold text-[var(--muted)]">{label}</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text)]">{value}</p>
                  </div>
                ))}
              </div>

              {/* 가족 수 */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-[var(--border)] bg-[var(--surface-hover)]/50 px-3 py-2">
                {[
                  { short: "영유아", full: "영유아", val: e.childrenInfant },
                  { short: "미취학", full: "미취학아동", val: e.childrenPreschool },
                  { short: "청소년", full: "청소년", val: e.childrenTeen },
                  { short: "부모님", full: "부모님", val: e.parentsCount },
                  { short: "시부모", full: "시부모님", val: e.parentsInLawCount },
                ].map(({ short, full, val }) => (
                  <span key={short} title={full} className="text-xs text-[var(--muted)]">
                    {short} <span className="font-bold tabular-nums text-[var(--text)]">{val}</span>
                  </span>
                ))}
              </div>

              {/* 공제·지급 */}
              <SectionLabel>공제 · 지급</SectionLabel>
              <Row label="보험료" value={won(e.insurancePremium)} />
              <Row label="대출이자" value={won(e.loanInterest)} />
              <Row label="월세" value={won(e.monthlyRentAmount)} />
              <Row label="급여일" value={e.payDay != null ? `${e.payDay}일` : EM} />
              <Row label="레벨" value={e.level} />
              <Row label="예상 인센" value={won(e.incentiveAmount)} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
