"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveBaseAssetAnnualAction,
  type OperatingReportActionState,
} from "@/app/actions/operating-report";
import { CommaWonInput } from "@/components/CommaWonInput";
import type { BaseAssetAnnual } from "@/types/models";

type Props = {
  year: number;
  record: BaseAssetAnnual | null;
  autoPrevYearEndTotal: number;
  autoEmployerContribution: number;
  autoNonEmployerContribution: number;
  autoBaseAssetUsed: number;
};

function f(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function BaseAssetAnnualForm({
  year,
  record,
  autoPrevYearEndTotal,
  autoEmployerContribution,
  autoNonEmployerContribution,
  autoBaseAssetUsed,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<OperatingReportActionState, FormData>(
    saveBaseAssetAnnualAction,
    null,
  );

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  /** 로컬 추정치: 행합 표시를 즉시 반영하기 위함 */
  const [prev, setPrev] = useState<number>(record?.prevYearEndTotal ?? autoPrevYearEndTotal);
  const [emp, setEmp] = useState<number>(
    record?.employerContributionOverride ?? autoEmployerContribution,
  );
  const [invest, setInvest] = useState<number>(record?.investReturnAndCarryover ?? 0);
  const [nonEmp, setNonEmp] = useState<number>(
    record?.nonEmployerContributionOverride ?? autoNonEmployerContribution,
  );
  const [merger, setMerger] = useState<number>(record?.mergerIn ?? 0);
  const [split, setSplit] = useState<number>(record?.splitOut ?? 0);
  const [endOverride, setEndOverride] = useState<number | null>(
    record?.currentYearEndTotalOverride ?? null,
  );

  const subtotal = useMemo(
    () => emp + invest + nonEmp + merger - autoBaseAssetUsed - split,
    [emp, invest, nonEmp, merger, autoBaseAssetUsed, split],
  );
  const endTotalAuto = prev + subtotal;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="year" value={year} />

      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}

      <div className="surface-inset dash-panel-pad space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="⑫ 직전 회계연도 말 기본재산 총액">
            <CommaWonInput
              name="prevYearEndTotal"
              defaultValue={record?.prevYearEndTotal ?? autoPrevYearEndTotal}
              onUserChange={setPrev}
              className="input w-full text-sm"
            />
            <Hint>
              자동: <b>{f(autoPrevYearEndTotal)}</b>원 (전년도 ⑳)
            </Hint>
          </Field>
          <Field label="⑬ 사업주 출연">
            <CommaWonInput
              name="employerContributionOverride"
              defaultValue={record?.employerContributionOverride ?? autoEmployerContribution}
              onUserChange={setEmp}
              className="input w-full text-sm"
            />
            <Hint>
              자동: <b>{f(autoEmployerContribution)}</b>원 (vendor_contributions 사업주 합계)
            </Hint>
          </Field>
          <Field label="⑭ 수익금·이월금 전입">
            <CommaWonInput
              name="investReturnAndCarryover"
              defaultValue={record?.investReturnAndCarryover ?? null}
              onUserChange={setInvest}
              className="input w-full text-sm"
            />
            <Hint>수동 입력 항목.</Hint>
          </Field>
          <Field label="⑮ 사업주 외의 자 출연">
            <CommaWonInput
              name="nonEmployerContributionOverride"
              defaultValue={record?.nonEmployerContributionOverride ?? autoNonEmployerContribution}
              onUserChange={setNonEmp}
              className="input w-full text-sm"
            />
            <Hint>
              자동: <b>{f(autoNonEmployerContribution)}</b>원 (vendor_contributions 사업주 외 합계)
            </Hint>
          </Field>
          <Field label="⑯ 기금법인 합병">
            <CommaWonInput
              name="mergerIn"
              defaultValue={record?.mergerIn ?? null}
              onUserChange={setMerger}
              className="input w-full text-sm"
            />
          </Field>
          <Field label="⑱ 기금법인 분할 등">
            <CommaWonInput
              name="splitOut"
              defaultValue={record?.splitOut ?? null}
              onUserChange={setSplit}
              className="input w-full text-sm"
            />
          </Field>
          <Field label="⑰ 기본재산 사용 (자동)">
            <div className="input flex w-full items-center text-sm font-mono tabular-nums text-[var(--muted)]">
              {f(autoBaseAssetUsed)}
            </div>
            <Hint>연간 지급 총액(summary.totalYearlyWelfare)과 동일.</Hint>
          </Field>
          <Field label="⑳ 해당 회계연도 말 기본재산 총액">
            <CommaWonInput
              name="currentYearEndTotalOverride"
              defaultValue={record?.currentYearEndTotalOverride ?? null}
              onUserChange={(n) => setEndOverride(n || null)}
              className="input w-full text-sm"
              placeholder={`자동: ${f(endTotalAuto)}`}
            />
            <Hint>
              비어 있으면 ⑫+⑲ = <b>{f(endTotalAuto)}</b> 원 자동 사용.
            </Hint>
          </Field>
        </div>

        <div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
          <DerivedRow label="⑲ 소계 (⑬+⑭+⑮+⑯ − ⑰+⑱)" value={subtotal} />
          <DerivedRow
            label="⑳ 당해 말 총액(자동)"
            value={endOverride ?? endTotalAuto}
            emphasis={endOverride != null}
          />
        </div>
      </div>

      <button type="submit" className="btn btn-primary text-sm">
        기본재산 저장
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="dash-field-label">{label}</label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{children}</p>;
}

function DerivedRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-hover)]/40 px-3 py-2">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span
        className={
          "font-mono tabular-nums text-sm " +
          (emphasis ? "text-[var(--warn)] font-semibold" : "text-[var(--text)]")
        }
      >
        {f(value)}
      </span>
    </div>
  );
}
