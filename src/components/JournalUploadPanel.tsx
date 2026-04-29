"use client";

import { useState, useTransition } from "react";
import {
  parseUploadedFilesAction,
  type ParseUploadedFilesResult,
} from "@/app/actions/journal-ingest";
import {
  ALL_MAPPING_TARGETS,
  describeMappingTarget,
  toThousand,
} from "@/lib/domain/journal-ingest";
import type { JournalAggregate, JournalMappingTarget } from "@/types/models";

type Props = {
  /** 파싱·집계 결과를 부모에 전달 */
  onAggregate: (agg: JournalAggregate | null) => void;
  /** 현재 단위(원/천원)에 따라 표 표시 스위칭 */
  unit: "원" | "천원";
};

/**
 * 분개장(PDF/XLSX), 시산표(PDF), 거래처별 잔액표(XLSX) 업로드 패널.
 *
 * - 한 번 업로드 → JournalAggregate 생성 → 부모로 전달
 * - 매핑 미일치 계정에 대해 사용자 override 입력 가능 → "다시 집계" 버튼으로 재계산
 */
export function JournalUploadPanel({ onAggregate, unit }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ParseUploadedFilesResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("file", f);
    fd.set("userMappingOverridesJson", JSON.stringify(overrides));
    startTransition(async () => {
      const r = await parseUploadedFilesAction(null, fd);
      setResult(r);
      if (r.ok) onAggregate(r.aggregate);
      else onAggregate(null);
    });
  };

  const fmt = (won: number) => (unit === "천원" ? toThousand(won).toLocaleString("ko-KR") : won.toLocaleString("ko-KR"));
  const unitLabel = unit === "천원" ? "천원" : "원";

  const updateOverride = (account: string, value: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === "auto") delete next[account];
      else next[account] = value;
      return next;
    });
  };

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">
          분개장 / 시산표 업로드 (자동 집계)
        </h3>
        <span className="text-xs text-[var(--muted)]">
          PDF 분개장, PDF 합계잔액시산표, XLSX 분개장·잔액표 지원 — 결과는 세션 내에서만 보관
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block text-xs file:mr-2 file:rounded file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-xs file:text-white hover:file:bg-[var(--accent-hover)]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || files.length === 0}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:bg-[var(--accent-hover)]"
        >
          {pending ? "집계 중…" : "파싱·집계 실행"}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setFiles([]);
              setOverrides({});
              onAggregate(null);
            }}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)]"
          >
            초기화
          </button>
        )}
      </div>

      {result && !result.ok ? (
        <div className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
          {result.error}
        </div>
      ) : null}

      {result && result.ok ? (
        <div className="space-y-3">
          {/* 파일별 요약 */}
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 text-xs space-y-1">
            <div className="font-medium text-[var(--text)]">파일별 처리 결과</div>
            {result.raw.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="font-mono text-[var(--muted)]">{f.kind}</span>
                <span>{f.fileName}</span>
                <span className="text-[var(--muted)]">— {f.entries.toLocaleString("ko-KR")} 엔트리</span>
                {f.warnings.length > 0 && (
                  <span className="text-[var(--warn)]">
                    경고 {f.warnings.length}건
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 자동 집계 요약 */}
          <div className="grid gap-2 sm:grid-cols-3">
            <SummaryBox label="⑬ 사업주 출연" value={fmt(result.aggregate.employerContribution)} unit={unitLabel} />
            <SummaryBox label="㉙ 기금운용 수익금" value={fmt(result.aggregate.interestIncome)} unit={unitLabel} />
            <SummaryBox label="◯68 기금 운영비" value={fmt(result.aggregate.operationCost)} unit={unitLabel} />
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {[57, 58, 59, 60, 61, 62, 63, 64, 65, 66].map((c) => (
              <SummaryBox
                key={c}
                label={`◯${c}`}
                value={fmt(result.aggregate.purposeByCode[c] ?? 0)}
                unit={unitLabel}
                sub={`${result.aggregate.recipientsByCode[c] ?? 0}명`}
              />
            ))}
          </div>

          {/* 매핑 로그 + override */}
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface)] open:bg-[var(--surface-hover)]" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--text)]">
              매핑 로그 · 사용자 보정 ({result.aggregate.mappingLog.length}개 계정)
            </summary>
            <div className="overflow-x-auto px-3 pb-3">
              <table className="op-mapping-table">
                <thead>
                  <tr>
                    <th>원 계정명</th>
                    <th>자동 매핑</th>
                    <th>금액({unitLabel})</th>
                    <th>사용자 변경</th>
                  </tr>
                </thead>
                <tbody>
                  {result.aggregate.mappingLog.map((m) => {
                    const currentValue = overrides[m.account] ?? targetToValue(m.target);
                    const overridden = currentValue !== targetToValue(m.target);
                    return (
                      <tr key={m.account} className={!m.confident ? "row-warn" : ""}>
                        <td>{m.account}</td>
                        <td>
                          {describeMappingTarget(m.target)}
                          {!m.confident && <span className="ml-1 text-[var(--warn)] text-[10px]">(확인필요)</span>}
                        </td>
                        <td className="num">{fmt(m.amount)}</td>
                        <td>
                          <select
                            value={currentValue}
                            onChange={(e) => updateOverride(m.account, e.target.value === targetToValue(m.target) ? "auto" : e.target.value)}
                            className="text-xs rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5"
                          >
                            {ALL_MAPPING_TARGETS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          {overridden && <span className="ml-1 text-[var(--accent)] text-[10px]">(변경)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {Object.keys(overrides).length > 0 && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:bg-[var(--accent-hover)]"
                  >
                    매핑 보정 다시 집계
                  </button>
                </div>
              )}
            </div>
          </details>

          {result.aggregate.warnings.length > 0 && (
            <ul className="rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-xs text-[var(--warn)] space-y-1">
              {result.aggregate.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <style jsx>{`
        .op-mapping-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        .op-mapping-table th,
        .op-mapping-table td {
          border: 1px solid var(--border);
          padding: 4px 8px;
          text-align: left;
          vertical-align: middle;
        }
        .op-mapping-table thead th {
          background: var(--surface-hover);
          color: var(--muted);
        }
        .op-mapping-table .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .op-mapping-table .row-warn td {
          background: rgba(var(--warn-rgb, 226, 159, 51), 0.08);
        }
      `}</style>
    </section>
  );
}

function SummaryBox({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="text-sm font-semibold text-[var(--text)]">
        {value} <span className="text-[10px] font-normal text-[var(--muted)]">{unit}</span>
      </div>
      {sub && <div className="text-[10px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function targetToValue(t: JournalMappingTarget): string {
  if (t.kind === "BIZ") return `BIZ:${t.code}`;
  if (t.kind === "OPERATION_COST") return "OPERATION_COST";
  if (t.kind === "EMPLOYER_CONTRIBUTION") return "EMPLOYER_CONTRIBUTION";
  if (t.kind === "INTEREST_INCOME") return "INTEREST_INCOME";
  if (t.kind === "CASH_FLOW") return "CASH_FLOW";
  return "UNMAPPED";
}
