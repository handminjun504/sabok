"use client";

import { useCallback, useMemo, useState } from "react";

import {
  parseAnnouncementPanelPayloadJson,
  type ScheduleAnnouncementPanelRow,
} from "@/lib/domain/schedule-announcement-payload";
import {
  buildSalaryPortionNotice,
  buildTransferAndDetailNotice,
  showSalaryPortionNoticeMode,
  type AnnouncementRowInput,
} from "@/lib/domain/schedule-announcement";
import type { TenantOperationMode } from "@/lib/domain/tenant-profile";
import type { AdditionalReserveStatus } from "@/lib/domain/vendor-reserve";

/**
 * 안내 패널과 동일 패턴의 작은 복사 블록 — 이 컴포넌트만 쓰므로 인라인 정의로 의존성 최소화.
 */
function CopyTextBlock({ title, body }: { title: string; body: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [body]);
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-[var(--text)]">{title}</span>
        <button
          type="button"
          disabled={!body}
          onClick={() => void onCopy()}
          className="btn btn-secondary text-xs disabled:opacity-50"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--border)]/60 bg-[var(--surface-hover)]/50 p-2.5 font-sans text-[0.7rem] leading-relaxed text-[var(--text)]">
        {body || ""}
      </pre>
    </div>
  );
}

/**
 * 「직원 12개월 한눈에」 — 직원 상세 페이지 안에서 메뉴 이동 없이 검증 가능하도록
 * 12개월 사복·안내 급여·대표반환/배우자수령/알아서 + 그 달 안내 멘트 미리보기를 한 카드에 모은다.
 *
 * 입력은 안내 패널과 동일한 와이어 페이로드(`encodeAnnouncementPanelPayloadJson`) — 단일 직원 1행만 들어 있어야 한다.
 * 12개월 표·안내 빌더 모두 동일 데이터를 공유하므로 운영자가 표 ↔ 멘트 정합을 한 화면에서 확인할 수 있다.
 */
export function EmployeeYearOverviewPanel({
  year,
  payloadJson,
  operationMode,
  reserveStatus,
  initialFocusMonth,
}: {
  year: number;
  payloadJson: string;
  operationMode: TenantOperationMode;
  reserveStatus: AdditionalReserveStatus;
  /** 미설정 시 현재 달(연도와 일치할 때만) 또는 활성 월 첫 번째. */
  initialFocusMonth?: number | null;
}) {
  const row = useMemo<ScheduleAnnouncementPanelRow | null>(() => {
    const rows = parseAnnouncementPanelPayloadJson(payloadJson);
    return rows.length > 0 ? rows[0]! : null;
  }, [payloadJson]);

  /** 활성 월 = welfare 또는 안내 급여 중 하나라도 > 0 인 월. 비활성은 셀렉트 disabled. */
  const activeMonths = useMemo<number[]>(() => {
    if (!row) return [];
    const out: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const w = row.welfareByMonth[m] ?? 0;
      const s = row.announcementSalaryByMonthList[m - 1] ?? 0;
      const rep = row.repReturnByMonth[m] ?? 0;
      const sp = row.spouseReceiptByMonth[m] ?? 0;
      const dec = row.discretionaryByMonth[m] ?? 0;
      const cs = (row.customReturnsByMonth ?? []).some((c) => (c.byMonth[m] ?? 0) > 0);
      if (w > 0 || s > 0 || rep > 0 || sp > 0 || dec > 0 || cs) out.push(m);
    }
    return out;
  }, [row]);

  const defaultMonth = useMemo<number | null>(() => {
    if (initialFocusMonth != null) {
      if (initialFocusMonth >= 1 && initialFocusMonth <= 12) return initialFocusMonth;
    }
    if (activeMonths.length === 0) return null;
    /** 현재 연도면 오늘 달이 활성이면 선택, 아니면 활성 중 첫 달. */
    const now = new Date();
    if (now.getFullYear() === year && activeMonths.includes(now.getMonth() + 1)) {
      return now.getMonth() + 1;
    }
    return activeMonths[0]!;
  }, [activeMonths, initialFocusMonth, year]);

  const [month, setMonth] = useState<number | null>(defaultMonth);

  const noticeInput = useMemo<AnnouncementRowInput | null>(() => {
    if (!row || month == null) return null;
    return {
      employeeCode: row.employeeCode,
      name: row.name,
      welfareMonth: row.welfareByMonth[month] ?? 0,
      salaryMonth: row.announcementSalaryByMonthList[month - 1] ?? 0,
      trueUpBreakdownLine:
        row.trueUp != null && row.trueUp.month === month ? row.trueUp.breakdown : null,
      flagRepReturn: row.flagRepReturn,
      repReturnAmount: row.repReturnByMonth[month] ?? 0,
      spouseReceiptAmount: row.spouseReceiptByMonth[month] ?? 0,
      discretionaryAmount: row.discretionaryByMonth[month] ?? 0,
      customReturns: (row.customReturnsByMonth ?? []).map((c) => ({
        label: c.label,
        amount: c.byMonth[month] ?? 0,
      })),
    };
  }, [month, row]);

  const reserveActive = reserveStatus.active;

  const welfareNotice = useMemo<string>(() => {
    if (!noticeInput) return "";
    return buildTransferAndDetailNotice(month ?? 1, [noticeInput], {
      additionalReserveActive: reserveActive,
    });
  }, [month, noticeInput, reserveActive]);

  const salaryNotice = useMemo<string | null>(() => {
    if (!noticeInput || month == null) return null;
    if (!showSalaryPortionNoticeMode(operationMode)) return null;
    return buildSalaryPortionNotice(month, operationMode, [noticeInput]);
  }, [month, noticeInput, operationMode]);

  const totals = useMemo(() => {
    if (!row) return { welfare: 0, salary: 0, rep: 0, sp: 0, dec: 0, custom: 0 };
    let w = 0;
    let s = 0;
    let rep = 0;
    let sp = 0;
    let dec = 0;
    let custom = 0;
    for (let m = 1; m <= 12; m++) {
      w += row.welfareByMonth[m] ?? 0;
      s += row.announcementSalaryByMonthList[m - 1] ?? 0;
      rep += row.repReturnByMonth[m] ?? 0;
      sp += row.spouseReceiptByMonth[m] ?? 0;
      dec += row.discretionaryByMonth[m] ?? 0;
      for (const c of row.customReturnsByMonth ?? []) custom += c.byMonth[m] ?? 0;
    }
    return { welfare: w, salary: s, rep, sp, dec, custom };
  }, [row]);

  if (!row) {
    return (
      <p className="text-sm text-[var(--muted)]">
        12개월 데이터를 만들 수 없습니다. 직원·연도 설정을 확인해 주세요.
      </p>
    );
  }

  const hasCustomReturns = (row.customReturnsByMonth ?? []).length > 0;

  return (
    <div className="space-y-5">
      {/* 12개월 요약 표 */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs leading-tight">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="py-1.5 pr-2 font-medium">월</th>
              <th className="py-1.5 pr-2 font-medium tabular-nums text-right">사복 합계</th>
              <th className="py-1.5 pr-2 font-medium tabular-nums text-right">안내 급여</th>
              <th className="py-1.5 pr-2 font-medium tabular-nums text-right">대표반환</th>
              <th className="py-1.5 pr-2 font-medium tabular-nums text-right">배우자수령</th>
              <th className="py-1.5 pr-2 font-medium tabular-nums text-right">알아서금액</th>
              {hasCustomReturns ? (
                <th className="py-1.5 pr-2 font-medium tabular-nums text-right">+ 반환</th>
              ) : null}
              <th className="py-1.5 pl-2 font-medium tabular-nums text-right">합계</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const w = row.welfareByMonth[m] ?? 0;
              const s = row.announcementSalaryByMonthList[m - 1] ?? 0;
              const rep = row.repReturnByMonth[m] ?? 0;
              const sp = row.spouseReceiptByMonth[m] ?? 0;
              const dec = row.discretionaryByMonth[m] ?? 0;
              let custom = 0;
              for (const c of row.customReturnsByMonth ?? []) custom += c.byMonth[m] ?? 0;
              const sum = w + s;
              const isActive = activeMonths.includes(m);
              const isFocus = month === m;
              return (
                <tr
                  key={m}
                  className={
                    "border-b border-[var(--border)]/40 " +
                    (isFocus
                      ? "bg-[var(--accent)]/8 "
                      : isActive
                        ? "hover:bg-[var(--surface-hover)] "
                        : "text-[var(--muted)] ")
                  }
                >
                  <td className="py-1.5 pr-2">
                    <button
                      type="button"
                      onClick={() => setMonth(m)}
                      className={
                        "w-full text-left font-medium tabular-nums " +
                        (isFocus ? "text-[var(--accent)] " : "")
                      }
                    >
                      {m}월
                    </button>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{w > 0 ? formatWon(w) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{s > 0 ? formatWon(s) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{rep > 0 ? formatWon(rep) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{sp > 0 ? formatWon(sp) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{dec > 0 ? formatWon(dec) : "—"}</td>
                  {hasCustomReturns ? (
                    <td className="py-1.5 pr-2 text-right tabular-nums">{custom > 0 ? formatWon(custom) : "—"}</td>
                  ) : null}
                  <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">
                    {sum > 0 ? formatWon(sum) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border)] text-[var(--text)]">
              <td className="py-2 pr-2 font-semibold">연간</td>
              <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatWon(totals.welfare)}</td>
              <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatWon(totals.salary)}</td>
              <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatWon(totals.rep)}</td>
              <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatWon(totals.sp)}</td>
              <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatWon(totals.dec)}</td>
              {hasCustomReturns ? (
                <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatWon(totals.custom)}</td>
              ) : null}
              <td className="py-2 pl-2 text-right font-semibold tabular-nums">
                {formatWon(totals.welfare + totals.salary)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 안내 멘트 미리보기 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-[var(--muted)]" htmlFor="overview-month">
            안내 월
          </label>
          <select
            id="overview-month"
            value={month ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setMonth(v ? Number(v) : null);
            }}
            className="input w-[5.5rem] text-xs"
          >
            <option value="" disabled>
              —
            </option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m} disabled={!activeMonths.includes(m)}>
                {m}월{activeMonths.includes(m) ? "" : " · 비활성"}
              </option>
            ))}
          </select>
          {reserveActive ? (
            <span className="trust-pill text-[10px]">+20% 적립금 포함</span>
          ) : null}
        </div>

        {month == null ? (
          <p className="text-xs text-[var(--muted)]">활성 월이 없습니다 (사복·안내 급여 모두 0).</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <CopyTextBlock title={`${month}월 사복 안내`} body={welfareNotice} />
            {salaryNotice ? (
              <CopyTextBlock title={`${month}월 급여분 안내`} body={salaryNotice} />
            ) : (
              <p className="self-center text-xs text-[var(--muted)]">
                현재 운영모드에서는 「급여분 안내」 멘트가 노출되지 않습니다.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}
