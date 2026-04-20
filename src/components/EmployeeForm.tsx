"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { employeePositionSelectValues } from "@/lib/domain/employee-positions";
import type { Employee, SalaryInclusionVarianceMode } from "@/types/models";
import { SALARY_INCLUSION_VARIANCE_MODES } from "@/lib/domain/salary-inclusion-display";
import {
  deleteEmployeeFormAction,
  saveEmployeeAction,
  type EmployeeActionState,
} from "@/app/actions/employee";
import { CommaWonInput } from "@/components/CommaWonInput";
import { digitsOnly, formatWon } from "@/lib/util/number";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { Alert } from "@/components/ui/Alert";

/** 동명이인 검출용 — 페이지에서 이미 조회한 직원 목록 일부만 넘긴다(직렬화 비용 최소화). */
export type EmployeeSimpleRow = {
  id: string;
  employeeCode: string;
  name: string;
  position: string;
};

/** 이름 입력 + 같은 이름 직원 즉시 안내 */
function NameFieldWithDuplicateCheck({
  inputId,
  defaultValue,
  selfId,
  existing,
}: {
  inputId: string;
  defaultValue: string;
  /** 수정 모드일 때 자기 자신은 동명이인 비교에서 제외 */
  selfId: string | null;
  existing: EmployeeSimpleRow[];
}) {
  const [name, setName] = useState(defaultValue ?? "");

  const matches = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return [];
    return existing.filter(
      (row) => row.id !== selfId && row.name.trim() === trimmed,
    );
  }, [name, selfId, existing]);

  return (
    <div className="space-y-2">
      <input
        id={inputId}
        className="input w-full max-w-xl min-w-0 text-[0.8125rem] leading-normal text-[var(--text)]"
        name="name"
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
      />
      {matches.length > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-[color:color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[var(--warn-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--warn)]"
        >
          <p className="font-semibold">이미 같은 이름의 직원이 등록돼 있습니다.</p>
          <ul className="mt-1 space-y-0.5">
            {matches.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[0.7rem] tabular-nums text-[var(--muted)]">
                  코드 {row.employeeCode}
                </span>
                <span className="font-semibold text-[var(--text)]">{row.name}</span>
                {row.position ? (
                  <span className="text-[var(--muted)]">({row.position})</span>
                ) : null}
                <Link
                  href={`/dashboard/employees/${row.id}`}
                  className="ml-auto text-[var(--accent)] hover:underline"
                >
                  상세 보기 →
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[var(--muted)]">
            동명이인이라면 그대로 저장해도 됩니다. 같은 사람을 다시 등록하려는 거라면 위 직원을 수정해 주세요.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const fieldLabelClass = "dash-field-label";

/** 직원 폼 전역: `.input`과 동일 계열(0.8125rem)로 목록·상세 타이포 통일 */
const inputClass = "input w-full min-w-0 text-[0.8125rem] leading-normal text-[var(--text)]";

/**
 * 라벨 + 공통 `CommaWonInput` 으로 묶은 Wrapper.
 * `htmlFor`-`id` 연결로 스크린리더·클릭 영역을 제대로 만들어 준다.
 */
/** 입력 초기값을 폼 표시 문자열로. 0 은 "0", 미정은 "" 로 구분(기존 UX 유지). */
function formatInitialWon(v: number | null | undefined): string {
  if (v == null) return "";
  if (!Number.isFinite(Number(v))) return "";
  if (Number(v) === 0) return "0";
  return formatWon(v);
}

function LabeledCommaWon({
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
  const inputId = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label className={fieldLabelClass} htmlFor={inputId}>
        {label}
      </label>
      <CommaWonInput
        id={inputId}
        name={name}
        defaultValue={defaultValue ?? null}
        className={inputClass}
        placeholder={optional ? "(선택)" : undefined}
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

  const initBase = formatInitialWon(defaultBase);
  const initAdj = formatInitialWon(defaultAdjusted);

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
    return `조정급여: ${formatWon(minA)}~${formatWon(baseNum)}원 (기존의 80~100%). 비우면 기존연봉.`;
  }, [baseNum]);

  const adjRangeError = useMemo(() => {
    if (baseNum <= 0 || adjNum <= 0) return null;
    const minA = Math.floor(baseNum * 0.8);
    if (adjNum < minA || adjNum > baseNum) {
      return `조정급여는 기존의 80~100% (${formatWon(minA)}~${formatWon(baseNum)}원)`;
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
      return `최저임금(연 환산 약 ${formatWon(minimumAnnualSalaryWon)}원) 미만. 확인하세요.`;
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
              setBaseStr(d ? formatWon(Number(d)) : "");
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
              setAdjStr(d ? formatWon(Number(d)) : "");
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
  const inputId = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label className={fieldLabelClass} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
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
  tenantSalaryInclusionVarianceMode,
  surveyShowRepReturn = false,
  surveyShowSpouseReceipt = false,
  surveyShowWorkerNet = false,
  existingEmployees = [],
}: {
  employee?: Employee | null;
  activeYear: number;
  foundingMonth: number;
  minimumAnnualSalaryWon: number;
  /** 전사 기본 급여포함신고 표시 방식 — 직원이 비우면 동일 적용 */
  tenantSalaryInclusionVarianceMode: SalaryInclusionVarianceMode;
  /** 전사 설정 — 꺼지면 해당 체크는 폼에 없고 저장 시 DB 값 유지 */
  surveyShowRepReturn?: boolean;
  surveyShowSpouseReceipt?: boolean;
  surveyShowWorkerNet?: boolean;
  /** 동명이인 즉시 안내용 — 페이지에서 조회한 같은 업체 직원 목록(이름·코드·직급만 필요) */
  existingEmployees?: EmployeeSimpleRow[];
}) {
  const [state, formAction, savePending] = useActionState<EmployeeActionState, FormData>(
    saveEmployeeAction,
    null,
  );
  const [delState, delFormAction, delPending] = useActionState<EmployeeActionState, FormData>(
    deleteEmployeeFormAction,
    null,
  );
  const router = useRouter();
  const [salaryRangeOk, setSalaryRangeOk] = useState(true);
  const isNew = !employee;
  const [editorOpen, setEditorOpen] = useState(!employee);

  useEffect(() => {
    if (delState?.성공) router.push("/dashboard/employees");
  }, [delState?.성공, router]);

  useEffect(() => {
    if (!state?.성공) return;
    if (isNew) {
      const t = setTimeout(() => {
        router.push("/dashboard/employees");
      }, 900);
      return () => clearTimeout(t);
    }
    setEditorOpen(false);
    router.refresh();
  }, [state?.성공, isNew, router]);
  const yy = String(activeYear).slice(-2);
  const positionOptions = employeePositionSelectValues(employee?.position);
  const positionDefault = (employee?.position ?? "").trim();
  const positionNeedsPlaceholder = !positionDefault;
  const positionId = useId();
  const nameId = useId();
  const levelId = useId();
  const varianceModeId = useId();

  useEffect(() => {
    if (state?.오류) setEditorOpen(true);
  }, [state?.오류]);

  const showEditor = !employee || editorOpen;

  return (
    <div className="space-y-4">
    {state?.오류 ? (
      <Alert tone="danger" assertive>
        {state.오류}
      </Alert>
    ) : null}
    {state?.성공 ? (
      <Alert tone="success">
        저장되었습니다.
        {isNew ? (
          <p className="mt-1 text-xs font-normal text-[var(--muted)]">잠시 후 직원 목록으로 이동합니다.</p>
        ) : null}
      </Alert>
    ) : null}
    {state?.경고 ? (
      <Alert tone="warn" title="확인">
        {state.경고}
      </Alert>
    ) : null}

    {employee && !showEditor ? (
      <div className="surface dash-panel-pad">
        <p className="text-sm font-semibold text-[var(--text)]">등록 정보 요약</p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">코드</dt>
            <dd className="mt-1 tabular-nums font-medium text-[var(--text)]">{employee.employeeCode}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">이름</dt>
            <dd className="mt-1 font-medium text-[var(--text)]">{employee.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">직급</dt>
            <dd className="mt-1 text-[var(--text)]">{employee.position}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">레벨</dt>
            <dd className="mt-1 tabular-nums">{employee.level}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">급여포함신고 표시</dt>
            <dd className="mt-1 text-[var(--text)]">
              {employee.salaryInclusionVarianceMode == null ? (
                <>
                  전사와 동일{" "}
                  <span className="text-[var(--muted)]">
                    (
                    {SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === tenantSalaryInclusionVarianceMode)?.label}
                    )
                  </span>
                </>
              ) : (
                SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === employee.salaryInclusionVarianceMode)?.label
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">기존연봉</dt>
            <dd className="mt-1 tabular-nums">{formatWon(employee.baseSalary)}원</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">조정급여</dt>
            <dd className="mt-1 tabular-nums">
              {employee.adjustedSalary > 0 ? `${formatWon(employee.adjustedSalary)}원` : "—"}
            </dd>
          </div>
          {employee.priorOverpaidWelfareWon != null && employee.priorOverpaidWelfareWon > 0 ? (
            <div>
              <dt className="text-xs font-semibold text-[var(--muted)]">실효 사복지급분</dt>
              <dd className="mt-1 tabular-nums">
                {formatWon(Math.max(0, employee.welfareAllocation - employee.priorOverpaidWelfareWon))}원{" "}
                <span className="text-xs text-[var(--muted)]">
                  (사복 {formatWon(employee.welfareAllocation)} − 전기 {formatWon(employee.priorOverpaidWelfareWon)})
                </span>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">입사월</dt>
            <dd className="mt-1 tabular-nums">{employee.hireMonth != null ? `${employee.hireMonth}월` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">퇴사</dt>
            <dd className="mt-1 tabular-nums">
              {employee.resignYear != null
                ? `${employee.resignYear}년${employee.resignMonth != null ? ` ${employee.resignMonth}월` : ""}`
                : "재직 중"}
            </dd>
          </div>
        </dl>
        <button type="button" className="btn btn-primary mt-5 text-sm" onClick={() => setEditorOpen(true)}>
          정보 수정·삭제
        </button>
      </div>
    ) : null}

    <form
      action={formAction}
      className={`space-y-4 ${showEditor ? "" : "hidden"}`}
      aria-hidden={!showEditor}
      aria-busy={savePending}
    >
      {employee && <input type="hidden" name="id" value={employee.id} />}
      {employee && showEditor ? (
        <button
          type="button"
          className="btn btn-outline text-xs"
          onClick={() => setEditorOpen(false)}
        >
          요약만 보기
        </button>
      ) : null}

      <div className="surface overflow-x-auto dash-panel-pad">
        <p className="border-b border-[var(--border)] pb-2 text-base font-semibold tracking-normal text-[var(--text)]">
          &lt;{yy}년 사복 진행 조사표&gt;
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">창립월 {foundingMonth}월.</p>

        <div className="mt-5 space-y-8 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5">
          <section className="space-y-3">
            <h3 className="dash-form-section-title">기본 정보</h3>
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
                <label className={fieldLabelClass} htmlFor={nameId}>
                  이름
                </label>
                <NameFieldWithDuplicateCheck
                  inputId={nameId}
                  defaultValue={employee?.name ?? ""}
                  selfId={employee?.id ?? null}
                  existing={existingEmployees}
                />
              </div>
              <div className="px-3 py-3">
                <label className={fieldLabelClass} htmlFor={positionId}>
                  직급
                </label>
                <select
                  id={positionId}
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
                <label className={fieldLabelClass} htmlFor={levelId}>
                  레벨 (1~5)
                </label>
                <input
                  id={levelId}
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
            <h3 className="dash-form-section-title">기존·조정 연봉</h3>
            <SalaryPairFields
              defaultBase={employee?.baseSalary}
              defaultAdjusted={employee?.adjustedSalary}
              minimumAnnualSalaryWon={minimumAnnualSalaryWon}
              onSalaryRangeValid={setSalaryRangeOk}
            />
          </section>

          <section className="space-y-3 border-t border-[var(--border)] pt-6">
            <h3 className="dash-form-section-title">복지·금액</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <LabeledCommaWon
              className="sm:col-span-2"
              label="사복지급분"
              name="welfareAllocation"
              defaultValue={employee?.welfareAllocation}
            />
            <div className="min-w-0">
              <LabeledCommaWon
                label="예상 인센(선택)"
                name="incentiveAmount"
                defaultValue={employee?.incentiveAmount ?? undefined}
                optional
              />
            </div>
            <LabeledCommaWon
              className="sm:col-span-2"
              label="알아서금액"
              name="discretionaryAmount"
              defaultValue={employee?.discretionaryAmount ?? undefined}
              optional
            />
            <LabeledCommaWon
              className="sm:col-span-2"
              label="전기 더 받은 사복(차감)"
              name="priorOverpaidWelfareWon"
              defaultValue={employee?.priorOverpaidWelfareWon ?? undefined}
              optional
            />
            <LabeledCommaWon
              label="월지급"
              name="monthlyPayAmount"
              defaultValue={employee?.monthlyPayAmount ?? undefined}
              optional
            />
            <LabeledCommaWon
              label="분기지급"
              name="quarterlyPayAmount"
              defaultValue={employee?.quarterlyPayAmount ?? undefined}
              optional
            />
            <LabeledCommaWon
              className="sm:col-span-2"
              label="연간 지급 예정액(스케줄·레벨 추천)"
              name="expectedYearlyWelfare"
              defaultValue={employee?.expectedYearlyWelfare ?? undefined}
              optional
            />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--border)] pt-4 text-[0.8125rem] leading-normal">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="flagAutoAmount" defaultChecked={employee?.flagAutoAmount} />
                <span className="whitespace-nowrap text-[var(--text)]">알아서 금액(자동)</span>
              </label>
              {surveyShowRepReturn ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" name="flagRepReturn" defaultChecked={employee?.flagRepReturn} />
                  <span className="whitespace-nowrap text-[var(--text)]">대표반환</span>
                </label>
              ) : null}
              {surveyShowSpouseReceipt ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" name="flagSpouseReceipt" defaultChecked={employee?.flagSpouseReceipt} />
                  <span className="whitespace-nowrap text-[var(--text)]">배우자수령</span>
                </label>
              ) : null}
              {surveyShowWorkerNet ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" name="flagWorkerNet" defaultChecked={employee?.flagWorkerNet} />
                  <span className="whitespace-nowrap text-[var(--text)]">근로자 실질 수령</span>
                </label>
              ) : null}
            </div>
            {!surveyShowRepReturn && !surveyShowSpouseReceipt && !surveyShowWorkerNet ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                조사표 플래그는 <strong className="text-[var(--text)]">전사 설정</strong>에서 켠 뒤 여기서 표시됩니다.
              </p>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-[var(--border)] pt-6">
            <h3 className="dash-form-section-title">급여포함신고</h3>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              월별 스케줄·<strong className="text-[var(--text)]">급여포함신고</strong> 화면에서 상한 대비{" "}
              <strong className="text-[var(--text)]">초과·미달</strong> 숫자를 어떻게 보일지 정합니다. 비우면 전사
              기본(
              {SALARY_INCLUSION_VARIANCE_MODES.find((x) => x.value === tenantSalaryInclusionVarianceMode)?.label})과
              동일합니다.
            </p>
            <div className="max-w-md">
              <label className={fieldLabelClass} htmlFor={varianceModeId}>
                표시 방식
              </label>
              <select
                id={varianceModeId}
                name="salaryInclusionVarianceMode"
                className={inputClass}
                defaultValue={employee?.salaryInclusionVarianceMode ?? ""}
              >
                <option value="">전사 설정과 동일</option>
                {SALARY_INCLUSION_VARIANCE_MODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="space-y-3 border-t border-[var(--border)] pt-6">
            <h3 className="dash-form-section-title">일정·가족·보험</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            <Cell label="입사 월" name="hireMonth" type="number" defaultValue={employee?.hireMonth ?? ""} />
            <Cell label="퇴사 연도" name="resignYear" type="number" defaultValue={employee?.resignYear ?? ""} />
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
            <LabeledCommaWon
              className="sm:col-span-2"
              label="보험료(발생)"
              name="insurancePremium"
              defaultValue={employee?.insurancePremium}
            />
            <LabeledCommaWon
              className="sm:col-span-2"
              label="대출이자(발생)"
              name="loanInterest"
              defaultValue={employee?.loanInterest}
            />
            <LabeledCommaWon
              className="sm:col-span-2"
              label="월세(발생·월)"
              name="monthlyRentAmount"
              defaultValue={employee?.monthlyRentAmount ?? undefined}
              optional
            />
            </div>
          </section>
        </div>
      </div>

      <button
        type="submit"
        disabled={savePending}
        className="btn btn-primary px-8 py-2.5 disabled:opacity-60"
      >
        {savePending ? "저장 중…" : "저장"}
      </button>
      {!salaryRangeOk ? (
        <p className="text-xs text-[var(--warn)]" role="status">
          참고: 조정급여가 기존연봉의 80~100% 범위를 벗어났습니다. 그대로 저장됩니다 — 의도된 입력인지만 확인하세요.
        </p>
      ) : null}
    </form>

    {employee && showEditor ? (
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
    {delState?.오류 ? <Alert tone="danger" assertive>{delState.오류}</Alert> : null}

    <LoadingOverlay visible={savePending} label="저장 중입니다…" hint="잠시만 기다려 주세요." />
    </div>
  );
}
