"use client";

import { useActionState, useId, useState } from "react";
import type { Employee } from "@/types/models";
import { saveEmployeeAction, type EmployeeActionState } from "@/app/actions/employee";
import { SALARY_PRESET_WON } from "@/lib/salary-presets";

const inputClass =
  "neu-field mt-0.5 min-w-[5.5rem] px-2 py-1.5 text-sm text-[var(--text)]";

function formatWonInput(n: number): string {
  return n.toLocaleString("ko-KR");
}

function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, "");
}

function CommaNumberInput({
  name,
  label,
  defaultValue,
  presetOptions,
  optional,
  className = "",
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
  presetOptions?: readonly number[];
  optional?: boolean;
  className?: string;
}) {
  const selectId = useId();
  const init =
    defaultValue != null && Number.isFinite(Number(defaultValue)) && Number(defaultValue) !== 0
      ? formatWonInput(Number(defaultValue))
      : defaultValue === 0
        ? "0"
        : "";
  const [val, setVal] = useState(init);

  return (
    <div className={className}>
      <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</label>
      {presetOptions && presetOptions.length > 0 && (
        <select
          id={selectId}
          className={`${inputClass} mb-1`}
          aria-label={`${label} 빠른 선택`}
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) setVal(formatWonInput(Number(v)));
            e.currentTarget.selectedIndex = 0;
          }}
        >
          <option value="">빠른 선택…</option>
          {presetOptions.map((n) => (
            <option key={n} value={n}>
              {formatWonInput(n)}원
            </option>
          ))}
        </select>
      )}
      <input
        className={inputClass}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={val}
        placeholder={optional ? "(선택)" : undefined}
        onChange={(e) => {
          const d = digitsOnly(e.target.value);
          if (!d) {
            setVal("");
            return;
          }
          setVal(formatWonInput(Number(d)));
        }}
      />
    </div>
  );
}

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
  const isNew = !employee;

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
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">CODE</label>
              {isNew ? (
                <p className={`${inputClass} text-[var(--muted)] leading-relaxed`}>
                  자동 부여 · 직급이 &quot;대표이사&quot;면 0번
                </p>
              ) : (
                <p className={`${inputClass} font-mono`}>{employee!.employeeCode}</p>
              )}
            </div>
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
            <CommaNumberInput
              label="기존연봉"
              name="baseSalary"
              defaultValue={employee?.baseSalary}
              presetOptions={SALARY_PRESET_WON}
            />
            <CommaNumberInput
              label="조정급여"
              name="adjustedSalary"
              defaultValue={employee?.adjustedSalary}
              presetOptions={SALARY_PRESET_WON}
            />
            <CommaNumberInput
              className="lg:col-span-2"
              label="사복지급분"
              name="welfareAllocation"
              defaultValue={employee?.welfareAllocation}
            />
            <CommaNumberInput
              label="인센티브(선택)"
              name="incentiveAmount"
              defaultValue={employee?.incentiveAmount ?? undefined}
              optional
            />
            <CommaNumberInput
              className="lg:col-span-2"
              label="알아서금액"
              name="discretionaryAmount"
              defaultValue={employee?.discretionaryAmount ?? undefined}
              optional
            />
            <CommaNumberInput
              label="선택복지금액"
              name="optionalWelfareAmount"
              defaultValue={employee?.optionalWelfareAmount ?? undefined}
              optional
            />
            <CommaNumberInput
              label="월지급"
              name="monthlyPayAmount"
              defaultValue={employee?.monthlyPayAmount ?? undefined}
              optional
            />
            <CommaNumberInput
              label="분기지급"
              name="quarterlyPayAmount"
              defaultValue={employee?.quarterlyPayAmount ?? undefined}
              optional
            />
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
            <CommaNumberInput
              className="md:col-span-2"
              label="보험료"
              name="insurancePremium"
              defaultValue={employee?.insurancePremium}
            />
            <CommaNumberInput
              className="md:col-span-2"
              label="대출이자"
              name="loanInterest"
              defaultValue={employee?.loanInterest}
            />
          </div>
        </div>
      </div>

      <button type="submit" className="btn btn-primary px-8 py-2.5">
        저장
      </button>
    </form>
  );
}
