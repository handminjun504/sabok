"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveMonthlySchedulesAction,
  type MonthlySchedulesState,
} from "@/app/actions/monthly-schedules";
import { CommaWonInput } from "@/components/CommaWonInput";

/**
 * 직원×월 단위로 금액을 입력하는 그리드 — 「대표반환」「배우자수령」「알아서금액」 3종을 한 폼에서 관리.
 * - 각 직원 행 끝에 연간 합계가 실시간 표시된다.
 * - 첫 마운트 시 외부 prop 으로 표시값을 채우고, 사용자가 손댄 뒤에는 그 입력을 신뢰한다.
 * - 저장하면 `companySettingsUpdateMonthlySchedules` 가 세 JSON 필드를 한 번에 partial-update.
 */

type MonthlyMap = Record<string, Partial<Record<string, number>>>;

type EmployeeRow = {
  id: string;
  employeeCode: string;
  name: string;
  position: string;
  /** 직원에 켜진 토글들 — 그리드 행 강조에 사용 */
  flagRepReturn: boolean;
  flagSpouseReceipt: boolean;
  flagAutoAmount: boolean;
};

type Props = {
  employees: ReadonlyArray<EmployeeRow>;
  /** 활성 연도 — 표 캡션과 감사 로그용 */
  activeYear: number;
  /** PB 에 저장된 현재 직원×월 금액 맵 */
  repReturn: MonthlyMap;
  spouseReceipt: MonthlyMap;
  discretionary: MonthlyMap;
  /** 권한 — false 이면 모든 입력이 disabled, 저장 버튼도 숨김 */
  canEdit: boolean;
};

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function fmt(n: number): string {
  return Math.round(Math.max(0, n)).toLocaleString("ko-KR");
}

function rowSum(row: Partial<Record<string, number>> | undefined): number {
  if (!row) return 0;
  let s = 0;
  for (const v of Object.values(row)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) s += v;
  }
  return s;
}

function cloneMap(src: MonthlyMap): MonthlyMap {
  const out: MonthlyMap = {};
  for (const [k, v] of Object.entries(src)) out[k] = { ...v };
  return out;
}

type SectionKey = "repReturn" | "spouseReceipt" | "discretionary";

const SECTION_META: Record<SectionKey, { title: string; hint: string; flagKey: keyof EmployeeRow | null }> = {
  repReturn: {
    title: "대표반환",
    hint: "직원 대표반환 토글이 켜진 사람만 노출됩니다.",
    flagKey: "flagRepReturn",
  },
  spouseReceipt: {
    title: "배우자수령",
    hint: "직원 배우자수령 토글이 켜진 사람만 노출됩니다.",
    flagKey: "flagSpouseReceipt",
  },
  discretionary: {
    title: "알아서금액",
    hint: "전 직원 대상 — 0 원이면 저장하지 않습니다.",
    flagKey: null,
  },
};

export function MonthlySchedulesPanel({
  employees,
  activeYear,
  repReturn,
  spouseReceipt,
  discretionary,
  canEdit,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<MonthlySchedulesState, FormData>(
    saveMonthlySchedulesAction,
    null,
  );

  const [maps, setMaps] = useState<Record<SectionKey, MonthlyMap>>(() => ({
    repReturn: cloneMap(repReturn),
    spouseReceipt: cloneMap(spouseReceipt),
    discretionary: cloneMap(discretionary),
  }));

  /** PB 값이 외부에서 갱신되면(연도 전환 등) 입력을 동기화. */
  useEffect(() => {
    setMaps({
      repReturn: cloneMap(repReturn),
      spouseReceipt: cloneMap(spouseReceipt),
      discretionary: cloneMap(discretionary),
    });
  }, [repReturn, spouseReceipt, discretionary]);

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  const filteredByKey = useMemo<Record<SectionKey, EmployeeRow[]>>(() => {
    const out: Record<SectionKey, EmployeeRow[]> = {
      repReturn: [],
      spouseReceipt: [],
      discretionary: [],
    };
    for (const e of employees) {
      if (e.flagRepReturn) out.repReturn.push(e);
      if (e.flagSpouseReceipt) out.spouseReceipt.push(e);
      out.discretionary.push(e);
    }
    return out;
  }, [employees]);

  const sectionTotals = useMemo<Record<SectionKey, number>>(() => {
    const sum = (m: MonthlyMap) =>
      Object.values(m).reduce((s, row) => s + rowSum(row), 0);
    return {
      repReturn: sum(maps.repReturn),
      spouseReceipt: sum(maps.spouseReceipt),
      discretionary: sum(maps.discretionary),
    };
  }, [maps]);

  function setCell(section: SectionKey, empId: string, month: number, value: number) {
    setMaps((prev) => {
      const next = { ...prev };
      const sec = cloneMap(prev[section]);
      const row = sec[empId] ? { ...sec[empId] } : {};
      const v = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
      if (v <= 0) delete row[String(month)];
      else row[String(month)] = v;
      if (Object.keys(row).length === 0) delete sec[empId];
      else sec[empId] = row;
      next[section] = sec;
      return next;
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--text)]">
            대표반환·배우자수령·알아서금액 — {activeYear}년
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            저장된 월별 금액은 안내 멘트의 직원 라인 아래에 자동으로 들어갑니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span>대표반환 합계 <strong className="tabular-nums text-[var(--text)]">{fmt(sectionTotals.repReturn)}</strong>원</span>
          <span>배우자수령 합계 <strong className="tabular-nums text-[var(--text)]">{fmt(sectionTotals.spouseReceipt)}</strong>원</span>
          <span>알아서금액 합계 <strong className="tabular-nums text-[var(--text)]">{fmt(sectionTotals.discretionary)}</strong>원</span>
        </div>
      </div>

      {state?.오류 ? (
        <p className="rounded-md border border-[var(--danger,#fca5a5)] bg-[var(--danger-soft,#fee2e2)] px-3 py-2 text-xs text-[var(--danger,#991b1b)]">
          {state.오류}
        </p>
      ) : null}

      <form action={formAction} className="space-y-6">
        {(["repReturn", "spouseReceipt", "discretionary"] as const).map((sectionKey) => {
          const meta = SECTION_META[sectionKey];
          const list = filteredByKey[sectionKey];
          return (
            <div key={sectionKey} className="surface overflow-hidden">
              <div className="dash-panel-toolbar border-b border-[var(--border)] bg-[var(--surface-hover)]/40">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text)]">{meta.title}</p>
                  <span className="text-xs text-[var(--muted)]">{meta.hint}</span>
                </div>
              </div>
              {list.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">
                  {meta.flagKey === "flagRepReturn"
                    ? "대표반환 플래그가 켜진 직원이 없습니다. 직원 상세에서 켠 뒤 다시 확인하세요."
                    : meta.flagKey === "flagSpouseReceipt"
                      ? "배우자수령 플래그가 켜진 직원이 없습니다. 직원 상세에서 켠 뒤 다시 확인하세요."
                      : "직원이 등록되어 있지 않습니다."}
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
                      {list.map((emp) => {
                        const row = maps[sectionKey][emp.id] ?? {};
                        const total = rowSum(row);
                        return (
                          <tr key={emp.id} className="border-b border-[var(--border)]/60">
                            <td className="sticky left-0 z-[1] bg-[var(--surface)] px-2 py-1.5 align-middle whitespace-nowrap shadow-[2px_0_0_var(--border)]">
                              <span className="mr-1 font-mono text-[0.65rem] text-[var(--muted)]">
                                {emp.employeeCode}
                              </span>
                              <span className="text-sm font-semibold text-[var(--text)]">{emp.name}</span>
                            </td>
                            {MONTHS.map((m) => {
                              const saved = row[String(m)];
                              return (
                                <td key={m} className="px-1 py-1">
                                  <CommaWonInput
                                    name={`${sectionKey}_${emp.id}_${m}`}
                                    defaultValue={saved ?? null}
                                    placeholder="—"
                                    disabled={!canEdit}
                                    className="input w-[6rem] px-2 py-1 text-right text-xs tabular-nums"
                                    onUserChange={(v) => setCell(sectionKey, emp.id, m, v)}
                                  />
                                </td>
                              );
                            })}
                            <td
                              className={
                                "px-2 py-1.5 text-right font-bold tabular-nums " +
                                (total > 0 ? "text-[var(--accent)]" : "text-[var(--muted)]")
                              }
                            >
                              {fmt(total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {canEdit ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {state?.성공 ? (
              <span className="text-xs text-[var(--success)]">저장되었습니다.</span>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "저장 중…" : "저장"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
        )}
      </form>
    </section>
  );
}
