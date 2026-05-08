"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveOptionalWelfareGridAction,
  type OptionalWelfareGridState,
} from "@/app/actions/optional-welfare";
import { CommaWonInput } from "@/components/CommaWonInput";

/**
 * 「선택적 복지」 직원×월 그리드 — `MonthlyEmployeeNote.optionalExtraAmount` 한 필드만 일괄 입력.
 *
 *  - 각 셀은 그 직원·월의 선택적 복지 금액(원). 0 또는 빈값은 「해제」(null) 로 저장.
 *  - 폼 제출 시 hidden `optional_initial_${empId}_${month}` 와 비교해 변경된 셀만 서버로 전송 → 노트의 다른 필드 보존.
 *  - 다른 카테고리(대표반환·배우자수령·알아서금액) 그리드와 동일한 UX 패턴 — sticky 첫 열, 행/열 합계, 권한 없을 시 read-only.
 */

type EmployeeRow = {
  id: string;
  employeeCode: string;
  name: string;
  position: string;
};

type Props = {
  employees: ReadonlyArray<EmployeeRow>;
  /** 활성 연도 — 폼에 hidden 으로 전송 + 헤더 캡션에 사용. */
  activeYear: number;
  /**
   * PB 의 (직원ID → (월문자열 → 원금액)) 매핑. 노트에서 추출한 「현재 저장값」.
   * 키 누락은 0 으로 간주.
   */
  optionalAmounts: Record<string, Partial<Record<string, number>>>;
  /** 선임·관리자만 true. false 면 입력·저장 비활성. */
  canEdit: boolean;
};

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function fmt(n: number): string {
  return Math.round(Math.max(0, n)).toLocaleString("ko-KR");
}

export function OptionalWelfareGridPanel({
  employees,
  activeYear,
  optionalAmounts,
  canEdit,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<OptionalWelfareGridState, FormData>(
    saveOptionalWelfareGridAction,
    null,
  );

  /**
   * 외부 prop(`optionalAmounts`) 의 스냅샷을 클론해 「초기값」으로 보관.
   * 사용자가 셀을 수정하면 표시값만 변하고, 「변경 감지」는 서버에서 hidden initial 과 비교.
   */
  const initialMap = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const e of employees) {
      const row = optionalAmounts[e.id] ?? {};
      const cleaned: Record<string, number> = {};
      for (const m of MONTHS) {
        const v = row[String(m)];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) cleaned[String(m)] = Math.round(v);
      }
      out[e.id] = cleaned;
    }
    return out;
  }, [employees, optionalAmounts]);

  /** 사용자가 입력한 「현재 표시값」 — useState 로 관리해 행 합계 / 전체 합계를 실시간 갱신. */
  const [draft, setDraft] = useState<Record<string, Record<string, number>>>(() => ({ ...initialMap }));

  /** 외부 prop 이 새로 내려오면(연도 전환 / 저장 후 refresh) 동기화. */
  useEffect(() => {
    setDraft({ ...initialMap });
  }, [initialMap]);

  /** 저장 성공 시 router.refresh() — 서버 상태와 client draft 가 일치하도록 prop 다시 받음. */
  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  function setCell(empId: string, month: number, raw: number) {
    const v = Math.max(0, Math.round(Number.isFinite(raw) ? raw : 0));
    setDraft((prev) => {
      const next = { ...prev };
      const row = { ...(next[empId] ?? {}) };
      if (v <= 0) delete row[String(month)];
      else row[String(month)] = v;
      next[empId] = row;
      return next;
    });
  }

  const rowTotal = (empId: string): number => {
    const row = draft[empId] ?? {};
    let s = 0;
    for (const v of Object.values(row)) if (typeof v === "number" && v > 0) s += v;
    return s;
  };

  const monthTotal = (m: number): number => {
    let s = 0;
    for (const e of employees) {
      const v = draft[e.id]?.[String(m)];
      if (typeof v === "number" && v > 0) s += v;
    }
    return s;
  };

  const grandTotal = useMemo(() => {
    let s = 0;
    for (const e of employees) s += rowTotal(e.id);
    return s;
    /** rowTotal 은 draft 의존이라 deps 에 draft 넣음. */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [draft, employees]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--text)]">선택적 복지 — {activeYear}년</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            직원·월 단위로 선택적 복지 금액(원) 을 입력합니다. 0 / 빈칸은 「해당 셀 해제」로 저장되며,
            노트의 다른 필드(메모·인센·오버라이드) 는 건드리지 않습니다. 단일 폼(직원·월 한 건씩) 입력은 아래 「월별 노트 입력」을 그대로 사용 가능.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          <span>
            연 합계{" "}
            <strong className="tabular-nums text-[var(--text)]">{fmt(grandTotal)}</strong>원
          </span>
        </div>
      </div>

      {state?.오류 ? (
        <p className="rounded-md border border-[var(--danger,#fca5a5)] bg-[var(--danger-soft,#fee2e2)] px-3 py-2 text-xs text-[var(--danger,#991b1b)]">
          {state.오류}
        </p>
      ) : null}
      {state?.성공 ? (
        <p className="rounded-md border border-[var(--success,#86efac)] bg-[var(--success-soft,#dcfce7)] px-3 py-2 text-xs text-[var(--success,#166534)]">
          저장되었습니다{state.변경 != null ? ` (${state.변경} 셀 변경)` : ""}.
        </p>
      ) : null}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="activeYear" value={String(activeYear)} />
        {/* 변경 셀 비교용 초기값 hidden — 사용자가 손대지 않은 셀은 서버에서 그대로 skip */}
        {employees.map((e) =>
          MONTHS.map((m) => (
            <input
              key={`init-${e.id}-${m}`}
              type="hidden"
              name={`optional_initial_${e.id}_${m}`}
              value={String(initialMap[e.id]?.[String(m)] ?? 0)}
            />
          )),
        )}

        <div className="surface overflow-hidden">
          {employees.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">
              직원이 등록되어 있지 않습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-max border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)]">
                    <th className="sticky left-0 z-[1] bg-[var(--surface-sunken)] px-2 py-2 text-left text-[var(--muted)] shadow-[2px_0_0_var(--border)]">
                      직원
                    </th>
                    {MONTHS.map((m) => (
                      <th key={m} className="px-1.5 py-2 text-center tabular-nums text-[var(--muted)]">
                        {m}월
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right text-[var(--muted)]">연 합계</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const row = draft[emp.id] ?? {};
                    const total = rowTotal(emp.id);
                    return (
                      <tr key={emp.id} className="border-b border-[var(--border)]/60">
                        <td className="sticky left-0 z-[1] bg-[var(--surface)] px-2 py-1.5 align-middle whitespace-nowrap shadow-[2px_0_0_var(--border)]">
                          <span className="mr-1 font-mono text-[0.65rem] text-[var(--muted)]">
                            {emp.employeeCode}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text)]">{emp.name}</span>
                        </td>
                        {MONTHS.map((m) => {
                          const v = row[String(m)] ?? 0;
                          return (
                            <td key={m} className="px-1 py-1">
                              <CommaWonInput
                                name={`optional_${emp.id}_${m}`}
                                defaultValue={v > 0 ? v : null}
                                placeholder="—"
                                disabled={!canEdit}
                                onUserChange={(n) => setCell(emp.id, m, Number(n) || 0)}
                                className="input w-[6rem] px-2 py-1 text-right text-xs tabular-nums"
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-[var(--text)]">
                          {total > 0 ? fmt(total) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--surface-sunken)]/60 text-[var(--muted)]">
                    <td className="sticky left-0 bg-[var(--surface-sunken)]/60 px-2 py-1.5 text-right text-[0.7rem] shadow-[2px_0_0_var(--border)]">
                      월 합계
                    </td>
                    {MONTHS.map((m) => {
                      const t = monthTotal(m);
                      return (
                        <td key={m} className="px-1 py-1.5 text-center tabular-nums text-[0.7rem]">
                          {t > 0 ? fmt(t) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-[var(--accent)]">
                      {fmt(grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {canEdit ? (
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "저장 중…" : "선택적 복지 저장"}
            </button>
            <span className="text-[0.7rem] text-[var(--muted)]">
              변경된 셀만 노트의 `optionalExtraAmount` 가 갱신됩니다.
            </span>
          </div>
        ) : (
          <p className="text-xs text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
        )}
      </form>
    </section>
  );
}
