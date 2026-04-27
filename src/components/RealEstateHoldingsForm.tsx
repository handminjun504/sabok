"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRealEstateHoldingAction,
  saveRealEstateHoldingAction,
  type OperatingReportActionState,
} from "@/app/actions/operating-report";
import { CommaWonInput } from "@/components/CommaWonInput";
import type { RealEstateHolding } from "@/types/models";

type Props = {
  year: number;
  rows: RealEstateHolding[];
};

function f(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function RealEstateHoldingsForm({ year, rows }: Props) {
  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const nextSeq = rows.reduce((m, r) => Math.max(m, r.seq ?? 0), 0) + 1;

  return (
    <div className="space-y-4">
      <div className="surface-inset dash-panel-pad space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">부동산 현황 (㉓·㉔·㉕)</h3>
          <div className="text-xs text-[var(--muted)]">
            보유 총액
            <span className="ml-2 font-mono tabular-nums text-[var(--text)]">{f(totalAmount)}</span>
          </div>
        </header>
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">등록된 부동산이 없습니다. 아래 행에서 추가하세요.</p>
        ) : (
          <div className="space-y-2">
            {rows
              .slice()
              .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
              .map((row) => (
                <ExistingHoldingRow key={row.id} year={year} row={row} />
              ))}
          </div>
        )}
      </div>

      <div className="surface-inset dash-panel-pad space-y-2">
        <h4 className="text-xs font-semibold text-[var(--muted)]">신규 부동산 등록</h4>
        <NewHoldingRow year={year} seq={nextSeq} />
      </div>
    </div>
  );
}

function ExistingHoldingRow({ year, row }: { year: number; row: RealEstateHolding }) {
  const router = useRouter();
  const [saveState, saveAction] = useActionState<OperatingReportActionState, FormData>(
    saveRealEstateHoldingAction,
    null,
  );
  const [delState, delAction] = useActionState<OperatingReportActionState, FormData>(
    deleteRealEstateHoldingAction,
    null,
  );

  const [name, setName] = useState<string>(row.name ?? "");
  const [acquiredAt, setAcquiredAt] = useState<string>(row.acquiredAt ?? "");

  useEffect(() => {
    if (saveState?.성공 || delState?.성공) router.refresh();
  }, [saveState?.성공, delState?.성공, router]);

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/50 p-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <form action={saveAction} id={`re-save-${row.id}`} className="contents">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="seq" value={row.seq ?? 1} />

          <div>
            <label className="dash-field-label">명칭</label>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full text-sm"
              placeholder="예: 본사 사옥"
            />
          </div>
          <div>
            <label className="dash-field-label">취득금액</label>
            <CommaWonInput
              name="amount"
              defaultValue={row.amount ?? null}
              className="input w-full text-sm"
            />
          </div>
          <div>
            <label className="dash-field-label">취득일</label>
            <input
              type="date"
              name="acquiredAt"
              value={acquiredAt}
              onChange={(e) => setAcquiredAt(e.target.value)}
              className="input w-full text-sm"
            />
          </div>
        </form>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            form={`re-save-${row.id}`}
            className="btn btn-primary text-xs"
          >
            수정
          </button>
          <form action={delAction}>
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" className="btn btn-ghost text-xs text-[var(--danger)]">
              삭제
            </button>
          </form>
        </div>
      </div>

      <p className="text-[11px] text-[var(--muted)]">
        현재 저장값: {row.name ?? "(이름 없음)"} · {f(row.amount ?? 0)}원 ·{" "}
        {row.acquiredAt ?? "(취득일 미정)"}
      </p>

      {saveState?.오류 ? <p className="text-[11px] text-[var(--danger)]">{saveState.오류}</p> : null}
      {delState?.오류 ? <p className="text-[11px] text-[var(--danger)]">{delState.오류}</p> : null}
    </div>
  );
}

function NewHoldingRow({ year, seq }: { year: number; seq: number }) {
  const router = useRouter();
  const [state, formAction] = useActionState<OperatingReportActionState, FormData>(
    saveRealEstateHoldingAction,
    null,
  );

  const [name, setName] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [acquiredAt, setAcquiredAt] = useState<string>("");

  useEffect(() => {
    if (state?.성공) {
      setName("");
      setAmount(0);
      setAcquiredAt("");
      router.refresh();
    }
  }, [state?.성공, router]);

  return (
    <form action={formAction} className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/50 p-3">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="seq" value={seq} />

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <div>
          <label className="dash-field-label">명칭</label>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input w-full text-sm"
            placeholder="예: 본사 사옥"
          />
        </div>
        <div>
          <label className="dash-field-label">취득금액</label>
          <CommaWonInput
            name="amount"
            defaultValue={null}
            onUserChange={setAmount}
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="dash-field-label">취득일</label>
          <input
            type="date"
            name="acquiredAt"
            value={acquiredAt}
            onChange={(e) => setAcquiredAt(e.target.value)}
            className="input w-full text-sm"
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary text-xs">
            추가
          </button>
        </div>
      </div>

      <p className="text-[11px] text-[var(--muted)]">
        현재 입력: {name || "(미입력)"} · {f(amount)}원 · {acquiredAt || "(미정)"}
      </p>

      {state?.오류 ? <p className="text-[11px] text-[var(--danger)]">{state.오류}</p> : null}
    </form>
  );
}
