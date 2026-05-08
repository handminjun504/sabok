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
import type { AnnouncementMode } from "@/lib/domain/tenant-profile";
import type { ScheduleAnnouncementPanelRow } from "@/lib/domain/schedule-announcement-payload";

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
  announcementMode = "SINGLE",
  defaultBatchFromMonth,
  defaultBatchToMonth,
}: {
  year: number;
  rows: ScheduleAnnouncementPanelRow[];
  operationMode: TenantOperationMode;
  /**
   * 거래처 타입 + 자본금 50% 진행도로 산출된 “현재 +20% 적립 활성?” 결과.
   * 이 값을 멘트 빌더와 카드에 그대로 흘려 보낸다.
   */
  reserveStatus: AdditionalReserveStatus;
  /** 거래처 등록 시 정한 기본 안내 방식 — BATCHED 면 묶음 안내 영역을 강조한다. */
  announcementMode?: AnnouncementMode;
  /** 거래처 기본 묶음 시작 월(1~12). 없으면 1월. */
  defaultBatchFromMonth?: number | null;
  /** 거래처 기본 묶음 끝 월(1~12). 없으면 3월. */
  defaultBatchToMonth?: number | null;
}) {
  const reserveActive = reserveStatus.active;
  const reserveOptions = useMemo(
    () => ({ additionalReserveActive: reserveActive }),
    [reserveActive],
  );
  const batchedPreferred = announcementMode === "BATCHED";
  const initialBatchFrom = (() => {
    const v = defaultBatchFromMonth;
    return v != null && v >= 1 && v <= 12 ? v : 1;
  })();
  const initialBatchTo = (() => {
    const v = defaultBatchToMonth;
    return v != null && v >= 1 && v <= 12 ? v : 3;
  })();
  const [focusMonth, setFocusMonth] = useState<number | null>(() => defaultAnnouncementMonth(year));
  const [batchFrom, setBatchFrom] = useState(initialBatchFrom);
  const [batchTo, setBatchTo] = useState(initialBatchTo);

  useEffect(() => {
    setFocusMonth(defaultAnnouncementMonth(year));
  }, [year]);

  /** 거래처 기본값이 바뀌면(프로필 수정 후 새로고침 등) 묶음 구간도 동기화. */
  useEffect(() => {
    if (defaultBatchFromMonth != null && defaultBatchFromMonth >= 1 && defaultBatchFromMonth <= 12) {
      setBatchFrom(defaultBatchFromMonth);
    }
    if (defaultBatchToMonth != null && defaultBatchToMonth >= 1 && defaultBatchToMonth <= 12) {
      setBatchTo(defaultBatchToMonth);
    }
  }, [defaultBatchFromMonth, defaultBatchToMonth]);

  const announcementInputs = useMemo(() => {
    if (focusMonth == null) return null;
    return rows.map((r) => ({
      employeeCode: r.employeeCode,
      name: r.name,
      welfareMonth: r.welfareByMonth[focusMonth] ?? 0,
      /**
       * `announcementSalaryByMonthList`: `floor(연간÷12)` 를 활성 월마다 동일 반복. 길이가 맞지 않으면 `salaryMonth` 바닥 폴백.
       */
      salaryMonth: (() => {
        const idx = focusMonth - 1;
        const list = r.announcementSalaryByMonthList;
        /** 조정 월별 급여로 폴백하지 않음 — 직렬화 유실 시에만 바닥 월액 */
        if (list.length === 12 && idx >= 0 && idx < 12) {
          return list[idx]!;
        }
        return r.salaryMonth;
      })(),
      flagRepReturn: r.flagRepReturn,
      repReturnAmount: r.repReturnByMonth[focusMonth] ?? 0,
      spouseReceiptAmount: r.spouseReceiptByMonth[focusMonth] ?? 0,
      discretionaryAmount: r.discretionaryByMonth[focusMonth] ?? 0,
      customReturns: (r.customReturnsByMonth ?? []).map((c) => ({
        label: c.label,
        amount: c.byMonth[focusMonth] ?? 0,
      })),
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

  /**
   * 「통장 이체·반환·알아서금액」 복사블록 노출 여부 — 어떤 직원이든 1년 어느 달에 보조 항목이 있으면 표시.
   * panel row 의 월별 맵을 한 번 훑어 boolean 으로 환원한다.
   */
  const showTransferDetailCopyBlock = useMemo(() => {
    return rows.some((r) => {
      if (r.flagRepReturn) return true;
      for (let m = 1; m <= 12; m++) {
        if ((r.repReturnByMonth[m] ?? 0) > 0) return true;
        if ((r.spouseReceiptByMonth[m] ?? 0) > 0) return true;
        if ((r.discretionaryByMonth[m] ?? 0) > 0) return true;
      }
      for (const c of r.customReturnsByMonth ?? []) {
        for (let m = 1; m <= 12; m++) {
          if ((c.byMonth[m] ?? 0) > 0) return true;
        }
      }
      return false;
    });
  }, [rows]);

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
          월별 스케줄과 동일한 기준(N월 칸 = N월 귀속분, 분기는 지정한 지급 월)으로 합계를 계산합니다. 아래에서 월을 바꾸면
          멘트가 갱신됩니다. 급여분(월 환산)은 「급여낮추기」 회사는 조정연봉÷12, 그 외에는 기존연봉÷12 의 절사값입니다.
          중도 입·퇴사로 활성월이 12개월 미만이면 마지막 근무월에 정산액(받아야 할 누적 − 급여·사복 누적)을 자동 가산합니다.
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
        <div
          className={
            "mt-4 flex flex-wrap items-end gap-3 border-t pt-4 " +
            (batchedPreferred
              ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]/40 -mx-4 px-4 -mb-4 pb-4 sm:-mx-5 sm:px-5"
              : "border-[var(--border)]")
          }
        >
          <p className="flex w-full items-center gap-2 text-xs font-semibold text-[var(--text)]">
            묶음 안내(여러 달·개인 스타일)
            {batchedPreferred ? (
              <span className="badge badge-accent">거래처 기본</span>
            ) : null}
          </p>
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
        <p className="mt-1 text-xs text-[var(--muted)]">
          거래처 기본 모드:{" "}
          <strong className="text-[var(--text)]">
            {batchedPreferred ? "묶음 안내" : "단일월 안내"}
          </strong>{" "}
          — 거래처 등록·프로필에서 변경할 수 있습니다.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
          {batchedPreferred ? (
            <CopyTextBlock
              title={`1) ${Math.min(batchFrom, batchTo)}월~${Math.max(batchFrom, batchTo)}월 묶음 안내 (거래처 기본)`}
              body={batchedWelfareNotice}
              disabled={rows.length === 0}
            />
          ) : null}
          <CopyTextBlock
            title={`${batchedPreferred ? "2)" : "1)"} 사내근로복지기금 지급 안내`}
            body={welfareNotice}
            disabled={focusMonth == null}
          />
          {showSalaryPortionNoticeMode(operationMode) ? (
            <CopyTextBlock
              title={`${batchedPreferred ? "3)" : "2)"} 급여분(월 환산 급여) 안내`}
              body={salaryNotice ?? ""}
              disabled={focusMonth == null || !salaryNotice}
            />
          ) : null}
          {showTransferDetailCopyBlock ? (
            <CopyTextBlock
              title={`${batchedPreferred ? "4)" : "3)"} 통장 이체·반환·알아서금액`}
              body={transferNotice}
              disabled={focusMonth == null || !transferNotice}
            />
          ) : null}
          {!batchedPreferred ? (
            <CopyTextBlock
              title={`${showTransferDetailCopyBlock ? "4)" : "3)"} ${Math.min(batchFrom, batchTo)}월~${Math.max(batchFrom, batchTo)}월 묶음 안내`}
              body={batchedWelfareNotice}
              disabled={rows.length === 0}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
