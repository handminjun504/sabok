"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";

import {
  resyncAllAdjustedSalariesAction,
  resyncEmployeeAdjustedSalaryAction,
  type ResyncActionResult,
} from "@/app/actions/adjustedSalaryResync";
import type { AdjustedSalaryAudit } from "@/lib/domain/adjusted-salary-audit";
import { Alert } from "@/components/ui/Alert";
import { formatWon } from "@/lib/util/number";

export type AdjustedSalaryAuditPanelProps = {
  year: number;
  rows: ReadonlyArray<AdjustedSalaryAudit>;
  canEdit: boolean;
};

/** +/- 부호 포함 콤마 원화. 0 이면 "0원". */
function formatSignedWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0원";
  const sign = n > 0 ? "+" : "-";
  return `${sign}${Math.abs(Math.round(n)).toLocaleString("ko-KR")}원`;
}

type Filter = "mismatch" | "all";

export function AdjustedSalaryAuditPanel({ year, rows, canEdit }: AdjustedSalaryAuditPanelProps) {
  const [filter, setFilter] = useState<Filter>("mismatch");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const [individualPending, startIndividual] = useTransition();
  const [result, setResult] = useState<ResyncActionResult | null>(null);

  const mismatched = useMemo(
    () => rows.filter((r) => r.overrideMonths.length > 0 && r.diff !== 0 && !r.isAfterResign),
    [rows],
  );
  const hasOverride = useMemo(() => rows.filter((r) => r.overrideMonths.length > 0), [rows]);

  const visible = filter === "mismatch" ? mismatched : rows;

  const totalDiff = mismatched.reduce((s, r) => s + r.diff, 0);

  function runOne(employeeId: string) {
    setPendingId(employeeId);
    setResult(null);
    startIndividual(async () => {
      try {
        const r = await resyncEmployeeAdjustedSalaryAction(employeeId);
        setResult(r);
      } finally {
        setPendingId(null);
      }
    });
  }

  function runAll() {
    if (mismatched.length === 0) return;
    const ok = window.confirm(
      `중도 변동이 감지된 ${mismatched.length}명의 조사표 조정연봉을 실제 월별 누적값으로 덮어씁니다. 진행할까요?`,
    );
    if (!ok) return;
    setResult(null);
    startBulk(async () => {
      const r = await resyncAllAdjustedSalariesAction();
      setResult(r);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[var(--text)]">조정연봉 점검 · {year}년</h3>
          <p className="text-xs text-[var(--muted)]">
            {`<${String(year).slice(-2)}년 사복 진행 조사표>`} 에 올라간 <strong>조정연봉</strong> 과
            실제 월별 누적을 비교합니다. 중도 변동(레벨·금액 재분배)이 있으면 두 값이 어긋날 수 있어요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)] text-xs">
            <button
              type="button"
              onClick={() => setFilter("mismatch")}
              className={
                "px-3 py-1.5 transition " +
                (filter === "mismatch"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]")
              }
            >
              불일치만 ({mismatched.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={
                "px-3 py-1.5 transition " +
                (filter === "all"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]")
              }
            >
              전체 직원 ({rows.length})
            </button>
          </div>
          {canEdit ? (
            <button
              type="button"
              className="btn btn-primary text-xs"
              onClick={runAll}
              disabled={bulkPending || individualPending || mismatched.length === 0}
              aria-busy={bulkPending}
            >
              {bulkPending ? "동기화 중…" : `일괄 재동기화 (${mismatched.length}명)`}
            </button>
          ) : null}
        </div>
      </div>

      {mismatched.length === 0 ? (
        <Alert tone="success" title="모든 직원의 조사표 조정연봉이 실제 월별 누적과 일치합니다">
          중도 변동이 반영된 직원({hasOverride.length}명)까지 포함해 확인했습니다.
        </Alert>
      ) : (
        <Alert tone="warn" title={`${mismatched.length}명이 조사표 값과 실제 누적 조정연봉이 다릅니다`}>
          <p>
            합산 차이: <strong className="tabular-nums">{formatSignedWon(totalDiff)}</strong>. 각 행의{" "}
            <strong>재동기화</strong> 버튼이나 상단{" "}
            <strong>일괄 재동기화</strong> 로 조사표에 올린 조정연봉을 실제 누적값으로 덮어씁니다 — 월별
            분배(이미 지급된 월 포함)는 그대로 유지됩니다.
          </p>
        </Alert>
      )}

      {result && result.ok ? (
        <Alert tone="success" title="동기화 완료">
          <ul className="list-disc pl-5">
            <li>업데이트: {result.updated.length}건</li>
            {result.skipped.length > 0 ? <li>건너뜀: {result.skipped.length}건</li> : null}
          </ul>
        </Alert>
      ) : null}
      {result && !result.ok ? (
        <Alert tone="danger" title="동기화 실패" assertive>
          {result.오류}
        </Alert>
      ) : null}

      <div className="surface overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)] bg-[var(--surface-hover)]/40 text-xs">
              <th className="dash-table-th-md text-left">코드</th>
              <th className="dash-table-th-md text-left">이름</th>
              <th className="dash-table-th-md text-center">Lv</th>
              <th className="dash-table-th-md text-right">조사표 조정연봉</th>
              <th className="dash-table-th-md text-right">실제 누적 조정연봉</th>
              <th className="dash-table-th-md text-right">차이</th>
              <th className="dash-table-th-md text-left">override 월</th>
              <th className="dash-table-th-md w-28 text-center">동작</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs text-[var(--muted)]">
                  표시할 직원이 없습니다.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const busy = pendingId === r.employeeId && individualPending;
                const actionable =
                  canEdit && r.overrideMonths.length > 0 && r.diff !== 0 && !r.isAfterResign;
                return (
                  <tr key={r.employeeId} className="border-b border-[var(--border)] dash-table-row">
                    <td className="px-2 py-2.5 font-mono text-xs tabular-nums text-[var(--muted)]">
                      {r.employeeCode}
                    </td>
                    <td className="px-2 py-2.5 text-sm font-bold text-[var(--text)]">
                      <Link
                        href={`/dashboard/employees/${r.employeeId}`}
                        className="hover:text-[var(--accent)] hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.isAfterResign ? (
                        <span className="badge badge-neutral ml-2">퇴사</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs tabular-nums text-[var(--muted)]">
                      Lv.{r.level}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-[var(--text)]">
                      {formatWon(r.surveyAdjustedAnnual)}원
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-[var(--text)]">
                      {formatWon(r.actualAdjustedAnnual)}원
                    </td>
                    <td
                      className={
                        "px-2 py-2.5 text-right tabular-nums font-semibold " +
                        (r.diff === 0
                          ? "text-[var(--muted)]"
                          : r.diff > 0
                            ? "text-[var(--success)]"
                            : "text-[var(--danger)]")
                      }
                    >
                      {formatSignedWon(r.diff)}
                    </td>
                    <td className="px-2 py-2.5 text-left text-xs text-[var(--muted)]">
                      {r.overrideMonths.length === 0 ? (
                        <span className="text-[var(--muted)]">—</span>
                      ) : (
                        <span className="tabular-nums">
                          {r.overrideMonths.map((m) => `${m}월`).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {actionable ? (
                        <button
                          type="button"
                          className="btn btn-outline text-xs"
                          onClick={() => runOne(r.employeeId)}
                          disabled={busy || bulkPending || individualPending}
                          aria-busy={busy}
                        >
                          {busy ? "동기화 중…" : "재동기화"}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]/30 px-3 py-2 text-xs text-[var(--muted)]">
        <summary className="cursor-pointer text-[var(--text)]">
          동기화는 무엇을 바꾸나요? — 클릭해 자세히 보기
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Employee.adjustedSalary</strong> 만 실제 월별 누적값으로 덮어씁니다. 기존연봉
            (<code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5">baseSalary</code>) 은 건드리지
            않습니다.
          </li>
          <li>
            월별 <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5">adjustedSalaryOverrideAmount</code> 는
            그대로 보존됩니다 — 이미 지급된 월의 분배도 영향받지 않습니다.
          </li>
          <li>
            이후 조사표·직원 목록 등 &ldquo;연 조정급여&rdquo; 로 노출되는 모든 화면이 실제 월별 합과 일치하게 됩니다.
          </li>
        </ul>
      </details>
    </div>
  );
}
