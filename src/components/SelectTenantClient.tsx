"use client";

import { useEffect, useState } from "react";
import { switchTenantFormAction } from "@/app/actions/tenant-switch";
import { TenantCreateForm } from "@/components/TenantCreateForm";
import {
  tenantClientEntityLabel,
  tenantOperationModeLabel,
} from "@/lib/domain/tenant-profile";
import type { TenantClientEntityType, TenantOperationMode } from "@/lib/domain/tenant-profile";

export type SelectTenantCard = {
  id: string;
  code: string;
  name: string;
  clientEntityType: TenantClientEntityType;
  operationMode: TenantOperationMode;
  businessRegNo: string | null;
};

type Props = {
  tenants: SelectTenantCard[];
  isPlatformAdmin: boolean;
};

const fabClass =
  "btn btn-primary flex size-12 shrink-0 items-center justify-center rounded-full p-0 text-2xl font-light leading-none shadow-md";

export function SelectTenantClient({ tenants, isPlatformAdmin }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [formMountKey, setFormMountKey] = useState(0);
  const isEmpty = tenants.length === 0;

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCreateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen]);

  const openCreate = () => {
    setFormMountKey((k) => k + 1);
    setCreateOpen(true);
  };

  return (
    <div className="space-y-6">
      {isPlatformAdmin && !isEmpty ? (
        <div className="flex justify-end">
          <button type="button" onClick={openCreate} className={fabClass} aria-label="새 거래처 추가">
            +
          </button>
        </div>
      ) : null}

      {isEmpty ? (
        isPlatformAdmin ? (
          <div className="surface-prominent mx-auto flex max-w-lg flex-col items-center p-10 text-center">
            <p className="text-sm text-[var(--muted)]">
              등록된 거래처가 없습니다. 아래에서 신규 거래처를 등록한 뒤 카드를 눌러 대시보드로 들어가세요.
            </p>
            <button type="button" className="btn btn-primary mt-6 px-8" onClick={openCreate}>
              거래처 추가
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-[var(--muted)]">접근 가능한 거래처가 없습니다.</p>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tenants.map((t) => (
            <form
              key={t.id}
              action={switchTenantFormAction}
              className="surface-prominent surface-hoverable group flex h-full flex-col p-5 text-left"
            >
              <input type="hidden" name="tenantId" value={t.id} />
              <p className="text-base font-bold text-[var(--text)] group-hover:text-[var(--accent)]">{t.name}</p>
              <p className="mt-1 font-mono text-xs text-[var(--muted)]">코드 {t.code}</p>
              {t.businessRegNo ? (
                <p className="mt-1 text-xs text-[var(--muted)]">사업자번호 {t.businessRegNo}</p>
              ) : null}
              <p className="mt-3 flex-1 text-xs leading-relaxed text-[var(--muted)]">
                {tenantClientEntityLabel(t.clientEntityType)} · {tenantOperationModeLabel(t.operationMode)}
              </p>
              <button type="submit" className="btn btn-primary mt-4 w-full py-2.5 text-sm">
                이 거래처로 들어가기
              </button>
            </form>
          ))}
        </div>
      )}

      {isPlatformAdmin && createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tenant-create-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label="닫기"
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative z-10 flex max-h-[min(90vh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h2 id="tenant-create-modal-title" className="text-lg font-semibold tracking-tight text-[var(--text)]">
                새 거래처
              </h2>
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-lg text-xl leading-none text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                onClick={() => setCreateOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <TenantCreateForm
                key={formMountKey}
                variant="select"
                embed
                onSuccessClose={() => setCreateOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
