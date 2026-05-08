"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { setTenantActiveFormAction } from "@/app/actions/tenant-admin";
import { switchTenantFormAction } from "@/app/actions/tenant-switch";
import { TenantCreateForm } from "@/components/TenantCreateForm";
import { TenantDeleteForm } from "@/components/TenantDeleteForm";
import {
  tenantClientEntityLabel,
  tenantOperationModeLabel,
} from "@/lib/domain/tenant-profile";
import type { TenantClientEntityType, TenantOperationMode } from "@/lib/domain/tenant-profile";

/** 카드 연도 드롭다운에 노출할 후보. 거래처 활성 연도 ±2 + 다음 연도 까지를 항상 포함. */
function buildYearOptions(activeYear: number): number[] {
  const cy = new Date().getFullYear();
  const set = new Set<number>();
  /** 거래처 활성 연도(=PB 에 저장된 값) 는 항상 포함 — 과거 데이터를 다시 보러 갈 수 있어야 한다. */
  set.add(activeYear);
  /** 현재 달력 기준 ±2년 + 내년 = 최근 운영 + 차기 계획. */
  for (let y = cy - 2; y <= cy + 1; y++) set.add(y);
  return Array.from(set).sort((a, b) => b - a);
}

export type SelectTenantCard = {
  id: string;
  code: string;
  name: string;
  clientEntityType: TenantClientEntityType;
  operationMode: TenantOperationMode;
  businessRegNo: string | null;
  approvalNumber: string | null;
  headOfficeCapital: number | null;
  active: boolean;
  employeeCount?: number;
  /**
   * 거래처별 현재 활성 연도(전사 설정의 `activeYear`).
   * 전사 설정이 아직 없으면 호출자가 현재 달력 연도로 채워 넣는다.
   * 카드의 연도 드롭다운 기본값으로 쓰이며, 입장 시 이 연도와 다르게 선택했다면 서버에서 갱신한다.
   */
  activeYear: number;
  /**
   * 이 거래처에서 활성 연도를 변경할 수 있는지(SENIOR/ADMIN).
   * false 면 카드의 연도 드롭다운을 비활성화하고 잠금 안내를 보여 준다.
   * 서버는 이 값과 무관하게 권한을 다시 검증한다(클라이언트 토글 우회 방지).
   */
  canEditYear: boolean;
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
            <button type="button" className="btn btn-primary px-8" onClick={openCreate}>
              거래처 추가
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-[var(--muted)]">접근 가능한 거래처가 없습니다.</p>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tenants.map((t) => (
            <TenantCard key={t.id} tenant={t} isPlatformAdmin={isPlatformAdmin} />
          ))}
        </div>
      )}

      {/* TenantCard 정의는 컴포넌트 바깥에 둔다 — 매 렌더마다 재생성되지 않게 */}
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

function TenantCard({
  tenant: t,
  isPlatformAdmin,
}: {
  tenant: SelectTenantCard;
  isPlatformAdmin: boolean;
}) {
  const yearOptions = useMemo(() => buildYearOptions(t.activeYear), [t.activeYear]);
  const [selectedYear, setSelectedYear] = useState<number>(t.activeYear);

  /** 부모에서 활성 연도가 갱신되면(예: 다른 카드를 통해 변경) 현재 카드 선택값도 동기화 */
  useEffect(() => {
    setSelectedYear(t.activeYear);
  }, [t.activeYear]);

  const showYearControl = t.active;
  const yearChanged = selectedYear !== t.activeYear;
  const lockedYearControl = !t.canEditYear;
  const handleYearChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (lockedYearControl) return;
      setSelectedYear(Number(e.target.value));
    },
    [lockedYearControl],
  );

  const buttonLabel = yearChanged
    ? `${selectedYear}년으로 들어가기`
    : `이 거래처로 들어가기 (${t.activeYear}년)`;

  return (
    <div
      className={
        "surface-prominent flex h-full flex-col p-5 text-left " +
        (t.active ? "surface-hoverable group" : "opacity-90")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p
            className={
              "text-base font-bold text-[var(--text)] " +
              (t.active ? "group-hover:text-[var(--accent)]" : "")
            }
          >
            {t.name}
          </p>
          {isPlatformAdmin && !t.active ? (
            <span className="dash-eyebrow shrink-0 rounded-md bg-[var(--surface-hover)] px-2 py-0.5 normal-case">
              비활성
            </span>
          ) : null}
        </div>
        <p className="mt-1 font-mono text-xs text-[var(--muted)]">코드 {t.code}</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text)]">
          <span className="font-medium text-[var(--muted)]">적립·운영</span>{" "}
          {tenantClientEntityLabel(t.clientEntityType)} · {tenantOperationModeLabel(t.operationMode)}
        </p>
        {t.approvalNumber ? (
          <p className="mt-1 text-xs text-[var(--muted)]">인가번호 {t.approvalNumber}</p>
        ) : null}
        {t.businessRegNo ? (
          <p className="mt-1 text-xs text-[var(--muted)]">사업자번호 {t.businessRegNo}</p>
        ) : null}
        {t.headOfficeCapital != null ? (
          <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
            본사 자본금 {t.headOfficeCapital.toLocaleString("ko-KR")}원
          </p>
        ) : null}
        {isPlatformAdmin && t.employeeCount != null ? (
          <p className="mt-1 text-xs text-[var(--muted)]">직원 {t.employeeCount}명</p>
        ) : null}
      </div>

      {t.active ? (
        <form action={switchTenantFormAction} className="mt-4 space-y-2.5">
          <input type="hidden" name="tenantId" value={t.id} />
          {showYearControl ? (
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-[var(--muted)]">기준 연도</span>
              <select
                name="year"
                className="input h-8 px-2 py-0 text-xs tabular-nums w-28"
                value={selectedYear}
                onChange={handleYearChange}
                disabled={lockedYearControl}
                aria-label={`${t.name} 기준 연도`}
                title={
                  lockedYearControl
                    ? "선임/관리자만 기준 연도를 변경할 수 있습니다."
                    : `${t.name} 기준 연도 선택`
                }
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}년{y === t.activeYear ? " (현재)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {yearChanged && !lockedYearControl ? (
            <p className="rounded-md border border-[var(--accent-soft,#a7f3d0)] bg-[var(--accent-bg,#ecfdf5)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--accent,#047857)]">
              <strong className="font-semibold">{selectedYear}년</strong>으로 입장하면 거래처 기준 연도가 함께 갱신됩니다. 이전
              연도({t.activeYear}년) 의 레벨 규칙·목표액·분기 요율·월별 메모 자료는 그대로 보존됩니다.
            </p>
          ) : null}
          {lockedYearControl ? (
            <p className="text-[11px] leading-snug text-[var(--muted)]">
              연도 변경은 선임·관리자 권한이 필요합니다. 현재 기준 연도({t.activeYear}년) 로 입장합니다.
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary w-full py-2.5 text-sm">
            {buttonLabel}
          </button>
        </form>
      ) : (
        <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 text-center text-xs text-[var(--muted)]">
          비활성 상태입니다. 아래에서 활성화하면 입장할 수 있습니다.
        </p>
      )}

      {isPlatformAdmin ? (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <p className="dash-eyebrow mb-2">관리</p>
          <form action={setTenantActiveFormAction}>
            <input type="hidden" name="tenantId" value={t.id} />
            <input type="hidden" name="active" value={t.active ? "false" : "true"} />
            <button type="submit" className="text-xs font-medium text-[var(--accent)] hover:underline">
              {t.active ? "비활성화" : "활성화"}
            </button>
          </form>
          <TenantDeleteForm tenantId={t.id} tenantCode={t.code} />
        </div>
      ) : null}
    </div>
  );
}
