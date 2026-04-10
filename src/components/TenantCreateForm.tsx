"use client";

import { useActionState } from "react";
import { createTenantAction, type TenantActionState } from "@/app/actions/tenant-admin";

export function TenantCreateForm() {
  const [state, formAction] = useActionState<TenantActionState, FormData>(createTenantAction, null);

  return (
    <form action={formAction} className="surface space-y-4 p-5 sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">고객사(업체) 등록</h2>
      <p className="text-sm leading-relaxed text-[var(--muted)]">
        사내근로복지기금을 위탁 운영할 고객사 단위입니다. 등록 후 업체 선택·직원·거래처·적립금 메뉴를 해당 업체 기준으로 씁니다.
      </p>
      {state?.오류 && <p className="text-[0.9375rem] leading-relaxed text-[var(--danger)]">{state.오류}</p>}
      {state?.성공 && <p className="text-[0.9375rem] text-[var(--success)]">등록되었습니다. 업체 관리·업체 선택에서 확인할 수 있습니다.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">업체 코드 (영문·숫자 권장)</label>
          <input name="code" required className="input w-full" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">업체명</label>
          <input name="name" required className="input w-full" />
        </div>
      </div>
      <button type="submit" className="btn btn-primary">
        등록
      </button>
    </form>
  );
}
