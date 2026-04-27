"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  saveOperatingReportTenantBasicAction,
  type OperatingReportActionState,
} from "@/app/actions/operating-report";
import type { Tenant } from "@/types/models";
import { CommaWonInput } from "@/components/CommaWonInput";
import { INDUSTRY_CATEGORIES } from "@/lib/domain/industry-categories";

type Props = {
  tenant: Tenant;
};

export function OperatingReportTenantBasicForm({ tenant }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<OperatingReportActionState, FormData>(
    saveOperatingReportTenantBasicAction,
    null,
  );

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  const capDefault =
    tenant.headOfficeCapital != null && Number.isFinite(tenant.headOfficeCapital)
      ? Math.round(tenant.headOfficeCapital)
      : null;

  return (
    <form action={formAction} className="space-y-5">
      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="dash-field-label" htmlFor="or-approval">
            ② 인가번호
          </label>
          <input
            id="or-approval"
            name="approvalNumber"
            className="input w-full text-sm"
            defaultValue={tenant.approvalNumber ?? ""}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="dash-field-label" htmlFor="or-bizreg">
            사업자등록번호
          </label>
          <input
            id="or-bizreg"
            name="businessRegNo"
            className="input w-full text-sm"
            defaultValue={tenant.businessRegNo ?? ""}
            autoComplete="off"
            placeholder="000-00-00000"
          />
        </div>
        <div>
          <label className="dash-field-label" htmlFor="or-incorp">
            ③ 설립등기일
          </label>
          <input
            id="or-incorp"
            name="incorporationDate"
            type="date"
            className="input w-full text-sm"
            defaultValue={tenant.incorporationDate ?? ""}
          />
        </div>
        <div>
          <label className="dash-field-label" htmlFor="or-phone">
            ④ 전화번호
          </label>
          <input
            id="or-phone"
            name="phone"
            type="tel"
            className="input w-full text-sm"
            defaultValue={tenant.phone ?? ""}
            placeholder="02-0000-0000"
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="dash-field-label" htmlFor="or-addr">
            ⑤ 소재지
          </label>
          <input
            id="or-addr"
            name="addressLine"
            className="input w-full text-sm"
            defaultValue={tenant.addressLine ?? ""}
            placeholder="시·도 · 구 · 도로명 주소"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="dash-field-label" htmlFor="or-start">
            ⑥ 회계연도 시작 월(1~12)
          </label>
          <input
            id="or-start"
            name="accountingYearStartMonth"
            type="number"
            min={1}
            max={12}
            className="input w-full text-sm"
            defaultValue={tenant.accountingYearStartMonth ?? ""}
            placeholder="예: 1"
          />
          <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">
            비어 있으면 1월 시작(1.1~12.31)로 간주합니다.
          </p>
        </div>
        <div>
          <label className="dash-field-label" htmlFor="or-ceo">
            ⑦ 대표자
          </label>
          <input
            id="or-ceo"
            name="ceoName"
            className="input w-full text-sm"
            defaultValue={tenant.ceoName ?? ""}
            placeholder="비워 두면 position=대표이사 직원을 자동 사용"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="dash-field-label" htmlFor="or-industry">
            ⑧ 업종 (한국표준산업분류 대분류)
          </label>
          <select
            id="or-industry"
            name="industry"
            className="input w-full text-sm"
            defaultValue={tenant.industry ?? ""}
          >
            <option value="">— 선택 —</option>
            {INDUSTRY_CATEGORIES.map((cat) => (
              <option key={cat.code} value={cat.code}>
                {cat.code}. {cat.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="dash-field-label" htmlFor="or-cap">
            ⑪ 납입자본금 (본사)
          </label>
          <CommaWonInput
            id="or-cap"
            name="headOfficeCapital"
            defaultValue={capDefault}
            className="input w-full text-sm"
            placeholder="원 단위"
          />
          <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">
            운영상황 보고의 ⑪ 칸에 그대로 사용되며, 본사 자본금의 50% 초과분(㉛)을 자동 산출합니다.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary text-sm">
          기본정보 저장
        </button>
      </div>
    </form>
  );
}
