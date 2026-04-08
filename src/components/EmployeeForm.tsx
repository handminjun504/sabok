"use client";

import { useActionState } from "react";
import type { Employee } from "@prisma/client";
import { saveEmployeeAction, type EmployeeActionState } from "@/app/actions/employee";

const inputClass =
  "mt-0.5 w-full min-w-[5.5rem] rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)]";

function Cell({
  label,
  name,
  defaultValue,
  type = "text",
  className = "",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</label>
      <input className={inputClass} name={name} type={type} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

export function EmployeeForm({
  employee,
  activeYear,
  foundingMonth,
}: {
  employee?: Employee | null;
  activeYear: number;
  foundingMonth: number;
}) {
  const [state, formAction] = useActionState<EmployeeActionState, FormData>(saveEmployeeAction, null);
  const yy = String(activeYear).slice(-2);

  return (
    <form action={formAction} className="space-y-4">
      {employee && <input type="hidden" name="id" value={employee.id} />}
      {state?.오류 && (
        <div className="rounded-lg border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm text-[var(--danger)]">
          {state.오류}
        </div>
      )}
      {state?.성공 && (
        <div className="rounded-lg border border-[var(--success)] p-3 text-sm text-[var(--success)]">
          저장되었습니다.
        </div>
      )}

      <div className="surface overflow-x-auto p-4">
        <p className="border-b border-[var(--border)] pb-2 text-sm font-semibold tracking-tight">
          &lt;{yy}년 사복 진행 조사표&gt;
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          회사창립월 <span className="font-mono text-[var(--text)]">{foundingMonth}</span>월 · 인적사항·급여는 아래 직원
          행에 입력합니다. (전사 설정은 &quot;전사 설정&quot; 메뉴)
        </p>

        <div className="mt-4 min-w-[72rem] space-y-3 border border-[var(--border)] bg-[var(--bg)] p-3">
          <p className="text-[10px] font-semibold text-[var(--muted)]">
            직원 행 — 시트 3행 헤더 순서 (CODE → 급여일)
          </p>
          <div className="grid grid-cols-6 gap-2 gap-y-3 md:grid-cols-8 lg:grid-cols-12">
            <Cell label="CODE" name="employeeCode" defaultValue={employee?.employeeCode} />
            <Cell label="이름" name="name" defaultValue={employee?.name} />
            <Cell label="직급" name="position" defaultValue={employee?.position} />
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">레벨(1~5)</label>
              <input
                className={inputClass}
                name="level"
                type="number"
                min={1}
                max={5}
                defaultValue={employee?.level ?? 3}
                required
              />
            </div>
            <Cell label="기존연봉" name="baseSalary" defaultValue={employee?.baseSalary?.toString()} />
            <Cell label="조정급여" name="adjustedSalary" defaultValue={employee?.adjustedSalary?.toString()} />
            <Cell className="lg:col-span-2" label="사복지급분" name="welfareAllocation" defaultValue={employee?.welfareAllocation?.toString()} />
            <Cell label="인센티브(선택)" name="incentiveAmount" defaultValue={employee?.incentiveAmount?.toString() ?? ""} />
            <Cell className="lg:col-span-2" label="알아서금액" name="discretionaryAmount" defaultValue={employee?.discretionaryAmount?.toString() ?? ""} />
            <Cell label="선택복지금액" name="optionalWelfareAmount" defaultValue={employee?.optionalWelfareAmount?.toString() ?? ""} />
            <Cell label="월지급" name="monthlyPayAmount" defaultValue={employee?.monthlyPayAmount?.toString() ?? ""} />
            <Cell label="분기지급" name="quarterlyPayAmount" defaultValue={employee?.quarterlyPayAmount?.toString() ?? ""} />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--border)] pt-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="flagAutoAmount" defaultChecked={employee?.flagAutoAmount} />
              <span className="text-xs">알아서 금액(자동)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="flagRepReturn" defaultChecked={employee?.flagRepReturn} />
              <span className="text-xs">대표반환</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="flagSpouseReceipt" defaultChecked={employee?.flagSpouseReceipt} />
              <span className="text-xs">배우자수령</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="flagWorkerNet" defaultChecked={employee?.flagWorkerNet} />
              <span className="text-xs">근로자 실질 수령</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 md:grid-cols-6 lg:grid-cols-9">
            <Cell label="입사 월" name="hireMonth" type="number" defaultValue={employee?.hireMonth ?? ""} />
            <Cell label="생일 월" name="birthMonth" type="number" defaultValue={employee?.birthMonth ?? ""} />
            <Cell label="결혼기념월(예정)" name="weddingMonth" type="number" defaultValue={employee?.weddingMonth ?? ""} />
            <Cell label="영유아" name="childrenInfant" type="number" defaultValue={employee?.childrenInfant ?? 0} />
            <Cell label="미취학아동" name="childrenPreschool" type="number" defaultValue={employee?.childrenPreschool ?? 0} />
            <Cell label="청소년" name="childrenTeen" type="number" defaultValue={employee?.childrenTeen ?? 0} />
            <Cell label="부모님" name="parentsCount" type="number" defaultValue={employee?.parentsCount ?? 0} />
            <Cell label="시부모님" name="parentsInLawCount" type="number" defaultValue={employee?.parentsInLawCount ?? 0} />
            <Cell label="급여일" name="payDay" type="number" defaultValue={employee?.payDay ?? ""} />
            <Cell className="md:col-span-2" label="보험료" name="insurancePremium" defaultValue={employee?.insurancePremium?.toString()} />
            <Cell className="md:col-span-2" label="대출이자" name="loanInterest" defaultValue={employee?.loanInterest?.toString()} />
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-[var(--accent)] px-6 py-2 font-medium text-white hover:bg-[var(--accent-dim)]"
      >
        저장
      </button>
    </form>
  );
}
