"use client";

import { useActionState } from "react";
import { recordVendorContributionAction, type VendorActionState } from "@/app/actions/vendors";
import type { Vendor } from "@/types/models";

export function VendorContributionEntryForm({ vendors }: { vendors: Vendor[] }) {
  const [state, formAction] = useActionState<VendorActionState, FormData>(recordVendorContributionAction, null);

  const activeList = vendors.filter((v) => v.active);
  const disabledAll = activeList.length === 0;

  return (
    <form action={formAction} className="surface max-w-2xl space-y-4 p-6">
      <h2 className="text-sm font-semibold">출연금 입력</h2>
      <p className="text-xs text-[var(--muted)]">
        거래처를 선택한 뒤 출연금(원)을 입력하면 추가 적립이 규칙에 따라 반영됩니다. 개인은 출연금의 20% 전액, 법인은
        자본금의 50% 한도까지 매번 min(20%×출연금, 남은 한도)입니다.
      </p>
      {state?.오류 && <p className="text-sm text-[var(--danger)]">{state.오류}</p>}
      {state?.성공 && <p className="text-sm text-[var(--success)]">반영되었습니다.</p>}

      <div>
        <label className="text-xs text-[var(--muted)]">거래처</label>
        <select
          name="vendorId"
          required
          disabled={disabledAll}
          className="input mt-1 block w-full"
          defaultValue=""
        >
          <option value="" disabled>
            {disabledAll ? "활성 거래처가 없습니다" : "선택하세요"}
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
          <label className="text-xs text-[var(--muted)]">출연금(원)</label>
          <input
            name="amount"
            type="number"
            min={1}
            step={1}
            required
            disabled={disabledAll}
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">발생일 (선택)</label>
          <input name="occurredAt" type="date" disabled={disabledAll} className="input mt-1 w-full" />
        </div>
      </div>

      <div>
        <label className="text-xs text-[var(--muted)]">비고</label>
        <input name="note" disabled={disabledAll} className="input mt-1 w-full" />
      </div>

      <button type="submit" disabled={disabledAll} className="btn btn-primary">
        적립 반영
      </button>
    </form>
  );
}
