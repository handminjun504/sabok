"use client";

import { useActionState } from "react";
import { recordVendorContributionAction, type VendorActionState } from "@/app/actions/vendors";

export function VendorContributionForm({ vendorId, disabled }: { vendorId: string; disabled?: boolean }) {
  const [state, formAction] = useActionState<VendorActionState, FormData>(recordVendorContributionAction, null);

  return (
    <form action={formAction} className="surface space-y-3 p-4">
      <input type="hidden" name="vendorId" value={vendorId} />
      <h2 className="text-sm font-semibold">출연금 등록</h2>

      {state?.오류 && <p className="text-sm text-[var(--danger)]">{state.오류}</p>}
      {state?.성공 && <p className="text-sm text-[var(--success)]">반영되었습니다.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--muted)]">출연금(원)</label>
          <input name="amount" type="number" min={1} step={1} required disabled={disabled} className="mt-1 input" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">발생일 (선택)</label>
          <input name="occurredAt" type="date" disabled={disabled} className="mt-1 input" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--muted)]">비고</label>
          <input name="note" disabled={disabled} className="mt-1 input" />
        </div>
      </div>
      <button type="submit" disabled={disabled} className="btn btn-primary">
        출연금 반영
      </button>
    </form>
  );
}
