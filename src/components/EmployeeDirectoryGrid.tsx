import Link from "next/link";
import type { ReactNode } from "react";
import type { Employee } from "@/types/models";
import { formatWon, yn } from "@/lib/spreadsheet-format";

function won(n: number | null | undefined): string {
  const s = formatWon(n ?? null);
  return s || "—";
}

function VField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-[var(--border)]/70 py-2 last:border-b-0">
      <div className="text-[0.6875rem] font-medium text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 break-words text-[0.8125rem] leading-snug text-[var(--text)]">{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 mt-3 border-b border-[var(--border-strong)] pb-1 text-[0.7rem] font-semibold text-[var(--muted)] first:mt-0">
      {children}
    </p>
  );
}

export function EmployeeDirectoryGrid({
  employees,
  colRepReturn,
  colSpouseReceipt,
  colWorkerNet,
}: {
  employees: Employee[];
  colRepReturn: boolean;
  colSpouseReceipt: boolean;
  colWorkerNet: boolean;
}) {
  if (employees.length === 0) {
    return <p className="p-6 text-sm text-[var(--muted)]">등록된 직원이 없습니다.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {employees.map((e) => (
        <article
          key={e.id}
          className="surface surface-hoverable flex min-w-0 flex-col overflow-hidden text-[0.8125rem] leading-snug"
        >
          <header className="border-b border-[var(--border)] bg-[var(--surface-hover)]/35 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold tracking-tight text-[var(--text)]">{e.name}</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  <span className="tabular-nums text-[var(--text)]">{e.employeeCode}</span>
                  {e.position ? (
                    <span className="mt-0.5 block break-words leading-snug">직급 {e.position}</span>
                  ) : null}
                </p>
              </div>
              <Link
                href={`/dashboard/employees/${e.id}`}
                className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                상세
              </Link>
            </div>
          </header>

          <div className="flex flex-1 flex-col px-4 pb-3">
            <SectionTitle>급여·복지</SectionTitle>
            <VField label="기존연봉" value={<span className="tabular-nums">{won(e.baseSalary)}</span>} />
            <VField label="조정급여" value={<span className="tabular-nums">{won(e.adjustedSalary)}</span>} />
            <VField label="사복지급분" value={<span className="tabular-nums">{won(e.welfareAllocation)}</span>} />
            <VField label="알아서금액" value={<span className="tabular-nums">{won(e.discretionaryAmount)}</span>} />

            {colRepReturn || colSpouseReceipt || colWorkerNet ? (
              <>
                <SectionTitle>표시 항목</SectionTitle>
                {colRepReturn ? <VField label="대표반환" value={yn(e.flagRepReturn) || "—"} /> : null}
                {colSpouseReceipt ? <VField label="배우자수령" value={yn(e.flagSpouseReceipt) || "—"} /> : null}
                {colWorkerNet ? (
                  <VField label="근로자 실질 수령(반환분 제외)" value={yn(e.flagWorkerNet) || "—"} />
                ) : null}
              </>
            ) : null}

            <SectionTitle>가족·일정</SectionTitle>
            <VField label="입사 월" value={e.hireMonth ?? "—"} />
            <VField label="생일 월" value={e.birthMonth ?? "—"} />
            <VField label="결혼기념월" value={e.weddingMonth ?? "—"} />
            <VField label="영유아" value={e.childrenInfant} />
            <VField label="미취학아동" value={e.childrenPreschool} />
            <VField label="청소년" value={e.childrenTeen} />
            <VField label="부모님" value={e.parentsCount} />
            <VField label="시부모님" value={e.parentsInLawCount} />

            <SectionTitle>공제·지급</SectionTitle>
            <VField label="보험료" value={<span className="tabular-nums">{won(e.insurancePremium)}</span>} />
            <VField label="대출이자" value={<span className="tabular-nums">{won(e.loanInterest)}</span>} />
            <VField label="월세" value={<span className="tabular-nums">{won(e.monthlyRentAmount)}</span>} />
            <VField label="급여일" value={e.payDay ?? "—"} />
            <VField label="레벨" value={e.level} />
            <VField label="예상 인센" value={<span className="tabular-nums">{won(e.incentiveAmount)}</span>} />
          </div>
        </article>
      ))}
    </div>
  );
}
