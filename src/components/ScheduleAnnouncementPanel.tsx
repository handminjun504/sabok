"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TenantOperationMode } from "@/lib/domain/tenant-profile";
import {
  applyAdditionalReserve,
  buildSalaryPortionNotice,
  buildTransferAndDetailNotice,
  buildWelfareFundBatchedNotice,
  buildWelfareFundNotice,
  shouldShowTransferDetailBlock,
  showSalaryPortionNoticeMode,
  sumWelfareScheduledMonth,
} from "@/lib/domain/schedule-announcement";
import {
  additionalReserveStatusLabel,
  type AdditionalReserveStatus,
} from "@/lib/domain/vendor-reserve";
import type { ScheduleCardRow } from "@/components/ScheduleEmployeeCards";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function defaultAnnouncementMonth(year: number): number {
  const cy = new Date().getFullYear();
  return year === cy ? new Date().getMonth() + 1 : 1;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function CopyTextBlock({
  title,
  body,
  disabled,
}: {
  title: string;
  body: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    if (disabled || !body) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [body, disabled]);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-[var(--text)]">{title}</span>
        <button
          type="button"
          disabled={disabled || !body}
          onClick={() => void onCopy()}
          className="btn btn-secondary text-xs disabled:opacity-50"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--border)]/60 bg-[var(--surface-hover)]/50 p-2.5 font-sans text-[0.7rem] leading-relaxed text-[var(--text)]">
        {body || (disabled ? "월을 선택하면 문구가 생성됩니다." : "")}
      </pre>
    </div>
  );
}

export function ScheduleAnnouncementPanel({
  year,
  rows,
  operationMode,
  reserveStatus,
}: {
  year: number;
  rows: ScheduleCardRow[];
  operationMode: TenantOperationMode;
  /**
   * 거래처 타입 + 자본금 50% 진행도로 산출된 “현재 +20% 적립 활성?” 결과.
   * 이 값을 멘트 빌더와 카드에 그대로 흘려 보낸다.
   */
  reserveStatus: AdditionalReserveStatus;
}) {
  const reserveActive = reserveStatus.active;
  const reserveOptions = useMemo(
    () => ({ additionalReserveActive: reserveActive }),
    [reserveActive],
  );
  const [focusMonth, setFocusMonth] = useState<number | null>(() => defaultAnnouncementMonth(year));
  const [batchFrom, setBatchFrom] = useState(1);
  const [batchTo, setBatchTo] = useState(3);

  useEffect(() => {
    setFocusMonth(defaultAnnouncementMonth(year));
  }, [year]);

  const announcementInputs = useMemo(() => {
    if (focusMonth == null) return null;
    return rows.map((r) => ({
      employeeCode: r.employeeCode,
      name: r.name,
      welfareMonth: r.welfareByMonth[focusMonth] ?? 0,
      salaryMonth: r.salaryMonth,
      flagRepReturn: r.flagRepReturn,
      discretionaryAmount: r.discretionaryAmount,
    }));
  }, [rows, focusMonth]);

  const welfareSum = useMemo(() => {
    if (!announcementInputs) return 0;
    return sumWelfareScheduledMonth(announcementInputs);
  }, [announcementInputs]);

  const salarySum = useMemo(() => {
    if (!announcementInputs || !showSalaryPortionNoticeMode(operationMode)) return 0;
    let s = 0;
    for (const r of announcementInputs) {
      if (r.salaryMonth <= 0) continue;
      s += Math.round(r.salaryMonth);
    }
    return s;
  }, [announcementInputs, operationMode]);

  const batchedWelfareNotice = useMemo(() => {
    if (rows.length === 0) return "";
    const lo = Math.min(batchFrom, batchTo);
    const hi = Math.max(batchFrom, batchTo);
    return buildWelfareFundBatchedNotice(
      lo,
      hi,
      rows.map((r) => ({
        employeeCode: r.employeeCode,
        name: r.name,
        welfareByMonth: r.welfareByMonth,
      })),
      reserveOptions,
    );
  }, [rows, batchFrom, batchTo, reserveOptions]);

  const welfareNotice = useMemo(() => {
    if (focusMonth == null) return "";
    if (rows.length === 0) {
      return `(${year}년 ${focusMonth}월) 직원이 등록되어 있지 않아 지급액·입금 안내를 만들 수 없습니다. 직원을 등록한 뒤 다시 확인해 주세요.`;
    }
    if (!announcementInputs) return "";
    return buildWelfareFundNotice(focusMonth, announcementInputs, reserveOptions);
  }, [focusMonth, announcementInputs, rows.length, year, reserveOptions]);

  const salaryNotice = useMemo(() => {
    if (focusMonth == null || !announcementInputs) return null;
    return buildSalaryPortionNotice(focusMonth, operationMode, announcementInputs);
  }, [focusMonth, announcementInputs, operationMode]);

  const transferNotice = useMemo(() => {
    if (focusMonth == null || !announcementInputs) return "";
    if (!shouldShowTransferDetailBlock(announcementInputs)) return "";
    return buildTransferAndDetailNotice(focusMonth, announcementInputs, reserveOptions);
  }, [focusMonth, announcementInputs, reserveOptions]);

  const filterBtn = (m: number | null, label: string) => {
    const active = focusMonth === m;
    return (
      <button
        key={m === null ? "all" : m}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setFocusMonth(m)}
        className={
          "rounded-md border px-2.5 py-1 text-xs font-semibold tabular-nums transition-all " +
          (active
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]")
        }
      >
        {label}
      </button>
    );
  };

  const transferAmount = reserveActive ? applyAdditionalReserve(welfareSum) : welfareSum;
  const reserveAddOn = transferAmount - welfareSum;
  const reserveLabel = additionalReserveStatusLabel(reserveStatus);

  return (
    <div className="space-y-4" id="announcement-copy">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          월별 스케줄과 동일한 기준(정기=귀속월, 분기·선택 복지=지급월)으로 합계를 계산합니다. 아래에서 월을 바꾸면
          멘트가 갱신됩니다.
        </p>
        <p
          className={
            "mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold " +
            (reserveActive
              ? "border-[color:color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] text-[var(--accent-dim)]"
              : "border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)]")
          }
          aria-live="polite"
        >
          <span aria-hidden>{reserveActive ? "●" : "○"}</span>
          {reserveLabel}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="안내 멘트 기준 월">
          {filterBtn(null, "전체")}
          {MONTHS.map((m) => filterBtn(m, `${m}월`))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-4">
          <p className="w-full text-xs font-semibold text-[var(--text)]">묶음 안내(여러 달·개인 스타일)</p>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            시작 월
            <select
              className="input w-[5.5rem] text-xs"
              value={batchFrom}
              onChange={(e) => setBatchFrom(Number(e.target.value))}
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            끝 월
            <select
              className="input w-[5.5rem] text-xs"
              value={batchTo}
              onChange={(e) => setBatchTo(Number(e.target.value))}
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </label>
          <p className="max-w-md pb-1 text-[0.7rem] leading-snug text-[var(--muted)]">
            직원별로 월별 지급액만 합산해 통장 이체 총액과 &ldquo;N월: 금액&rdquo; 블록을 만듭니다. 아래 4번 복사본을
            사용하세요.
          </p>
        </div>
      </div>

      {focusMonth != null ? (
        <div className="grid gap-3 rounded-xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/20 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {reserveActive ? (
            <>
              <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--surface)] p-3">
                <p className="dash-eyebrow">통장 입금액 (적립금 포함)</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--accent)]">
                  {fmt(transferAmount)}원
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  근로자 지급 {fmt(welfareSum)}원 + 적립 {fmt(reserveAddOn)}원
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className="dash-eyebrow">근로자 지급 합계 (참고)</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--text)]">{fmt(welfareSum)}원</p>
                <p className="mt-1 text-xs text-[var(--muted)]">근로자에게 실제로 나가는 총액입니다.</p>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--surface)] p-3">
              <p className="dash-eyebrow">통장 입금액 (적립금 가산 없음)</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--accent)]">{fmt(welfareSum)}원</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                자본금 50% 적립 완료 — 근로자 지급 합계로 입금하시면 됩니다.
              </p>
            </div>
          )}
          {showSalaryPortionNoticeMode(operationMode) && salarySum > 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="dash-eyebrow">급여분(월 환산) 합계</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--text)]">{fmt(salarySum)}원</p>
              <p className="mt-1 text-xs text-[var(--muted)]">급여 이체·지급 시 참고 금액입니다.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <section
        className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]/30 p-4"
        aria-labelledby="announcement-copy-blocks"
      >
        <h2 id="announcement-copy-blocks" className="text-base font-bold text-[var(--text)]">
          복사용 멘트
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
          <CopyTextBlock title="1) 사내근로복지기금 지급 안내" body={welfareNotice} disabled={focusMonth == null} />
          {showSalaryPortionNoticeMode(operationMode) ? (
            <CopyTextBlock
              title="2) 급여분(월 환산 급여) 안내"
              body={salaryNotice ?? ""}
              disabled={focusMonth == null || !salaryNotice}
            />
          ) : null}
          {shouldShowTransferDetailBlock(rows) ? (
            <CopyTextBlock
              title="3) 통장 이체·반환·알아서금액"
              body={transferNotice}
              disabled={focusMonth == null || !transferNotice}
            />
          ) : null}
          <CopyTextBlock
            title={`4) ${Math.min(batchFrom, batchTo)}월~${Math.max(batchFrom, batchTo)}월 묶음 안내`}
            body={batchedWelfareNotice}
            disabled={rows.length === 0}
          />
        </div>
      </section>
    </div>
  );
}
