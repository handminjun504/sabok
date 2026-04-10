"use client";

import { useActionState } from "react";
import { createVendorAction, type VendorActionState } from "@/app/actions/vendors";

export function VendorCreateForm() {
  const [state, formAction] = useActionState<VendorActionState, FormData>(createVendorAction, null);

  return (
    <form action={formAction} className="surface space-y-4 p-5 sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">거래처 등록</h2>
      {state?.오류 && <p className="text-[0.9375rem] leading-relaxed text-[var(--danger)]">{state.오류}</p>}
      {state?.성공 && <p className="text-[0.9375rem] text-[var(--success)]">등록되었습니다.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">코드</label>
          <input name="code" required className="input w-full" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">거래처명</label>
          <input name="name" required className="input w-full" />
        </div>
        <div className="sm:col-span-2">
          <span className="mb-2 block text-sm font-medium text-[var(--muted)]">사업자 유형</span>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[0.9375rem] leading-snug text-[var(--text)]">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="radio" name="businessType" value="INDIVIDUAL" defaultChecked className="mt-1" />
              <span>개인사업자 (출연금의 20% 항상 추가 적립)</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="radio" name="businessType" value="CORPORATE" className="mt-1" />
              <span>법인 (자본금 50%까지, 출연금의 20% 추가)</span>
            </label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">사업장 자본금(원) — 법인만 필수</label>
          <input name="workplaceCapital" type="number" min={0} defaultValue={0} className="input w-full" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">메모</label>
          <input name="memo" className="input w-full" />
        </div>
      </div>
      <button type="submit" className="btn btn-primary">
        등록
      </button>
    </form>
  );
}
