"use client";

import type { ValidationResult } from "@/lib/domain/operating-report-validation";
import { toThousand } from "@/lib/domain/journal-ingest";

type Props = {
  result: ValidationResult;
  unit: "원" | "천원";
};

/** 7개 정합성 검증 결과 표시. 각 항목의 기대값/실제값을 단위 토글에 맞춰 보여준다. */
export function OperatingReportValidationPanel({ result, unit }: Props) {
  const fmt = (n: number) =>
    unit === "천원" ? toThousand(n).toLocaleString("ko-KR") : n.toLocaleString("ko-KR");

  const passColor =
    result.overall === "PASS"
      ? "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]"
      : "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]";

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text)]">정합성 검증</h3>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${passColor}`}>
          {result.overall === "PASS" ? "PASS" : "FAIL"}
        </span>
      </header>
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-[var(--surface-hover)] text-[var(--muted)]">
            <tr>
              <th className="border border-[var(--border)] px-3 py-1.5 text-left">항목</th>
              <th className="border border-[var(--border)] px-3 py-1.5 text-right">기대({unit})</th>
              <th className="border border-[var(--border)] px-3 py-1.5 text-right">실제({unit})</th>
              <th className="border border-[var(--border)] px-3 py-1.5 text-center">결과</th>
              <th className="border border-[var(--border)] px-3 py-1.5 text-left">사유</th>
            </tr>
          </thead>
          <tbody>
            {result.checks.map((c) => (
              <tr key={c.id} className={c.ok ? "" : "bg-[var(--danger)]/5"}>
                <td className="border border-[var(--border)] px-3 py-1.5">{c.label}</td>
                <td className="border border-[var(--border)] px-3 py-1.5 text-right tabular-nums">{fmt(c.expected)}</td>
                <td className="border border-[var(--border)] px-3 py-1.5 text-right tabular-nums">{fmt(c.actual)}</td>
                <td className="border border-[var(--border)] px-3 py-1.5 text-center">
                  {c.ok ? (
                    <span className="text-[var(--success)] font-semibold">OK</span>
                  ) : (
                    <span className="text-[var(--danger)] font-semibold">NG</span>
                  )}
                </td>
                <td className="border border-[var(--border)] px-3 py-1.5 text-[var(--muted)]">{c.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
