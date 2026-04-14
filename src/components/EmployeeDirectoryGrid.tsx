import Link from "next/link";
import type { ReactNode } from "react";
import type { Employee } from "@/types/models";
import { formatWon, yn } from "@/lib/spreadsheet-format";

function won(n: number | null | undefined): string {
  const s = formatWon(n ?? null);
  return s || "—";
}

/** 카드 안에서 라벨·값을 한 칸으로 (그리드 여러 열에 나란히 배치) */
function FieldCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-bold leading-tight tracking-tight text-[var(--muted)]">{label}</div>
      <div className="mt-1 break-words text-base font-semibold leading-snug text-[var(--text)]">{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 mt-4 border-b-2 border-[var(--border-strong)] pb-1.5 text-sm font-bold tracking-tight text-[var(--text)] first:mt-0">
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
    return <p className="p-6 text-base font-medium text-[var(--muted)]">등록된 직원이 없습니다.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {employees.map((e) => (
        <article
          key={e.id}
          className="surface surface-hoverable flex min-w-0 flex-col overflow-hidden text-sm leading-snug"
        >
          <header className="border-b border-[var(--border)] bg-[var(--surface-hover)]/35 px-4 py-3.5 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-tight text-[var(--text)]">{e.name}</h2>
                <p className="mt-1.5 text-sm text-[var(--muted)]">
                  <span className="font-mono text-sm font-bold tabular-nums text-[var(--text)]">{e.employeeCode}</span>
                  {e.position ? (
                    <span className="mt-1 block break-words text-sm font-semibold leading-snug text-[var(--text)]">
                      직급 {e.position}
                    </span>
                  ) : null}
                </p>
              </div>
              <Link
                href={`/dashboard/employees/${e.id}`}
                className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-[var(--accent)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                상세
              </Link>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-0.5 px-4 pb-4 pt-1 sm:px-5">
            <SectionTitle>급여·복지</SectionTitle>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 min-[360px]:grid-cols-4">
              <FieldCell label="기존연봉" value={<span className="tabular-nums font-bold">{won(e.baseSalary)}</span>} />
              <FieldCell label="조정급여" value={<span className="tabular-nums font-bold">{won(e.adjustedSalary)}</span>} />
              <FieldCell label="사복지급분" value={<span className="tabular-nums font-bold">{won(e.welfareAllocation)}</span>} />
              <FieldCell label="알아서금액" value={<span className="tabular-nums font-bold">{won(e.discretionaryAmount)}</span>} />
            </div>

            {colRepReturn || colSpouseReceipt || colWorkerNet ? (
              <>
                <SectionTitle>표시 항목</SectionTitle>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
                  {colRepReturn ? <FieldCell label="대표반환" value={yn(e.flagRepReturn) || "—"} /> : null}
                  {colSpouseReceipt ? <FieldCell label="배우자수령" value={yn(e.flagSpouseReceipt) || "—"} /> : null}
                  {colWorkerNet ? (
                    <FieldCell label="근로자 실질 수령" value={yn(e.flagWorkerNet) || "—"} />
                  ) : null}
                </div>
              </>
            ) : null}

            <SectionTitle>가족·일정</SectionTitle>
            <div className="grid grid-cols-3 gap-x-3 gap-y-3">
              <FieldCell label="입사 월" value={<span className="tabular-nums font-bold">{e.hireMonth ?? "—"}</span>} />
              <FieldCell label="생일 월" value={<span className="tabular-nums font-bold">{e.birthMonth ?? "—"}</span>} />
              <FieldCell label="결혼기념월" value={<span className="tabular-nums font-bold">{e.weddingMonth ?? "—"}</span>} />
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-5">
              <FieldCell label="영유아" value={<span className="tabular-nums font-bold">{e.childrenInfant}</span>} />
              <FieldCell label="미취학아동" value={<span className="tabular-nums font-bold">{e.childrenPreschool}</span>} />
              <FieldCell label="청소년" value={<span className="tabular-nums font-bold">{e.childrenTeen}</span>} />
              <FieldCell label="부모님" value={<span className="tabular-nums font-bold">{e.parentsCount}</span>} />
              <FieldCell label="시부모님" value={<span className="tabular-nums font-bold">{e.parentsInLawCount}</span>} />
            </div>

            <SectionTitle>공제·지급</SectionTitle>
            <div className="grid grid-cols-3 gap-x-3 gap-y-3">
              <FieldCell label="보험료" value={<span className="tabular-nums font-bold">{won(e.insurancePremium)}</span>} />
              <FieldCell label="대출이자" value={<span className="tabular-nums font-bold">{won(e.loanInterest)}</span>} />
              <FieldCell label="월세" value={<span className="tabular-nums font-bold">{won(e.monthlyRentAmount)}</span>} />
            </div>
            <div className="mt-1 grid grid-cols-3 gap-x-3 gap-y-3">
              <FieldCell label="급여일" value={<span className="tabular-nums font-bold">{e.payDay ?? "—"}</span>} />
              <FieldCell label="레벨" value={<span className="tabular-nums font-bold">{e.level}</span>} />
              <FieldCell label="예상 인센" value={<span className="tabular-nums font-bold">{won(e.incentiveAmount)}</span>} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
