"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateTenantReserveMonthlyAction,
  type TenantReserveState,
} from "@/app/actions/tenant-reserve";
import { CommaWonInput } from "@/components/CommaWonInput";
import {
  CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL,
  tenantReserveTotalSumWon,
} from "@/lib/domain/vendor-reserve";
import type { Tenant } from "@/types/models";

const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"] as const;

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

function deriveYearMonthly(tenant: Tenant, year: number): number[] {
  const map = tenant.reserveMonthlyByYearWon ?? {};
  const arr = (map[year] ?? []) as readonly number[];
  return Array.from({ length: 12 }, (_, i) => {
    const v = Math.round(Number(arr[i] ?? 0));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  });
}

export function TenantReserveMonthlyForm({
  tenant,
  activeYear,
}: {
  tenant: Tenant;
  activeYear: number;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<TenantReserveState, FormData>(
    updateTenantReserveMonthlyAction,
    null,
  );
  const [editing, setEditing] = useState(false);
  const [monthly, setMonthly] = useState<number[]>(() => deriveYearMonthly(tenant, activeYear));
  /** tenant prop·연도 변경 시 입력값 동기화 (편집 중이 아닐 때만) */
  useEffect(() => {
    if (!editing) {
      setMonthly(deriveYearMonthly(tenant, activeYear));
    }
  }, [tenant, activeYear, editing]);

  useEffect(() => {
    if (state?.성공) {
      setEditing(false);
      router.refresh();
    }
  }, [state?.성공, router]);

  const sumYear = useMemo(() => monthly.reduce((s, v) => s + Math.max(0, v), 0), [monthly]);
  /** 다른 연도 합 + 호환 단일 필드를 더해 누적치 산정 (현재 화면에서 편집 중인 활성 연도는 제외) */
  const otherYearsSum = useMemo(() => {
    const map = tenant.reserveMonthlyByYearWon ?? {};
    const filtered: Record<number, readonly number[]> = {};
    for (const [k, v] of Object.entries(map)) {
      const yr = Number(k);
      if (Number.isFinite(yr) && yr !== activeYear) filtered[yr] = v;
    }
    return tenantReserveTotalSumWon(filtered, tenant.accumulatedReserveTotalWon);
  }, [tenant.reserveMonthlyByYearWon, tenant.accumulatedReserveTotalWon, activeYear]);
  const accumulated = sumYear + otherYearsSum;

  const isCorporate = tenant.clientEntityType === "CORPORATE";
  const capWon =
    isCorporate && tenant.headOfficeCapital != null && tenant.headOfficeCapital > 0
      ? Math.round(tenant.headOfficeCapital * CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL)
      : null;
  const cannotAssess = isCorporate && (capWon == null || capWon <= 0);
  const progress =
    capWon != null && capWon > 0 ? Math.min(100, Math.round((accumulated / capWon) * 100)) : 0;
  const isComplete = capWon != null && capWon > 0 && accumulated >= capWon;
  const remaining = capWon != null ? Math.max(0, capWon - accumulated) : null;

  function onChangeMonthly(idx: number, value: number) {
    setMonthly((prev) => {
      const next = [...prev];
      next[idx] = Math.max(0, Math.round(value));
      return next;
    });
  }

  function applyEvenly(total: number) {
    const base = Math.floor(total / 12);
    const rem = total - base * 12;
    const next = Array.from({ length: 12 }, (_, i) => (i === 11 ? base + rem : base));
    setMonthly(next);
  }

  function cancelEdit() {
    setEditing(false);
    setMonthly(deriveYearMonthly(tenant, activeYear));
  }

  return (
    <section className="surface-prominent dash-panel-pad" aria-labelledby="reserve-monthly-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="reserve-monthly-heading" className="text-sm font-bold text-[var(--text)]">
            적립금 월별 입력 — {activeYear}년
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {editing
              ? "1~12월 칸에 그달의 적립 금액을 입력한 뒤 저장하세요. 다른 연도 입력값은 그대로 유지됩니다."
              : "수정하기를 누른 뒤에만 편집할 수 있습니다."}
          </p>
        </div>
        {!editing ? (
          <button type="button" className="btn btn-primary shrink-0" onClick={() => setEditing(true)}>
            수정하기
          </button>
        ) : null}
      </div>

      {/* 진행도 카드 */}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <p className="dash-eyebrow">{activeYear}년 합계</p>
          <p className="mt-1 font-bold tabular-nums text-[var(--text)]">{fmt(sumYear)}원</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <p className="dash-eyebrow">누적 (이전 연도 + 호환값 포함)</p>
          <p className="mt-1 font-bold tabular-nums text-[var(--accent)]">{fmt(accumulated)}원</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <p className="dash-eyebrow">자본금 50% 한도</p>
          {isCorporate ? (
            cannotAssess ? (
              <p className="mt-1 font-bold tabular-nums text-[var(--warn)]">자본금 미입력</p>
            ) : (
              <p className="mt-1 font-bold tabular-nums text-[var(--text)]">{fmt(capWon!)}원</p>
            )
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">개인사업자 — 한도 없음</p>
          )}
        </div>
      </div>

      {isCorporate && !cannotAssess ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-xs text-[var(--muted)]">
              <span className="font-bold tabular-nums text-[var(--accent)]">{fmt(accumulated)}</span>
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
              ● 자본금 50% 한도 도달 — 추가 적립 종료
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
        <input type="hidden" name="year" value={activeYear} />

        {editing ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">균등 배분</span>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => applyEvenly(sumYear > 0 ? sumYear : 12_000_000)}
            >
              합계 ÷ 12 적용 (잔차는 12월)
            </button>
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setMonthly(Array(12).fill(0))}>
              모두 0 으로 비우기
            </button>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {MONTH_LABELS.map((label, i) => {
            const m = i + 1;
            return (
              <label key={m} className="flex flex-col gap-1">
                <span className="dash-eyebrow">{label}</span>
                <CommaWonInput
                  name={`m${m}`}
                  defaultValue={monthly[i] ?? 0}
                  className="input w-full text-xs"
                  disabled={!editing}
                  onUserChange={(v) => onChangeMonthly(i, v)}
                />
              </label>
            );
          })}
        </div>

        {editing ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
              취소
            </button>
            <button type="submit" className="btn btn-primary">
              저장
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
