"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateTenantReserveBalanceAction,
  type TenantReserveState,
} from "@/app/actions/tenant-reserve";
import { CommaWonInput } from "@/components/CommaWonInput";
import {
  CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL,
  tenantReserveBalanceAsOfLabel,
  tenantReserveTotalSumWon,
} from "@/lib/domain/vendor-reserve";
import type { Tenant } from "@/types/models";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

/**
 * 「현재 통장 잔고」 + 기준(연·월) 입력 폼.
 *
 * 운영자는 SABOK 통장에서 확인한 잔고를 그대로 입력하고 그 시점(YYYY년 M월) 을 적는다.
 * 자본금 50% 한도(법인)에 비추어 「얼마나 더 적립해야 하는가」 를 즉각 보여 준다.
 *
 * 마이그레이션 호환: tenant.reserveBalanceWon === null 이면 구버전 월별 입력
 * (`reserveMonthlyByYearWon`) + 호환 단일값(`accumulatedReserveTotalWon`) 합산을 보여 준다.
 */
export function TenantReserveBalanceForm({
  tenant,
  /** UI 디폴트 연·월(잔고 미입력 신규 테넌트용). 보통 대시보드의 활성 연도. */
  defaultYear,
  defaultMonth,
}: {
  tenant: Tenant;
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<TenantReserveState, FormData>(
    updateTenantReserveBalanceAction,
    null,
  );
  const [editing, setEditing] = useState(false);

  const initial = useMemo(() => deriveInitial(tenant, defaultYear, defaultMonth), [
    tenant,
    defaultYear,
    defaultMonth,
  ]);
  const [balance, setBalance] = useState<number>(initial.balance);
  const [year, setYear] = useState<number>(initial.year);
  const [month, setMonth] = useState<number>(initial.month);

  useEffect(() => {
    if (!editing) {
      setBalance(initial.balance);
      setYear(initial.year);
      setMonth(initial.month);
    }
  }, [initial, editing]);

  useEffect(() => {
    if (state?.성공) {
      setEditing(false);
      router.refresh();
    }
  }, [state?.성공, router]);

  /** 화면 표시 누적값 — 편집 중이면 입력 잔고, 비편집 모드면 저장값 우선(없으면 폴백). */
  const displayedAccumulated = useMemo(() => {
    if (editing) return Math.max(0, Math.round(balance));
    return tenantReserveTotalSumWon(
      tenant.reserveMonthlyByYearWon,
      tenant.accumulatedReserveTotalWon,
      tenant.reserveBalanceWon,
    );
  }, [editing, balance, tenant]);

  const isCorporate = tenant.clientEntityType === "CORPORATE";
  const capWon =
    isCorporate && tenant.headOfficeCapital != null && tenant.headOfficeCapital > 0
      ? Math.round(tenant.headOfficeCapital * CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL)
      : null;
  const cannotAssess = isCorporate && (capWon == null || capWon <= 0);
  const progress =
    capWon != null && capWon > 0
      ? Math.min(100, Math.round((displayedAccumulated / capWon) * 100))
      : 0;
  const isComplete = capWon != null && capWon > 0 && displayedAccumulated >= capWon;
  const remaining = capWon != null ? Math.max(0, capWon - displayedAccumulated) : null;

  const savedAsOfLabel = tenantReserveBalanceAsOfLabel(tenant.reserveBalanceAsOfYearMonth);
  const usingLegacyFallback =
    tenant.reserveBalanceWon == null &&
    tenantReserveTotalSumWon(
      tenant.reserveMonthlyByYearWon,
      tenant.accumulatedReserveTotalWon,
    ) > 0;

  function cancelEdit() {
    setEditing(false);
    setBalance(initial.balance);
    setYear(initial.year);
    setMonth(initial.month);
  }

  return (
    <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-balance-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="reserve-balance-heading" className="text-sm font-bold text-[var(--text)]">
            적립금 — 현재 통장 잔고
          </h2>
          {!editing && tenant.reserveBalanceWon != null && savedAsOfLabel ? (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{savedAsOfLabel} 잔고</p>
          ) : null}
          {!editing && usingLegacyFallback ? (
            <p className="mt-0.5 text-xs text-[var(--warn,#b45309)]">
              구버전 월별 입력값을 표시 중입니다. 「수정」 으로 통장 잔고 단일 값으로 전환하세요.
            </p>
          ) : null}
        </div>
        {!editing ? (
          <button type="button" className="btn btn-primary shrink-0" onClick={() => setEditing(true)}>
            수정
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <p className="dash-eyebrow">현재 잔고</p>
          <p className="mt-1 font-bold tabular-nums text-[var(--accent)]">
            {fmt(displayedAccumulated)}원
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <p className="dash-eyebrow">한도 (자본금 50%)</p>
          {isCorporate ? (
            cannotAssess ? (
              <p className="mt-1 font-bold tabular-nums text-[var(--warn)]">자본금 미입력</p>
            ) : (
              <p className="mt-1 font-bold tabular-nums text-[var(--text)]">{fmt(capWon!)}원</p>
            )
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">개인 · 한도 없음</p>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <p className="dash-eyebrow">추가 적립 필요</p>
          {isCorporate && !cannotAssess ? (
            isComplete ? (
              <p className="mt-1 font-bold tabular-nums text-[var(--success,#166534)]">완료</p>
            ) : (
              <p className="mt-1 font-bold tabular-nums text-[var(--text)]">
                {fmt(remaining ?? 0)}원
              </p>
            )
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">—</p>
          )}
        </div>
      </div>

      {isCorporate && !cannotAssess ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-xs text-[var(--muted)]">
              <span className="font-bold tabular-nums text-[var(--accent)]">{fmt(displayedAccumulated)}</span>
              <span className="mx-1">/</span>
              <span className="tabular-nums">{fmt(capWon!)}</span>
              <span className="ml-1">원</span>
              {remaining != null && remaining > 0 ? (
                <span className="ml-2 text-[var(--muted)]">남은 한도 {fmt(remaining)}원</span>
              ) : null}
            </span>
            <span className="text-xs font-bold tabular-nums text-[var(--text)]">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] border border-[var(--border)]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: isComplete
                  ? "var(--success)"
                  : "linear-gradient(90deg, var(--accent) 0%, var(--accent-dim) 100%)",
              }}
            />
          </div>
          {isComplete ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--success-soft,#dcfce7)] px-2.5 py-1 text-xs font-semibold text-[var(--success,#166534)]">
              ● 한도 도달
            </p>
          ) : null}
        </div>
      ) : null}

      {state?.오류 ? (
        <p className="mt-3 rounded-md border border-[var(--danger,#fca5a5)] bg-[var(--danger-soft,#fee2e2)] px-3 py-2 text-xs text-[var(--danger,#991b1b)]">
          {state.오류}
        </p>
      ) : null}

      <form action={formAction} className="mt-4">
        <fieldset
          disabled={!editing}
          className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,2fr)]"
        >
          <label className="flex flex-col gap-1">
            <span className="dash-eyebrow">기준 연도</span>
            <select
              name="balanceYear"
              className="input w-full"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions(defaultYear).map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="dash-eyebrow">기준 월</span>
            <select
              name="balanceMonth"
              className="input w-full"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="dash-eyebrow">통장 잔고 (원)</span>
            <CommaWonInput
              name="balanceWon"
              defaultValue={balance}
              className="input w-full"
              onUserChange={(v) => setBalance(Math.max(0, Math.round(v)))}
              placeholder="예) 12,500,000"
            />
          </label>
        </fieldset>

        {editing ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--muted)]">
              잔고를 0원으로 저장하면 「잔고 0 원」 으로 명시되며, 입력칸을 비우고 저장하면 잔고 미입력 상태로 초기화됩니다.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                취소
              </button>
              <button type="submit" className="btn btn-primary">
                저장
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function deriveInitial(tenant: Tenant, defaultYear: number, defaultMonth: number) {
  const balance = (() => {
    const v = tenant.reserveBalanceWon;
    if (v != null && Number.isFinite(v) && v >= 0) return Math.round(v);
    /** 잔고 미입력이면 구버전 합산값을 입력 디폴트로 채워 줘서 1회 저장만으로 마이그레이션. */
    return tenantReserveTotalSumWon(
      tenant.reserveMonthlyByYearWon,
      tenant.accumulatedReserveTotalWon,
    );
  })();
  const asOf = tenant.reserveBalanceAsOfYearMonth;
  const m = asOf ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(asOf) : null;
  const year = m ? Number(m[1]) : Math.max(1900, Math.min(9999, Math.round(defaultYear)));
  const month = m ? Number(m[2]) : Math.max(1, Math.min(12, Math.round(defaultMonth)));
  return { balance, year, month };
}

function yearOptions(activeYear: number): number[] {
  /** 활성 연도 ±5 년 + 입력값에 들어 있을 수 있는 과거 데이터를 보존하기 위한 넉넉한 범위. */
  const start = activeYear - 5;
  const end = activeYear + 1;
  const out: number[] = [];
  for (let y = start; y <= end; y++) out.push(y);
  return out;
}
