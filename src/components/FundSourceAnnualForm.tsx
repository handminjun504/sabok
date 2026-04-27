"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveFundSourceAnnualAction,
  type OperatingReportActionState,
} from "@/app/actions/operating-report";
import { CommaWonInput } from "@/components/CommaWonInput";
import type { FundSourceAnnual, Tenant } from "@/types/models";
import {
  CONTRIB_USAGE_RATIOS,
  PREV_BASE_ASSET_USAGE_RATIOS,
  type ContribUsageRatio,
  type PrevBaseAssetUsageRatio,
} from "@/lib/domain/operating-report";

type Props = {
  year: number;
  tenant: Tenant | null;
  record: FundSourceAnnual | null;
  /** ⑬+⑮ 출연금 합 (㉚ 자동 계산용) */
  contribBase: number;
  /** 본사 자본금 (㉛) */
  headOfficeCapital: number;
  /** ⑳ 당해 말 기본재산 총액 (㉛ 자동 계산용) */
  currentYearEndTotal: number;
  /** ⑫ 직전 말 기본재산 총액 (㉜ 자동 계산용) */
  prevYearEndTotal: number;
  /** ㉞ 이월금 자동(전년도 carryover) */
  autoCarryover: number;
};

function f(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function FundSourceAnnualForm({
  year,
  tenant,
  record,
  contribBase,
  headOfficeCapital,
  currentYearEndTotal,
  prevYearEndTotal,
  autoCarryover,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<OperatingReportActionState, FormData>(
    saveFundSourceAnnualAction,
    null,
  );

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  const defaultContribRatio: ContribUsageRatio =
    record?.contribUsageRatio ?? (tenant?.clientEntityType === "INDIVIDUAL" ? 50 : 80);
  const defaultPrevRatio: PrevBaseAssetUsageRatio =
    record?.prevBaseAssetUsageRatio ?? (tenant?.clientEntityType === "INDIVIDUAL" ? 20 : 25);

  const [contribRatio, setContribRatio] = useState<ContribUsageRatio>(defaultContribRatio);
  const [prevRatio, setPrevRatio] = useState<PrevBaseAssetUsageRatio>(defaultPrevRatio);

  const autoContribAmount = useMemo(
    () => Math.floor((contribBase * contribRatio) / 100),
    [contribBase, contribRatio],
  );
  const halfCapital = Math.floor(headOfficeCapital * 0.5);
  const autoExcess = useMemo(
    () => Math.max(0, currentYearEndTotal - halfCapital),
    [currentYearEndTotal, halfCapital],
  );
  const autoPrevUsage = useMemo(
    () => Math.floor((prevYearEndTotal * prevRatio) / 100),
    [prevYearEndTotal, prevRatio],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="year" value={year} />

      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}

      <div className="surface-inset dash-panel-pad space-y-4">
        <Row label="㉙ 해당 회계연도 기금운용 수익금">
          <CommaWonInput
            name="operationIncome"
            defaultValue={record?.operationIncome ?? null}
            className="input w-full text-sm"
          />
          <Hint>수동 입력(수익 원장 미구현).</Hint>
        </Row>

        <div className="space-y-2">
          <label className="dash-field-label">㉚ 출연금액 범위 사용</label>
          <RadioRatioGroup
            name="contribUsageRatio"
            value={contribRatio}
            options={CONTRIB_USAGE_RATIOS}
            onChange={(n) => setContribRatio(n as ContribUsageRatio)}
            suffix="%"
          />
          <Hint>
            개인사업자 50% / 법인 80%·90% 중 선택. 자동 한도 ={" "}
            <b>{f(autoContribAmount)}</b>원 (= ⑬+⑮ × {contribRatio}%)
          </Hint>
          <CommaWonInput
            name="contribUsageAmount"
            defaultValue={record?.contribUsageAmount ?? null}
            className="input w-full text-sm"
            placeholder={`자동: ${f(autoContribAmount)}`}
          />
        </div>

        <Row label="㉛ 기본재산 × 자본금 50% 초과액">
          <CommaWonInput
            name="excessCapitalUsage"
            defaultValue={record?.excessCapitalUsage ?? null}
            className="input w-full text-sm"
            placeholder={`자동: ${f(autoExcess)}`}
          />
          <Hint>
            자동 = max(0, ⑳ − 본사자본금×50%) = <b>{f(autoExcess)}</b>원
          </Hint>
        </Row>

        <div className="space-y-2">
          <label className="dash-field-label">㉜ 직전 회계연도 기본재산 범위 사용</label>
          <RadioRatioGroup
            name="prevBaseAssetUsageRatio"
            value={prevRatio}
            options={PREV_BASE_ASSET_USAGE_RATIOS}
            onChange={(n) => setPrevRatio(n as PrevBaseAssetUsageRatio)}
            suffix="%"
          />
          <Hint>
            개인사업자 20% / 법인 25%·30% 중 선택. 자동 한도 ={" "}
            <b>{f(autoPrevUsage)}</b>원 (= ⑫ × {prevRatio}%)
          </Hint>
          <CommaWonInput
            name="prevBaseAssetUsageAmount"
            defaultValue={record?.prevBaseAssetUsageAmount ?? null}
            className="input w-full text-sm"
            placeholder={`자동: ${f(autoPrevUsage)}`}
          />
        </div>

        <Row label="㉝ 공동근로복지기금 지원액·50%">
          <CommaWonInput
            name="jointFundSupport"
            defaultValue={record?.jointFundSupport ?? null}
            className="input w-full text-sm"
          />
        </Row>

        <Row label="㉞ 이월금">
          <CommaWonInput
            name="carryover"
            defaultValue={record?.carryover ?? null}
            className="input w-full text-sm"
            placeholder={`자동(전년): ${f(autoCarryover)}`}
          />
        </Row>
      </div>

      <button type="submit" className="btn btn-primary text-sm">
        기금 재원 저장
      </button>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="dash-field-label">{label}</label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-4 text-[var(--muted)]">{children}</p>;
}

function RadioRatioGroup({
  name,
  value,
  options,
  onChange,
  suffix = "",
}: {
  name: string;
  value: number;
  options: readonly number[];
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((n) => (
        <label
          key={n}
          className={
            "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors " +
            (value === n
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]")
          }
        >
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
          />
          <span className="font-mono tabular-nums">
            {n}
            {suffix}
          </span>
        </label>
      ))}
    </div>
  );
}
