"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateTenantProfileAction, type TenantProfileState } from "@/app/actions/tenant-profile";
import type { Tenant } from "@/types/models";

/** 운영상황 보고에서 인가·사업자번호만 수정(나머지는 현재 값 hidden으로 유지) */
export function OperatingReportTenantIdentifiersForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [state, formAction] = useActionState<TenantProfileState, FormData>(updateTenantProfileAction, null);

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  const cap =
    tenant.headOfficeCapital != null && Number.isFinite(tenant.headOfficeCapital)
      ? String(Math.round(tenant.headOfficeCapital))
      : "";

  return (
    <form action={formAction} className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
      <input type="hidden" name="name" value={tenant.name} />
      <input type="hidden" name="clientEntityType" value={tenant.clientEntityType} />
      <input type="hidden" name="operationMode" value={tenant.operationMode} />
      <input type="hidden" name="memo" value={tenant.memo ?? ""} />
      <input type="hidden" name="headOfficeCapital" value={cap} />
      <p className="text-xs font-medium text-[var(--muted)]">인가번호 · 사업자등록번호 수정</p>
      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text)]">인가번호</label>
          <input
            name="approvalNumber"
            className="input w-full text-xs"
            defaultValue={tenant.approvalNumber ?? ""}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text)]">사업자등록번호</label>
          <input
            name="businessRegNo"
            className="input w-full text-xs"
            defaultValue={tenant.businessRegNo ?? ""}
            autoComplete="off"
          />
        </div>
      </div>
      <button type="submit" className="btn btn-primary text-sm">
        인가·사업자번호 저장
      </button>
    </form>
  );
}
