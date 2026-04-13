"use client";

import { useActionState, useEffect, useId, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { employeePositionSelectValues } from "@/lib/domain/employee-positions";
import type { Employee } from "@/types/models";
import {
  deleteEmployeeFormAction,
  saveEmployeeAction,
  type EmployeeActionState,
} from "@/app/actions/employee";

const fieldLabelClass = "mb-1 block text-xs font-semibold text-[var(--muted)]";

/** 직원 폼 전역: `.input`과 동일 계열(0.8125rem)로 목록·상세 타이포 통일 */
const inputClass = "input w-full min-w-0 text-[0.8125rem] leading-normal text-[var(--text)]";

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
  optional,
  className = "",
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
  optional?: boolean;
  className?: string;
}) {
  const init =
    defaultValue != null && Number.isFinite(Number(defaultValue)) && Number(defaultValue) !== 0
      ? formatWonInput(Number(defaultValue))
      : defaultValue === 0
        ? "0"
        : "";
  const [val, setVal] = useState(init);

  return (
    <div className={`min-w-0 ${className}`}>
      <label className={fieldLabelClass}>{label}</label>
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

function SalaryPairFields({
  defaultBase,
  defaultAdjusted,
  minimumAnnualSalaryWon,
  onSalaryRangeValid,
}: {
  defaultBase?: number | null;
  defaultAdjusted?: number | null;
  minimumAnnualSalaryWon: number;
  onSalaryRangeValid?: (ok: boolean) => void;
}) {
  const baseId = useId();
  const adjId = useId();

  const initBase =
    defaultBase != null && Number.isFinite(Number(defaultBase)) && Number(defaultBase) !== 0
      ? formatWonInput(Number(defaultBase))
      : defaultBase === 0
        ? "0"
        : "";
  const initAdj =
    defaultAdjusted != null &&
    Number.isFinite(Number(defaultAdjusted)) &&
    Number(defaultAdjusted) !== 0
      ? formatWonInput(Number(defaultAdjusted))
      : defaultAdjusted === 0
        ? "0"
        : "";

  const [baseStr, setBaseStr] = useState(initBase);
  const [adjStr, setAdjStr] = useState(initAdj);

  const baseNum = useMemo(() => {
    const d = digitsOnly(baseStr);
    return d ? Number(d) : 0;
  }, [baseStr]);

  const adjNum = useMemo(() => {
    const d = digitsOnly(adjStr);
    return d ? Number(d) : 0;
  }, [adjStr]);

  const adjRangeHint = useMemo(() => {
    if (baseNum <= 0) return null;
    const minA = Math.floor(baseNum * 0.8);
    return `조정급여: ${minA.toLocaleString("ko-KR")}~${baseNum.toLocaleString("ko-KR")}원 (기존의 80~100%). 비우면 기존연봉.`;
  }, [baseNum]);

  const adjRangeError = useMemo(() => {
    if (baseNum <= 0 || adjNum <= 0) return null;
    const minA = Math.floor(baseNum * 0.8);
    if (adjNum < minA || adjNum > baseNum) {
      return `조정급여는 기존의 80~100% (${minA.toLocaleString("ko-KR")}~${baseNum.toLocaleString("ko-KR")}원)`;
    }
    return null;
  }, [baseNum, adjNum]);

  useEffect(() => {
    onSalaryRangeValid?.(!adjRangeError);
  }, [adjRangeError, onSalaryRangeValid]);

  const effectiveAnnual = adjNum > 0 ? adjNum : baseNum;
  const minWageWarning = useMemo(() => {
    if (effectiveAnnual <= 0) return null;
    if (effectiveAnnual < minimumAnnualSalaryWon) {
      return `최저임금(연 환산 약 ${minimumAnnualSalaryWon.toLocaleString("ko-KR")}원) 미만. 확인하세요.`;
    }
    return null;
  }, [effectiveAnnual, minimumAnnualSalaryWon]);

  return (
    <div className="w-full min-w-0 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]/60 p-3">
      <p className="text-xs font-semibold text-[var(--muted)]">기존연봉 · 조정급여 (원)</p>
      <p className="text-xs text-[var(--muted)]">
        조정급여는 기존의 <strong className="text-[var(--text)]">80~100%</strong>만 가능.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label className={fieldLabelClass} htmlFor={baseId}>
            기존연봉 (원)
          </label>
          <input
            id={baseId}
            className={inputClass}
            name="baseSalary"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={baseStr}
            onChange={(e) => {
              const d = digitsOnly(e.target.value);
              if (!d) {
                setBaseStr("");
                return;
              }
              setBaseStr(formatWonInput(Number(d)));
            }}
          />
        </div>
        <div className="min-w-0">
          <label className={fieldLabelClass} htmlFor={adjId}>
            조정급여 (원)
          </label>
          <input
            id={adjId}
            className={inputClass}
            name="adjustedSalary"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={adjStr}
            placeholder="미입력·0 = 기존연봉 적용"
            onChange={(e) => {
              const d = digitsOnly(e.target.value);
              if (!d) {
                setAdjStr("");
                return;
              }
              setAdjStr(formatWonInput(Number(d)));
            }}
          />
        </div>
      </div>
      {adjRangeHint && !adjRangeError ? (
        <p className="text-xs leading-relaxed text-[var(--muted)]">{adjRangeHint}</p>
      ) : null}
      {adjRangeError ? <p className="text-sm font-medium text-[var(--danger)]">{adjRangeError}</p> : null}
      {minWageWarning ? (
        <p className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
          {minWageWarning}
        </p>
      ) : null}
    </div>
  );
}

function Cell({
  label,
  name,
  defaultValue,
  type = "text",
  className = "",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className={fieldLabelClass}>{label}</label>
      <input
        className={inputClass}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    </div>
  );
}

export function EmployeeForm({
  employee,
  activeYear,
  foundingMonth,
  minimumAnnualSalaryWon,
}: {
  employee?: Employee | null;
  activeYear: number;
  foundingMonth: number;
  minimumAnnualSalaryWon: number;
}) {
  const [state, formAction] = useActionState<EmployeeActionState, FormData>(saveEmployeeAction, null);
  const [delState, delFormAction, delPending] = useActionState<EmployeeActionState, FormData>(
    deleteEmployeeFormAction,
    null,
  );
  const router = useRouter();
  const [salaryRangeOk, setSalaryRangeOk] = useState(true);

  useEffect(() => {
    if (delState?.성공) router.push("/dashboard/employees");
  }, [delState?.성공, router]);
  const yy = String(activeYear).slice(-2);
  const isNew = !employee;
  const hasAnyThreeFlag = useMemo(
    () =>
      Boolean(employee?.flagRepReturn) ||
      Boolean(employee?.flagSpouseReceipt) ||
      Boolean(employee?.flagWorkerNet),
    [employee?.flagRepReturn, employee?.flagSpouseReceipt, employee?.flagWorkerNet],
  );
  const [threeFlagsOpen, setThreeFlagsOpen] = useState(() => isNew || hasAnyThreeFlag);
  useEffect(() => {
    if (isNew) {
      setThreeFlagsOpen(true);
      return;
    }
    setThreeFlagsOpen(hasAnyThreeFlag);
  }, [isNew, hasAnyThreeFlag, employee?.id]);
  const openThreeFlags = useCallback(() => setThreeFlagsOpen(true), []);
  const positionOptions = employeePositionSelectValues(employee?.position);
  const positionDefault = (employee?.position ?? "").trim();
  const positionNeedsPlaceholder = !positionDefault;

  return (
    <div className="space-y-4">
    <form action={formAction} className="space-y-4">
      {employee && <input type="hidden" name="id" value={employee.id} />}
      {state?.오류 && (
        <div className="rounded-lg border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm text-[var(--danger)]">
          {state.오류}
        </div>
      )}
      {state?.경고 && (
        <div className="rounded-lg border border-amber-200/90 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
          <strong className="font-semibold">저장됨 · 확인</strong>
          <p className="mt-1">{state.경고}</p>
        </div>
      )}
      {state?.성공 && !state?.경고 ? (
        <div className="rounded-lg border border-[var(--success)] p-3 text-sm text-[var(--success)]">
          저장되었습니다.
        </div>
      ) : null}

      <div className="surface overflow-x-auto p-4 sm:p-5">
        <p className="border-b border-[var(--border)] pb-2 text-base font-semibold tracking-tight text-[var(--text)]">
          &lt;{yy}년 사복 진행 조사표&gt;
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">창립월 {foundingMonth}월.</p>

        <div className="mt-5 space-y-8 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5">
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">기본 정보</h3>
            <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex flex-col gap-1.5 px-3 py-3 sm:flex-row sm:items-baseline sm:gap-6">
                <span className="shrink-0 text-xs font-semibold text-[var(--muted)] sm:w-24">코드</span>
                <div className="min-w-0 text-[0.8125rem] leading-normal text-[var(--text)]">
                  {isNew ? (
                    <span className="text-[var(--muted)]">저장 시 자동 부여. 대표이사는 코드 0.</span>
                  ) : (
                    <span className="font-semibold tabular-nums">{employee!.employeeCode}</span>
                  )}
                </div>
              </div>
              <div className="px-3 py-3">
                <Cell label="이름" name="name" defaultValue={employee?.name} className="max-w-xl" required />
              </div>
              <div className="px-3 py-3">
                <label className={fieldLabelClass}>직급</label>
                <select
                  name="position"
                  className={inputClass}
                  required
                  defaultValue={positionNeedsPlaceholder ? "" : positionDefault}
                >
                  {positionNeedsPlaceholder ? (
                    <option value="" disabled>
                      선택하세요
                    </option>
                  ) : null}
                  {positionOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="px-3 py-3 sm:max-w-[14rem]">
                <label className={fieldLabelClass}>레벨 (1~5)</label>
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
            </div>
          </section>

          <section className="space-y-3 border-t border-[var(--border)] pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">기존·조정 연봉</h3>
            <SalaryPairFields
              defaultBase={employee?.baseSalary}
              defaultAdjusted={employee?.adjustedSalary}
              minimumAnnualSalaryWon={minimumAnnualSalaryWon}
              onSalaryRangeValid={setSalaryRangeOk}
            />
          </section>

          <section className="space-y-3 border-t border-[var(--border)] pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">복지·금액</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <CommaNumberInput
              className="sm:col-span-2"
              label="사복지급분"
              name="welfareAllocation"
              defaultValue={employee?.welfareAllocation}
            />
            <div className="min-w-0">
              <CommaNumberInput
                label="예상 인센(선택)"
                name="incentiveAmount"
                defaultValue={employee?.incentiveAmount ?? undefined}
                optional
              />
              <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
                입력 시 급여포함신고·스케줄의 연간 상한으로 씁니다. 비우면 사복지급분이 상한입니다. 실지급이 상한을 넘으면 초과분은 급여에 포함해 신고합니다.
              </p>
            </div>
            <CommaNumberInput
              className="sm:col-span-2"
              label="알아서금액"
              name="discretionaryAmount"
              defaultValue={employee?.discretionaryAmount ?? undefined}
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

            <div className="space-y-3 border-t border-[var(--border)] pt-4 text-[0.8125rem] leading-normal">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="flagAutoAmount" defaultChecked={employee?.flagAutoAmount} />
                <span className="text-[var(--text)]">알아서 금액(자동)</span>
              </label>
              {threeFlagsOpen ? (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" name="flagRepReturn" defaultChecked={employee?.flagRepReturn} />
                    <span className="text-[var(--text)]">대표반환</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" name="flagSpouseReceipt" defaultChecked={employee?.flagSpouseReceipt} />
                    <span className="text-[var(--text)]">배우자수령</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" name="flagWorkerNet" defaultChecked={employee?.flagWorkerNet} />
                    <span className="text-[var(--text)]">근로자 실질 수령</span>
                  </label>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openThreeFlags}
                  className="text-left text-[0.8125rem] text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  조사표 표시 옵션 추가 — 대표반환 · 배우자수령 · 근로자 실질 수령
                </button>
              )}
            </div>
          </section>

          <section className="space-y-3 border-t border-[var(--border)] pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">일정·가족·보험</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            <Cell label="입사 월" name="hireMonth" type="number" defaultValue={employee?.hireMonth ?? ""} />
            <Cell label="퇴사 월" name="resignMonth" type="number" defaultValue={employee?.resignMonth ?? ""} />
            <Cell label="생일 월" name="birthMonth" type="number" defaultValue={employee?.birthMonth ?? ""} />
            <Cell
              label="결혼기념월(예정)"
              name="weddingMonth"
              type="number"
              defaultValue={employee?.weddingMonth ?? ""}
            />
            <Cell label="영유아" name="childrenInfant" type="number" defaultValue={employee?.childrenInfant ?? 0} />
            <Cell
              label="미취학아동"
              name="childrenPreschool"
              type="number"
              defaultValue={employee?.childrenPreschool ?? 0}
            />
            <Cell label="청소년" name="childrenTeen" type="number" defaultValue={employee?.childrenTeen ?? 0} />
            <Cell label="부모님" name="parentsCount" type="number" defaultValue={employee?.parentsCount ?? 0} />
            <Cell
              label="시부모님"
              name="parentsInLawCount"
              type="number"
              defaultValue={employee?.parentsInLawCount ?? 0}
            />
            <Cell label="급여일" name="payDay" type="number" defaultValue={employee?.payDay ?? ""} />
            <CommaNumberInput
              className="sm:col-span-2"
              label="보험료"
              name="insurancePremium"
              defaultValue={employee?.insurancePremium}
            />
            <CommaNumberInput
              className="sm:col-span-2"
              label="대출이자"
              name="loanInterest"
              defaultValue={employee?.loanInterest}
            />
            </div>
          </section>
        </div>
      </div>

      <button type="submit" className="btn btn-primary px-8 py-2.5">
        저장
      </button>
      {!salaryRangeOk ? (
        <p className="text-sm text-[var(--danger)]">
          조정급여가 기존연봉의 80~100% 범위를 벗어나면 저장 시 서버에서 거절됩니다.
        </p>
      ) : null}
    </form>

    {employee ? (
      <form
        action={delFormAction}
        className="flex flex-wrap items-center gap-4"
        onSubmit={(e) => {
          if (
            !confirm(
              "이 직원을 삭제할까요? 레벨5 오버라이드·분기 설정·월별 노트도 함께 삭제되며 되돌릴 수 없습니다.",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="employeeId" value={employee.id} />
        <button
          type="submit"
          disabled={delPending}
          className="rounded-lg border border-[var(--danger)]/50 bg-transparent px-4 py-2.5 text-sm text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
        >
          {delPending ? "삭제 중…" : "직원 삭제"}
        </button>
      </form>
    ) : null}
    {delState?.오류 ? <p className="text-sm text-[var(--danger)]">{delState.오류}</p> : null}
    </div>
  );
}
