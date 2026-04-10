"use client";

import { useActionState } from "react";
import { recordVendorContributionAction, type VendorActionState } from "@/app/actions/vendors";
import type { Vendor } from "@/types/models";

export function VendorContributionEntryForm({ vendors }: { vendors: Vendor[] }) {
  const [state, formAction] = useActionState<VendorActionState, FormData>(recordVendorContributionAction, null);

  const activeList = vendors.filter((v) => v.active);
  const disabledAll = activeList.length === 0;

  return (
    <form action={formAction} className="surface max-w-2xl space-y-5 p-5 sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">출연금 입력</h2>
      <p className="text-sm text-[var(--muted)]">출연처·금액 선택 후 반영</p>
      {state?.오류 && <p className="text-[0.9375rem] leading-relaxed text-[var(--danger)]">{state.오류}</p>}
      {state?.성공 && <p className="text-[0.9375rem] text-[var(--success)]">반영되었습니다.</p>}

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--muted)]">출연처</label>
        <select
          name="vendorId"
          required
          disabled={disabledAll}
          className="input block w-full"
          defaultValue=""
        >
          <option value="" disabled>
            {disabledAll ? "활성 출연처가 없습니다" : "선택하세요"}
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id} disabled={!v.active}>
              {v.code} — {v.name}
              {!v.active ? " (비활성)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">출연금(원)</label>
          <input
            name="amount"
            type="number"
            min={1}
            step={1}
            required
            disabled={disabledAll}
            className="input w-full"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">발생일 (선택)</label>
          <input name="occurredAt" type="date" disabled={disabledAll} className="input w-full" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--muted)]">비고</label>
        <input name="note" disabled={disabledAll} className="input w-full" />
      </div>

      <button type="submit" disabled={disabledAll} className="btn btn-primary">
        적립 반영
      </button>
    </form>
  );
}
