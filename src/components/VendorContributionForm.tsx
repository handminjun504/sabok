"use client";

import { useActionState } from "react";
import { recordVendorContributionAction, type VendorActionState } from "@/app/actions/vendors";

export function VendorContributionForm({ vendorId, disabled }: { vendorId: string; disabled?: boolean }) {
  const [state, formAction] = useActionState<VendorActionState, FormData>(recordVendorContributionAction, null);

  return (
    <form action={formAction} className="surface space-y-3 p-4">
      <input type="hidden" name="vendorId" value={vendorId} />
      <h2 className="text-sm font-semibold">출연금 등록</h2>
      <p className="text-xs text-[var(--muted)]">
        출연금 C에 대해 추가 적립은 개인 20% 전액, 법인은 자본금의 50% 한도까지 매번 min(20%×C, 남은 한도)입니다.
      </p>
      {state?.오류 && <p className="text-sm text-[var(--danger)]">{state.오류}</p>}
      {state?.성공 && <p className="text-sm text-[var(--success)]">반영되었습니다.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--muted)]">출연금(원)</label>
          <input name="amount" type="number" min={1} step={1} required disabled={disabled} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">발생일 (선택, ISO)</label>
          <input name="occurredAt" type="date" disabled={disabled} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--muted)]">비고</label>
          <input name="note" disabled={disabled} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
      </div>
      <button type="submit" disabled={disabled} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50">
        출연금 반영
      </button>
    </form>
  );
}
