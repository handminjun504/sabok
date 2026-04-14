"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Employee } from "@/types/models";
import { suggestLevelByExpectedRegular } from "@/lib/domain/schedule";
import { bulkSaveScheduleAssignmentsAction } from "@/app/actions/scheduleAssignments";

export type ScheduleAssignmentEmployee = Pick<
  Employee,
  "id" | "employeeCode" | "name" | "level" | "expectedYearlyWelfare"
>;

function formatWon(n: number): string {
  return n.toLocaleString("ko-KR");
}

function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, "");
}

function parseExpectedWon(s: string): number | null {
  const d = digitsOnly(s);
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

type RowState = {
  employeeId: string;
  employeeCode: string;
  name: string;
  level: number;
  expectedStr: string;
};

export function ScheduleEmployeeLevelAssignments({
  employees,
  regularTotalsByLevel,
  canEdit,
}: {
  employees: ScheduleAssignmentEmployee[];
  regularTotalsByLevel: Record<number, number>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [rows, setRows] = useState<RowState[]>(() =>
    employees.map((e) => ({
      employeeId: e.id,
      employeeCode: e.employeeCode,
      name: e.name,
      level: Math.min(5, Math.max(1, Math.round(Number(e.level)) || 1)),
      expectedStr:
        e.expectedYearlyWelfare != null && Number.isFinite(Number(e.expectedYearlyWelfare))
          ? formatWon(Math.round(Number(e.expectedYearlyWelfare)))
          : "",
    }))
  );

  const suggested = useCallback(
    (expectedStr: string) => {
      const amt = parseExpectedWon(expectedStr);
      return suggestLevelByExpectedRegular(amt, regularTotalsByLevel);
    },
    [regularTotalsByLevel]
  );

  const totalsLine = useMemo(() => {
    return [1, 2, 3, 4, 5]
      .map((lv) => `L${lv} ${formatWon(regularTotalsByLevel[lv] ?? 0)}`)
      .join(" · ");
  }, [regularTotalsByLevel]);

  const applySuggestedOne = (employeeId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.employeeId !== employeeId) return r;
        const sug = suggested(r.expectedStr);
        return sug != null ? { ...r, level: sug } : r;
      })
    );
  };

  const applySuggestedAll = () => {
    setRows((prev) =>
      prev.map((r) => {
        const sug = suggested(r.expectedStr);
        return sug != null ? { ...r, level: sug } : r;
      })
    );
  };

  const save = () => {
    setMessage(null);
    const payload = rows.map((r) => ({
      employeeId: r.employeeId,
      level: r.level,
      expectedYearlyWelfare: parseExpectedWon(r.expectedStr),
    }));
    startTransition(async () => {
      const res = await bulkSaveScheduleAssignmentsAction(payload);
      if (res?.오류) {
        setMessage({ kind: "err", text: res.오류 });
        return;
      }
      setMessage({ kind: "ok", text: "저장했습니다." });
      router.refresh();
    });
  };

  if (employees.length === 0) {
    return <p className="text-sm text-[var(--muted)]">직원이 없습니다.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        지급 예정액은 아래 레벨별 정기(규칙) 연간 합과 비교해 가장 가까운 레벨을 추천합니다. 입사·생일·창립월 등에 따라 실제
        스케줄 연간 기금은 달라질 수 있습니다.
      </p>
      <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[0.7rem] tabular-nums text-[var(--text)]">
        {totalsLine}
      </p>

      {message ? (
        <p
          className={`text-sm ${message.kind === "ok" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      <div className="surface overflow-x-auto dash-panel-pad">
        <table className="min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="dash-table-th">코드</th>
              <th className="dash-table-th">이름</th>
              <th className="dash-table-th dash-table-vline-strong whitespace-nowrap">지급 예정액(연·원)</th>
              <th className="dash-table-th dash-table-vline text-center">추천</th>
              <th className="dash-table-th dash-table-vline">레벨</th>
              {canEdit ? <th className="dash-table-th dash-table-vline whitespace-nowrap">추천 반영</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sug = suggested(r.expectedStr);
              return (
                <tr key={r.employeeId} className="border-b border-[var(--border)]">
                  <td className="px-3 py-2 font-mono tabular-nums">{r.employeeCode}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="dash-table-vline-strong px-3 py-2">
                    {canEdit ? (
                      <input
                        className="input w-full max-w-[9rem] tabular-nums"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={r.expectedStr}
                        placeholder="(선택)"
                        onChange={(e) => {
                          const d = digitsOnly(e.target.value);
                          setRows((prev) =>
                            prev.map((x) =>
                              x.employeeId === r.employeeId
                                ? { ...x, expectedStr: d ? formatWon(Number(d)) : "" }
                                : x
                            )
                          );
                        }}
                      />
                    ) : (
                      <span className="tabular-nums text-[var(--muted)]">
                        {r.expectedStr ? `${r.expectedStr}원` : "—"}
                      </span>
                    )}
                  </td>
                  <td className="dash-table-vline px-3 py-2 text-center tabular-nums">
                    {sug != null ? (
                      <span className="font-medium text-[var(--text)]" title={`규칙 합과의 차이 기준`}>
                        {sug}
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="dash-table-vline px-3 py-2">
                    {canEdit ? (
                      <select
                        className="input w-[4.5rem] py-1 text-xs"
                        value={r.level}
                        onChange={(e) => {
                          const lv = Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1));
                          setRows((prev) =>
                            prev.map((x) => (x.employeeId === r.employeeId ? { ...x, level: lv } : x))
                          );
                        }}
                      >
                        {[1, 2, 3, 4, 5].map((lv) => (
                          <option key={lv} value={lv}>
                            {lv}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="tabular-nums">{r.level}</span>
                    )}
                  </td>
                  {canEdit ? (
                    <td className="dash-table-vline px-3 py-2">
                      <button
                        type="button"
                        className="btn btn-secondary text-[0.7rem] py-1"
                        disabled={sug == null || pending}
                        onClick={() => applySuggestedOne(r.employeeId)}
                      >
                        적용
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
            {pending ? "저장 중…" : "변경 사항 저장"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={applySuggestedAll}
            title="지급 예정액이 입력된 행만 추천 레벨로 맞춥니다."
          >
            예정액 있는 행 추천 일괄 적용
          </button>
        </div>
      ) : (
        <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
      )}
    </div>
  );
}
