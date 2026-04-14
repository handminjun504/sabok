"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateTenantProfileAction, type TenantProfileState } from "@/app/actions/tenant-profile";
import { CommaWonInput } from "@/components/CommaWonInput";
import { TENANT_OPERATION_MODES } from "@/lib/domain/tenant-profile";
import type { Tenant } from "@/types/models";

export function DashboardTenantProfileForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [state, formAction] = useActionState<TenantProfileState, FormData>(updateTenantProfileAction, null);
  const [editing, setEditing] = useState(false);
  /** 취소 시 폼을 remount해 defaultValue 초기화 */
  const [formKey, setFormKey] = useState(0);

  const fieldsLocked = !editing;

  useEffect(() => {
    if (state?.성공) {
      setEditing(false);
      router.refresh();
    }
  }, [state?.성공, router]);

  function cancelEdit() {
    setEditing(false);
    setFormKey((k) => k + 1);
  }

  return (
    <section className="surface-prominent dash-panel-pad" aria-labelledby="tenant-reg-info">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tenant-reg-info" className="text-sm font-bold text-[var(--text)]">
            거래처 등록 정보
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {editing
              ? "변경 후 저장하세요. 취소하면 수정 전 내용으로 돌아갑니다."
              : "수정하기를 누른 뒤에만 편집할 수 있습니다."}
          </p>
        </div>
        {!editing ? (
          <button type="button" className="btn btn-primary shrink-0" onClick={() => setEditing(true)}>
            수정하기
          </button>
        ) : null}
      </div>
      {state?.오류 ? <p className="mt-3 text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="mt-3 text-sm text-[var(--success)]">저장되었습니다.</p> : null}

      <form
        key={formKey}
        action={editing ? formAction : undefined}
        onSubmit={(e) => {
          if (!editing) e.preventDefault();
        }}
        className="mt-3 space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="dash-eyebrow mb-1 block">
              거래처명
            </label>
            <input
              name="name"
              required
              className="input w-full text-xs"
              defaultValue={tenant.name}
              disabled={fieldsLocked}
            />
          </div>
          <div>
            <label className="dash-eyebrow mb-1 block">
              코드
            </label>
            <div className="input w-full cursor-default border-[var(--border)] bg-[var(--surface-hover)] py-[0.3rem] font-mono text-xs text-[var(--text)]">
              {tenant.code}
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted)]">코드는 변경할 수 없습니다.</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="dash-eyebrow mb-1 block">
              개인·법인 적립 구분
            </span>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--text)]">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="clientEntityType"
                  value="INDIVIDUAL"
                  defaultChecked={tenant.clientEntityType === "INDIVIDUAL"}
                  disabled={fieldsLocked}
                />
                <span>개인</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="clientEntityType"
                  value="CORPORATE"
                  defaultChecked={tenant.clientEntityType === "CORPORATE"}
                  disabled={fieldsLocked}
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
                    disabled={fieldsLocked}
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
          <p className="sm:col-span-2 lg:col-span-3 text-xs text-[var(--muted)]">
            인가번호·사업자등록번호는{" "}
            <Link href="/dashboard/operating-report" className="text-[var(--accent)] hover:underline">
              운영상황 보고
            </Link>
            에서 수정합니다.
          </p>
          <div>
            <label className="dash-eyebrow mb-1 block">
              본사 자본금 (원)
            </label>
            <CommaWonInput
              name="headOfficeCapital"
              defaultValue={tenant.headOfficeCapital}
              className="input w-full text-xs"
              disabled={fieldsLocked}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="dash-eyebrow mb-1 block">
              메모
            </label>
            <textarea
              name="memo"
              rows={3}
              className="input min-h-[3.5rem] w-full resize-y text-xs"
              defaultValue={tenant.memo ?? ""}
              disabled={fieldsLocked}
              placeholder="협의 사항·특이 운영 등"
            />
          </div>
        </div>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary">
              저장
            </button>
            <button type="button" className="btn btn-outline" onClick={cancelEdit}>
              취소
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
