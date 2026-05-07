"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { employeePositionSelectValues } from "@/lib/domain/employee-positions";
import type { Employee, LevelTarget, SalaryInclusionVarianceMode } from "@/types/models";
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
    <div className="space-y-1.5">
      <input
        id={inputId}
        className="input w-full max-w-sm min-w-0 text-[0.8125rem] leading-normal text-[var(--text)]"
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

const fieldLabelClass = "dash-field-label !mb-1";

/** 직원 폼 전역: 폭 과대 입력칸 방지 — 단일 입력은 24rem 까지만 늘어남. */
const inputClass = "input w-full max-w-sm min-w-0 text-[0.8125rem] leading-normal text-[var(--text)]";
/** 자녀 수·월 등 짧은 숫자 입력 — 6em 고정. */
const numCellClass = "input w-24 min-w-0 text-[0.8125rem] leading-normal text-[var(--text)]";

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
  hint,
  onUserChange,
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
  optional?: boolean;
  className?: string;
  hint?: ReactNode;
  onUserChange?: (value: number) => void;
}) {
  const inputId = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      {label ? (
        <label className={fieldLabelClass} htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <CommaWonInput
        id={inputId}
        name={name}
        defaultValue={defaultValue ?? null}
        className={inputClass}
        placeholder={optional ? "0" : "0"}
        onUserChange={onUserChange}
      />
      {hint ? (
        <p className="mt-1 text-[0.7rem] leading-snug text-[var(--muted)]">{hint}</p>
      ) : null}
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
    <div className="w-full min-w-0 space-y-1.5">
      <div className="grid gap-2 sm:grid-cols-2 sm:max-w-md">
        <div className="min-w-0">
          <label className={fieldLabelClass} htmlFor={baseId}>
            기존연봉
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
            조정급여
          </label>
          <input
            id={adjId}
            className={inputClass}
            name="adjustedSalary"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={adjStr}
            placeholder="0 = 기존연봉"
            onChange={(e) => {
              const d = digitsOnly(e.target.value);
              setAdjStr(d ? formatWon(Number(d)) : "");
            }}
          />
        </div>
      </div>
      {adjRangeHint && !adjRangeError ? (
        <p className="text-[11px] leading-snug text-[var(--muted)]">{adjRangeHint}</p>
      ) : null}
      {adjRangeError ? <p className="text-xs font-medium text-[var(--danger)]">{adjRangeError}</p> : null}
      {minWageWarning ? (
        <p className="text-[11px] leading-snug text-[var(--warn)]">⚠ {minWageWarning}</p>
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
  /** 숫자(월·인원)는 6em 고정 폭, 그 외 텍스트는 그리드 셀 폭 따라감 */
  const cls = type === "number" ? numCellClass : inputClass;
  return (
    <div className={`min-w-0 ${className}`}>
      <label className={fieldLabelClass} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={cls}
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
  levelTargets = [],
  defaultEditorOpen,
}: {
  employee?: Employee | null;
  activeYear: number;
  foundingMonth: number;
  minimumAnnualSalaryWon: number;
  /** 기존 직원이어도 폼을 즉시 열어 둘지. 인라인 편집 등에서 사용. 기본값: !employee */
  defaultEditorOpen?: boolean;
  /** 전사 기본 급여포함신고 표시 방식 — 직원이 비우면 동일 적용 */
  tenantSalaryInclusionVarianceMode: SalaryInclusionVarianceMode;
  /** 전사 설정 — 꺼지면 해당 체크는 폼에 없고 저장 시 DB 값 유지 */
  surveyShowRepReturn?: boolean;
  surveyShowSpouseReceipt?: boolean;
  surveyShowWorkerNet?: boolean;
  /** 동명이인 즉시 안내용 — 페이지에서 조회한 같은 업체 직원 목록(이름·코드·직급만 필요) */
  existingEmployees?: EmployeeSimpleRow[];
  /**
   * 레벨별 연간 사복 목표액(현재 활성 연도 기준).
   * 사용자가 ‘사복지급분’ 칸을 비워 두면 선택한 레벨의 목표액으로 자동 채워진다.
   */
  levelTargets?: LevelTarget[];
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
  const [editorOpen, setEditorOpen] = useState(defaultEditorOpen ?? !employee);

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

  /**
   * 레벨을 컨트롤드 상태로 둬야 ‘레벨 변경 → 사복지급분 자동 채움’이 즉시 반영된다.
   * 빈 문자열 상태(사용자가 잠시 지운 경우)도 허용한다.
   */
  const [levelStr, setLevelStr] = useState<string>(String(employee?.level ?? 3));
  const currentLevel = (() => {
    const n = Number(levelStr);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
  })();

  /**
   * 레벨별 연간 목표액(원). 활성 연도(`activeYear`) 기준만 받는다고 전제.
   * 페이지에서 다른 연도가 섞여 들어와도 활성 연도만 채택해 안전망을 둔다.
   */
  const targetByLevel = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of levelTargets) {
      if (t.year !== activeYear) continue;
      const amt = Number(t.targetAmount);
      if (!Number.isFinite(amt)) continue;
      m.set(Math.round(Number(t.level)), Math.max(0, Math.round(amt)));
    }
    return m;
  }, [levelTargets, activeYear]);

  /**
   * “사용자가 사복지급분 칸을 직접 손댔는가” 추적.
   * 기존 직원이 이미 0보다 큰 값을 가지고 있으면 손댄 것으로 간주(자동 덮어쓰기 방지).
   * 한 번이라도 사용자가 키보드로 입력하면 true가 되어 이후 레벨 변경에도 자동 채움이 비활성화된다.
   */
  const [welfareTouched, setWelfareTouched] = useState<boolean>(
    () => (employee?.welfareAllocation ?? 0) > 0,
  );

  const welfareAutoFromLevel =
    currentLevel != null ? (targetByLevel.get(currentLevel) ?? 0) : 0;

  /** 폼에 실제로 채울 값: 사용자가 손대지 않았으면 레벨 목표, 그 외엔 기존 값. */
  const welfareDefaultValue = welfareTouched
    ? (employee?.welfareAllocation ?? null)
    : welfareAutoFromLevel;

  const welfareHint = (() => {
    if (welfareTouched) return null;
    if (currentLevel == null) return null;
    if (targetByLevel.size === 0) return null;
    if (welfareAutoFromLevel <= 0) {
      return (
        <>
          레벨 {currentLevel} 연간 목표액이 설정되어 있지 않습니다 — 자동 채움 없음.
        </>
      );
    }
    return (
      <>
        레벨 {currentLevel} 연간 목표액(
        <span className="font-mono tabular-nums text-[var(--text)]">
          {formatWon(welfareAutoFromLevel)}원
        </span>
        )에서 자동 입력. 직접 입력하면 그 값이 우선합니다.
      </>
    );
  })();

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

      {/* ── 콤팩트 테이블 폼 ── */}
      <div className="form-compact overflow-hidden rounded-lg border border-[var(--border)]">

        {/* 기본 정보 */}
        <div className="form-section-header">기본 정보</div>
        <table className="w-full border-collapse bg-[var(--surface)] text-sm">
          <colgroup><col className="w-[22%] sm:w-[18%]" /><col /></colgroup>
          <tbody>
            <tr>
              <th>코드</th>
              <td className="text-xs text-[var(--muted)]">
                {isNew ? "저장 시 자동 부여 (대표이사 → 0)" : <span className="font-mono font-semibold text-[var(--text)]">{employee!.employeeCode}</span>}
              </td>
            </tr>
            <tr>
              <th>이름 <span className="text-[var(--danger)]">*</span></th>
              <td><NameFieldWithDuplicateCheck inputId={nameId} defaultValue={employee?.name ?? ""} selfId={employee?.id ?? null} existing={existingEmployees} /></td>
            </tr>
            <tr>
              <th>직급 <span className="text-[var(--danger)]">*</span></th>
              <td>
                <select id={positionId} name="position" className={inputClass} required defaultValue={positionNeedsPlaceholder ? "" : positionDefault}>
                  {positionNeedsPlaceholder ? <option value="" disabled>선택하세요</option> : null}
                  {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </td>
            </tr>
            <tr>
              <th>레벨 <span className="text-[var(--danger)]">*</span></th>
              <td>
                <input id={levelId} className={numCellClass} name="level" type="number" min={1} max={5} value={levelStr} onChange={(e) => setLevelStr(e.target.value)} required />
              </td>
            </tr>
          </tbody>
        </table>

        {/* 급여·복지 */}
        <div className="form-section-header">급여 · 복지</div>
        <table className="w-full border-collapse bg-[var(--surface)] text-sm">
          <colgroup><col className="w-[22%] sm:w-[18%]" /><col /></colgroup>
          <tbody>
            <tr>
              <th>기존연봉 / 조정급여</th>
              <td>
                <SalaryPairFields key={`salary-${employee?.baseSalary ?? 0}-${employee?.adjustedSalary ?? 0}`} defaultBase={employee?.baseSalary} defaultAdjusted={employee?.adjustedSalary} minimumAnnualSalaryWon={minimumAnnualSalaryWon} onSalaryRangeValid={setSalaryRangeOk} />
              </td>
            </tr>
            <tr>
              <th>사복지급분</th>
              <td><LabeledCommaWon name="welfareAllocation" label="" defaultValue={welfareDefaultValue} onUserChange={() => { if (!welfareTouched) setWelfareTouched(true); }} hint={welfareHint} /></td>
            </tr>
            <tr>
              <th>예상 인센</th>
              <td><LabeledCommaWon name="incentiveAmount" label="" defaultValue={employee?.incentiveAmount ?? undefined} optional /></td>
            </tr>
            <tr>
              <th>알아서금액</th>
              <td><LabeledCommaWon name="discretionaryAmount" label="" defaultValue={employee?.discretionaryAmount ?? undefined} optional /></td>
            </tr>
            <tr>
              <th>전기 더받은<br/>사복(차감)</th>
              <td><LabeledCommaWon name="priorOverpaidWelfareWon" label="" defaultValue={employee?.priorOverpaidWelfareWon ?? undefined} optional /></td>
            </tr>
            <tr>
              <th>월·분기 지급</th>
              <td>
                <div className="flex flex-wrap gap-3">
                  <LabeledCommaWon name="monthlyPayAmount" label="월" defaultValue={employee?.monthlyPayAmount ?? undefined} optional />
                  <LabeledCommaWon name="quarterlyPayAmount" label="분기" defaultValue={employee?.quarterlyPayAmount ?? undefined} optional />
                </div>
              </td>
            </tr>
            <tr>
              <th>연간 지급 예정</th>
              <td><LabeledCommaWon name="expectedYearlyWelfare" label="" defaultValue={employee?.expectedYearlyWelfare ?? undefined} optional /></td>
            </tr>
            <tr>
              <th>급여포함<br/>신고 표시</th>
              <td>
                <select id={varianceModeId} name="salaryInclusionVarianceMode" className={inputClass} defaultValue={employee?.salaryInclusionVarianceMode ?? ""}>
                  <option value="">전사 기본</option>
                  {SALARY_INCLUSION_VARIANCE_MODES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </td>
            </tr>
            <tr>
              <th>플래그</th>
              <td>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8125rem]">
                  <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" name="flagAutoAmount" defaultChecked={employee?.flagAutoAmount} />알아서금액(자동)</label>
                  {surveyShowRepReturn && <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" name="flagRepReturn" defaultChecked={employee?.flagRepReturn} />대표반환</label>}
                  {surveyShowSpouseReceipt && <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" name="flagSpouseReceipt" defaultChecked={employee?.flagSpouseReceipt} />배우자수령</label>}
                  {surveyShowWorkerNet && <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" name="flagWorkerNet" defaultChecked={employee?.flagWorkerNet} />근로자 실질수령</label>}
                  <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" name="flagWelfareIneligible" defaultChecked={employee?.flagWelfareIneligible ?? false} />사복 미대상</label>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 일정·가족·공제 */}
        <div className="form-section-header">일정 · 가족 · 공제</div>
        <table className="w-full border-collapse bg-[var(--surface)] text-sm">
          <colgroup><col className="w-[22%] sm:w-[18%]" /><col /></colgroup>
          <tbody>
            <tr>
              <th>입사월 / 급여일</th>
              <td>
                <div className="flex flex-wrap gap-3">
                  <Cell label="입사월" name="hireMonth" type="number" defaultValue={employee?.hireMonth ?? ""} />
                  <Cell label="급여일" name="payDay" type="number" defaultValue={employee?.payDay ?? ""} />
                </div>
              </td>
            </tr>
            <tr>
              <th>퇴사</th>
              <td>
                <div className="flex flex-wrap items-end gap-3">
                  <Cell label="연도" name="resignYear" type="number" defaultValue={employee?.resignYear ?? ""} />
                  <Cell label="월" name="resignMonth" type="number" defaultValue={employee?.resignMonth ?? ""} />
                  <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs">
                    <input type="checkbox" name="flagPayWelfareOnResignMonth" defaultChecked={employee?.flagPayWelfareOnResignMonth ?? false} />
                    퇴사월 사복 지급
                  </label>
                </div>
              </td>
            </tr>
            <tr>
              <th>생일·결혼월</th>
              <td>
                <div className="flex flex-wrap gap-3">
                  <Cell label="생일월" name="birthMonth" type="number" defaultValue={employee?.birthMonth ?? ""} />
                  <Cell label="결혼기념월" name="weddingMonth" type="number" defaultValue={employee?.weddingMonth ?? ""} />
                </div>
              </td>
            </tr>
            <tr>
              <th>자녀 수</th>
              <td>
                <div className="flex flex-wrap gap-3">
                  <Cell label="영유아" name="childrenInfant" type="number" defaultValue={employee?.childrenInfant ?? 0} />
                  <Cell label="미취학" name="childrenPreschool" type="number" defaultValue={employee?.childrenPreschool ?? 0} />
                  <Cell label="청소년" name="childrenTeen" type="number" defaultValue={employee?.childrenTeen ?? 0} />
                </div>
              </td>
            </tr>
            <tr>
              <th>부모 수</th>
              <td>
                <div className="flex flex-wrap gap-3">
                  <Cell label="부모님" name="parentsCount" type="number" defaultValue={employee?.parentsCount ?? 0} />
                  <Cell label="시부모님" name="parentsInLawCount" type="number" defaultValue={employee?.parentsInLawCount ?? 0} />
                </div>
              </td>
            </tr>
            <tr>
              <th>공제 발생액</th>
              <td>
                <div className="flex flex-wrap gap-3">
                  <LabeledCommaWon name="insurancePremium" label="보험료" defaultValue={employee?.insurancePremium} />
                  <LabeledCommaWon name="loanInterest" label="대출이자" defaultValue={employee?.loanInterest} />
                  <LabeledCommaWon name="monthlyRentAmount" label="월세(월)" defaultValue={employee?.monthlyRentAmount ?? undefined} optional />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
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
