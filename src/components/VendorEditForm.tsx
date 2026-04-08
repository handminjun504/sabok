"use client";

import { useActionState } from "react";
import { updateVendorAction, type VendorActionState } from "@/app/actions/vendors";
import type { Vendor } from "@/types/models";

export function VendorEditForm({ vendor }: { vendor: Vendor }) {
  const [state, formAction] = useActionState<VendorActionState, FormData>(updateVendorAction, null);

  return (
    <form action={formAction} className="surface space-y-3 p-4">
      <input type="hidden" name="vendorId" value={vendor.id} />
      <h2 className="text-sm font-semibold">거래처 수정</h2>
      {state?.오류 && <p className="text-sm text-[var(--danger)]">{state.오류}</p>}
      {state?.성공 && <p className="text-sm text-[var(--success)]">저장되었습니다.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--muted)]">코드 (변경 불가)</label>
          <p className="mt-1 font-mono text-sm">{vendor.code}</p>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">거래처명</label>
          <input name="name" required defaultValue={vendor.name} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <span className="text-xs text-[var(--muted)]">사업자 유형</span>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="businessType" value="INDIVIDUAL" defaultChecked={vendor.businessType === "INDIVIDUAL"} />
              개인사업자
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="businessType" value="CORPORATE" defaultChecked={vendor.businessType === "CORPORATE"} />
              법인
            </label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--muted)]">사업장 자본금(원)</label>
          <input
            name="workplaceCapital"
            type="number"
            min={0}
            defaultValue={vendor.workplaceCapital}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={vendor.active} />
            활성
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--muted)]">메모</label>
          <input name="memo" defaultValue={vendor.memo ?? ""} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
      </div>
      <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
        저장
      </button>
    </form>
  );
}
