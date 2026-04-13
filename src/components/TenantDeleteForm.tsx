"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteTenantAction, type TenantDeleteState } from "@/app/actions/tenant-admin";

const inputClass =
  "mt-1 w-full max-w-[10rem] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs text-[var(--text)]";

export function TenantDeleteForm({ tenantId, tenantCode }: { tenantId: string; tenantCode: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<TenantDeleteState, FormData>(deleteTenantAction, null);

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  return (
    <form
      action={formAction}
      className="mt-2 space-y-1 border-t border-[var(--border)] pt-2"
      onSubmit={(e) => {
        if (
          !confirm(
            `「${tenantCode}」거래처와 소속 직원·설정·감사로그(해당 업체)까지 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <label className="block text-[10px] text-[var(--muted)]">
        삭제 확인 (코드 입력)
        <input
          name="confirmCode"
          className={inputClass}
          placeholder={tenantCode}
          autoComplete="off"
          required
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-[var(--danger)] hover:underline disabled:opacity-50"
      >
        {pending ? "삭제 중…" : "거래처 삭제"}
      </button>
      {state?.오류 ? <p className="text-xs text-[var(--danger)]">{state.오류}</p> : null}
    </form>
  );
}
