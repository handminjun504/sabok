"use client";

import { useActionState } from "react";
import { createVendorAction, type VendorActionState } from "@/app/actions/vendors";

export function VendorCreateForm() {
  const [state, formAction] = useActionState<VendorActionState, FormData>(createVendorAction, null);

  return (
    <form action={formAction} className="surface space-y-3 p-4">
      <h2 className="text-sm font-semibold">거래처 등록</h2>
      {state?.오류 && <p className="text-sm text-[var(--danger)]">{state.오류}</p>}
      {state?.성공 && <p className="text-sm text-[var(--success)]">등록되었습니다.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--muted)]">코드</label>
          <input name="code" required className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">거래처명</label>
          <input name="name" required className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <span className="text-xs text-[var(--muted)]">사업자 유형</span>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="businessType" value="INDIVIDUAL" defaultChecked />
              개인사업자 (출연금의 20% 항상 추가 적립)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="businessType" value="CORPORATE" />
              법인 (자본금 50%까지, 출연금의 20% 추가)
            </label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--muted)]">사업장 자본금(원) — 법인만 필수</label>
          <input name="workplaceCapital" type="number" min={0} defaultValue={0} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--muted)]">메모</label>
          <input name="memo" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
      </div>
      <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
        등록
      </button>
    </form>
  );
}
