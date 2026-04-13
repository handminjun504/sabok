"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateTenantProfileAction, type TenantProfileState } from "@/app/actions/tenant-profile";
import { CommaWonInput } from "@/components/CommaWonInput";
import { TENANT_OPERATION_MODES } from "@/lib/domain/tenant-profile";
import type { Tenant } from "@/types/models";

export function DashboardTenantProfileForm({ tenant, canEdit }: { tenant: Tenant; canEdit: boolean }) {
  const router = useRouter();
  const [state, formAction] = useActionState<TenantProfileState, FormData>(updateTenantProfileAction, null);

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  return (
    <section className="surface-prominent p-6" aria-labelledby="tenant-reg-info">
      <h2 id="tenant-reg-info" className="text-sm font-bold text-[var(--text)]">
        거래처 등록 정보
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {canEdit
          ? "선임·관리자가 수정할 수 있습니다. 저장 후 상단 거래처 표시에도 반영됩니다."
          : "조회만 가능합니다."}
      </p>
      {state?.오류 ? <p className="mt-3 text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="mt-3 text-sm text-[var(--success)]">저장되었습니다.</p> : null}

      <form
        action={canEdit ? formAction : undefined}
        onSubmit={(e) => {
          if (!canEdit) e.preventDefault();
        }}
        className="mt-4 space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              거래처명
            </label>
            <input
              name="name"
              required
              className="input w-full"
              defaultValue={tenant.name}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              코드
            </label>
            <div className="input w-full cursor-default border-[var(--border)] bg-[var(--surface-hover)] font-mono text-sm text-[var(--text)]">
              {tenant.code}
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted)]">코드는 변경할 수 없습니다.</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              개인·법인 적립 구분
            </span>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--text)]">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="clientEntityType"
                  value="INDIVIDUAL"
                  defaultChecked={tenant.clientEntityType === "INDIVIDUAL"}
                  disabled={!canEdit}
                />
                <span>개인</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="clientEntityType"
                  value="CORPORATE"
                  defaultChecked={tenant.clientEntityType === "CORPORATE"}
                  disabled={!canEdit}
                />
                <span>법인</span>
              </label>
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="mb-2 block text-sm font-medium text-[var(--muted)]">기금 운영 방식</span>
            <div className="space-y-2">
              {TENANT_OPERATION_MODES.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3"
                >
                  <input
                    type="radio"
                    name="operationMode"
                    value={opt.value}
                    defaultChecked={tenant.operationMode === opt.value}
                    disabled={!canEdit}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-[var(--text)]">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              인가번호
            </label>
            <input
              name="approvalNumber"
              className="input w-full"
              defaultValue={tenant.approvalNumber ?? ""}
              disabled={!canEdit}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              사업자등록번호
            </label>
            <input
              name="businessRegNo"
              className="input w-full"
              defaultValue={tenant.businessRegNo ?? ""}
              disabled={!canEdit}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              본사 자본금 (원)
            </label>
            <CommaWonInput
              name="headOfficeCapital"
              defaultValue={tenant.headOfficeCapital}
              className="input w-full"
              disabled={!canEdit}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              메모
            </label>
            <textarea
              name="memo"
              rows={3}
              className="input min-h-[5rem] w-full resize-y"
              defaultValue={tenant.memo ?? ""}
              disabled={!canEdit}
              placeholder="협의 사항·특이 운영 등"
            />
          </div>
        </div>
        {canEdit ? (
          <button type="submit" className="btn btn-primary">
            저장
          </button>
        ) : null}
      </form>
    </section>
  );
}
