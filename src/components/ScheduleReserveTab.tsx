"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveReserveProgressNoteAction,
  type ReserveNoteState,
} from "@/app/actions/reserve-progress";
import { DashboardReserveStatusPanel } from "@/components/DashboardReserveStatusPanel";
import type { TenantAdditionalReserveSummary } from "@/lib/domain/vendor-reserve";
import { tenantClientEntityLabel } from "@/lib/domain/tenant-profile";
import type { TenantClientEntityType } from "@/lib/domain/tenant-profile";

export function ScheduleReserveTab({
  summary,
  clientEntityType,
  headOfficeCapitalWon,
  initialNote,
  canEdit,
  settingsMissing,
}: {
  summary: TenantAdditionalReserveSummary;
  clientEntityType: TenantClientEntityType;
  headOfficeCapitalWon: number | null;
  initialNote: string | null;
  canEdit: boolean;
  /** true면 전사 설정 레코드 없음 → 메모 저장 불가 */
  settingsMissing?: boolean;
}) {
  const [state, formAction] = useActionState<ReserveNoteState, FormData>(saveReserveProgressNoteAction, null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (state?.성공) setKey((k) => k + 1);
  }, [state?.성공]);

  const isIndividual = clientEntityType === "INDIVIDUAL";

  const capHalf =
    headOfficeCapitalWon != null && headOfficeCapitalWon > 0
      ? Math.round(headOfficeCapitalWon * 0.5)
      : null;

  const saveDisabled = !canEdit || settingsMissing;

  /**
   * 개인사업자는 항상 +20% 추가 적립이 자동 적용되므로 한도 산정·진행 메모가 의미 없다.
   * → 자본금 영역과 메모 폼을 숨기고, 한 줄 안내 + 누적 패널만 보여 준다.
   */
  if (isIndividual) {
    return (
      <div className="space-y-6">
        {settingsMissing ? (
          <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-sm text-[var(--warn)]">
            전사 설정(sabok_company_settings)이 없습니다. 거래처 생성 후 설정이 생기면 정상 동작합니다.
          </p>
        ) : null}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--text)]">
              적립 구분 ·{" "}
              <span className="font-bold text-[var(--accent)]">
                {tenantClientEntityLabel(clientEntityType)}
              </span>
            </h2>
            <span className="badge badge-accent">항상 +20% 적립</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            개인사업자는 통장 입금 시{" "}
            <strong className="text-[var(--text)]">항상 +20% 추가 적립</strong>이 자동으로 적용됩니다. 법인처럼 자본금
            50% 같은 한도가 없어 별도 “적립 진행 메모”나 “남은 한도 계산”이 필요하지 않습니다 — 그래서 이 화면에서는
            누적 합만 보여드립니다.
          </p>
        </div>

        <DashboardReserveStatusPanel summary={summary} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {settingsMissing ? (
        <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-sm text-[var(--warn)]">
          전사 설정(sabok_company_settings)이 없어 메모를 저장할 수 없습니다. 거래처 생성 후 설정이 생기면 다시
          시도하세요.
        </p>
      ) : null}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-bold text-[var(--text)]">적립 구분·자본금</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          거래처 등록 시 정한 <span className="font-semibold text-[var(--text)]">{tenantClientEntityLabel(clientEntityType)}</span>
          이 통장 입금 시 추가 적립(20%)을 더할지·언제까지 더할지 결정합니다.
        </p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--muted)]">본사 자본금(등록 정보)</dt>
            <dd className="font-semibold tabular-nums text-[var(--text)]">
              {headOfficeCapitalWon != null && headOfficeCapitalWon > 0
                ? `${headOfficeCapitalWon.toLocaleString("ko-KR")}원`
                : "— (미입력)"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">법인 추가 적립 상한 참고(자본금의 50%)</dt>
            <dd className="font-semibold tabular-nums text-[var(--text)]">
              {capHalf != null ? `${capHalf.toLocaleString("ko-KR")}원까지 적립 한도로 자주 쓰입니다.` : "자본금을 넣으면 여기에 계산됩니다."}
            </dd>
          </div>
        </dl>
      </div>

      <DashboardReserveStatusPanel summary={summary} />

      <section className="surface-prominent dash-panel-pad">
        <h2 className="text-base font-bold text-[var(--text)]">적립 계획 메모</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          예: &ldquo;2500만 원 한도 중 800만 원 적립 완료, 남은 1700만 원은 분기별로&rdquo; 처럼 직접 적어 두세요. 안내
          멘트의 통장 입금액과는 별개입니다.
        </p>
        {state?.오류 ? <p className="mt-2 text-sm text-[var(--danger)]">{state.오류}</p> : null}
        {state?.성공 ? <p className="mt-2 text-sm text-[var(--success)]">저장되었습니다.</p> : null}
        <form key={key} action={formAction} className="mt-3 space-y-2">
          <textarea
            name="reserveProgressNote"
            defaultValue={initialNote ?? ""}
            disabled={saveDisabled}
            rows={10}
            className="input min-h-[10rem] w-full resize-y text-sm"
            placeholder="남은 적립액·일정·세무에서 받은 안내 등을 자유롭게 적습니다."
          />
          {!saveDisabled ? (
            <button type="submit" className="btn btn-primary">
              메모 저장
            </button>
          ) : (
            <p className="text-sm text-[var(--warn)]">
              {settingsMissing
                ? "설정 레코드가 생기면 저장할 수 있습니다."
                : "전사 설정을 수정할 권한이 있는 계정만 저장할 수 있습니다."}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
