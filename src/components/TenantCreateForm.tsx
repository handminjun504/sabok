"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createTenantAction, type TenantActionState } from "@/app/actions/tenant-admin";
import { CommaWonInput } from "@/components/CommaWonInput";
import {
  ANNOUNCEMENT_MODES,
  TENANT_OPERATION_MODES,
  type AnnouncementMode,
} from "@/lib/domain/tenant-profile";

const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type TenantCreateFormVariant = "full" | "select";

type Props = {
  variant?: TenantCreateFormVariant;
  /** 모달 등에서 카드 배경 없이 삽입 */
  embed?: boolean;
  /** 등록 성공 시 (예: 모달 닫기) */
  onSuccessClose?: () => void;
};

export function TenantCreateForm({
  variant = "full",
  embed = false,
  onSuccessClose,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<TenantActionState, FormData>(createTenantAction, null);
  const onSelectScreen = variant === "select";
  const showIntro = !embed;
  const [announcementMode, setAnnouncementMode] = useState<AnnouncementMode>("SINGLE");
  const [batchFrom, setBatchFrom] = useState(1);
  const [batchTo, setBatchTo] = useState(3);

  useEffect(() => {
    if (!state?.성공) return;
    onSuccessClose?.();
    router.refresh();
  }, [state?.성공, router, onSuccessClose]);

  return (
    <form action={formAction} className={embed ? "space-y-4 p-5 sm:p-6" : "surface space-y-4 p-5 sm:p-6"}>
      {showIntro ? (
        <>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">
            {onSelectScreen ? "새 거래처(업체) 추가" : "거래처(업체) 등록"}
          </h2>
          <p className="text-sm text-[var(--muted)]">대시보드에서 쓸 거래처를 만듭니다.</p>
        </>
      ) : null}
      {state?.오류 ? <p className="text-[0.9375rem] leading-relaxed text-[var(--danger)]">{state.오류}</p> : null}
      {state?.경고 ? (
        <p className="text-[0.9375rem] leading-relaxed text-[var(--warn)]">{state.경고}</p>
      ) : null}
      {state?.성공 ? (
        <p className="text-[0.9375rem] text-[var(--success)]">
          {onSelectScreen
            ? "등록되었습니다. 목록에서 해당 거래처를 선택해 들어가세요."
            : "등록되었습니다. 거래처 선택 화면에서 확인할 수 있습니다."}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">거래처 코드 (영문·숫자 권장)</label>
          <input name="code" required className="input w-full" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">거래처명</label>
          <input name="name" required className="input w-full" />
        </div>

        <div className="sm:col-span-2">
          <span className="mb-3 block text-sm font-medium text-[var(--text)]">개인·법인 적립 구분</span>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[0.9375rem] leading-snug text-[var(--text)]">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="radio" name="clientEntityType" value="INDIVIDUAL" defaultChecked className="mt-1" />
              <span>개인</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="radio" name="clientEntityType" value="CORPORATE" className="mt-1" />
              <span>법인</span>
            </label>
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className="mb-2 block text-sm font-medium text-[var(--muted)]">기금 운영 방식</span>
          <div className="space-y-2">
            {TENANT_OPERATION_MODES.map((opt, i) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3 transition-colors hover:border-[var(--border-strong)]"
              >
                <input
                  type="radio"
                  name="operationMode"
                  value={opt.value}
                  defaultChecked={i === 0}
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

        <div className="sm:col-span-2">
          <p className="dash-eyebrow mb-2">사업자·등록 정보 (선택)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--muted)]">인가번호</label>
              <input name="approvalNumber" className="input w-full" placeholder="예: 위탁 인가 번호" autoComplete="off" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--muted)]">사업자등록번호</label>
              <input name="businessRegNo" className="input w-full" placeholder="하이픈 포함·생략 모두 가능" autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[var(--muted)]">본사 자본금 (원)</label>
              <CommaWonInput name="headOfficeCapital" className="input w-full text-xs" placeholder="선택" />
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <p className="dash-eyebrow mb-2">안내 멘트 기본 방식</p>
          <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
            대시보드 → 월별 스케줄 → 「안내 멘트」 탭에서 어떤 양식을 기본으로 보여줄지 정합니다.
            <strong className="text-[var(--text)]"> 묶음</strong>은 여러 달을 한 번에 안내(개인사업자 등),
            <strong className="text-[var(--text)]"> 단일월</strong>은 매 달 하나씩 안내(법인 일반).
          </p>
          <div className="space-y-2">
            {ANNOUNCEMENT_MODES.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3 transition-colors hover:border-[var(--border-strong)]"
              >
                <input
                  type="radio"
                  name="announcementMode"
                  value={opt.value}
                  checked={announcementMode === opt.value}
                  onChange={() => setAnnouncementMode(opt.value)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="font-medium text-[var(--text)]">{opt.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div
            className={
              "mt-3 grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-2 " +
              (announcementMode === "BATCHED" ? "" : "opacity-60")
            }
          >
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">묶음 시작 월</label>
              <select
                name="announcementBatchFromMonth"
                className="input w-full text-sm"
                value={batchFrom}
                onChange={(e) => setBatchFrom(Number(e.target.value))}
                disabled={announcementMode !== "BATCHED"}
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">묶음 끝 월</label>
              <select
                name="announcementBatchToMonth"
                className="input w-full text-sm"
                value={batchTo}
                onChange={(e) => setBatchTo(Number(e.target.value))}
                disabled={announcementMode !== "BATCHED"}
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-[var(--muted)]">메모 (선택)</label>
          <textarea name="memo" rows={3} className="input min-h-[3.5rem] w-full resize-y text-xs" placeholder="협의 사항·특이 운영 등" />
        </div>
      </div>
      <button type="submit" className="btn btn-primary">
        등록
      </button>
    </form>
  );
}
