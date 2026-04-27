"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveContribUsageAnnualAction,
  type OperatingReportActionState,
} from "@/app/actions/operating-report";
import { CommaWonInput } from "@/components/CommaWonInput";
import type { ContribUsageAnnual } from "@/types/models";

type Props = {
  year: number;
  record: ContribUsageAnnual | null;
  /** ⑬+⑮ (출연금 합계) */
  contribBase: number;
  /** ⑫ 직전 회계연도 말 기본재산 총액 */
  prevYearEndTotal: number;
};

function f(n: number): string {
  return n.toLocaleString("ko-KR");
}

function safePerHead(amt: number, cnt: number): number {
  return cnt > 0 ? Math.floor(amt / cnt) : 0;
}

export function ContribUsageAnnualForm({ year, record, contribBase, prevYearEndTotal }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<OperatingReportActionState, FormData>(
    saveContribUsageAnnualAction,
    null,
  );

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  const u80Amount = Math.floor((contribBase * 80) / 100);
  const u90Amount = Math.floor((contribBase * 90) / 100);
  const u20AmountAuto = Math.floor((prevYearEndTotal * 20) / 100);
  const u25AmountAuto = Math.floor((prevYearEndTotal * 25) / 100);
  const u30AmountAuto = Math.floor((prevYearEndTotal * 30) / 100);

  const [u80R, setU80R] = useState<number>(record?.u80RecipientCount ?? 0);
  const [u90R, setU90R] = useState<number>(record?.u90RecipientCount ?? 0);

  const [u20A, setU20A] = useState<number>(record?.u20BaseAssetUsed ?? u20AmountAuto);
  const [u20R, setU20R] = useState<number>(record?.u20RecipientCount ?? 0);
  const [u25A, setU25A] = useState<number>(record?.u25BaseAssetUsed ?? u25AmountAuto);
  const [u25R, setU25R] = useState<number>(record?.u25RecipientCount ?? 0);
  const [u30A, setU30A] = useState<number>(record?.u30BaseAssetUsed ?? u30AmountAuto);
  const [u30R, setU30R] = useState<number>(record?.u30RecipientCount ?? 0);

  const u80PerHead = useMemo(() => safePerHead(u80Amount, u80R), [u80Amount, u80R]);
  const u90PerHead = useMemo(() => safePerHead(u90Amount, u90R), [u90Amount, u90R]);
  const u20PerHead = useMemo(() => safePerHead(u20A, u20R), [u20A, u20R]);
  const u25PerHead = useMemo(() => safePerHead(u25A, u25R), [u25A, u25R]);
  const u30PerHead = useMemo(() => safePerHead(u30A, u30R), [u30A, u30R]);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="year" value={year} />

      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}

      <section className="surface-inset dash-panel-pad space-y-4">
        <header className="space-y-1">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            출연금 사용 (㊱~㊶) — 대상: 해당 회계연도 출연금 합 ⑬+⑮
          </h3>
          <p className="text-[11px] text-[var(--muted)]">
            금액(자동)은 출연금(⑬+⑮) × 해당 비율입니다. 1인당 수혜금액은 금액 ÷ 수혜자 수로 자동 계산됩니다.
          </p>
        </header>

        <UsageRow
          title="㊱ 100분의 80 범위"
          amountLabel="㊱ 금액"
          amountAuto={u80Amount}
          recipientName="u80RecipientCount"
          recipientDefault={record?.u80RecipientCount ?? null}
          onRecipientChange={setU80R}
          vendorName="u80VendorWelfareAmount"
          vendorDefault={record?.u80VendorWelfareAmount ?? null}
          perHead={u80PerHead}
        />

        <UsageRow
          title="㊵ 100분의 90 범위"
          amountLabel="㊵ 금액"
          amountAuto={u90Amount}
          recipientName="u90RecipientCount"
          recipientDefault={record?.u90RecipientCount ?? null}
          onRecipientChange={setU90R}
          vendorName="u90VendorWelfareAmount"
          vendorDefault={record?.u90VendorWelfareAmount ?? null}
          perHead={u90PerHead}
        />
      </section>

      <section className="surface-inset dash-panel-pad space-y-4">
        <header className="space-y-1">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            직전 기본재산 사용 (㊷~◯54)
          </h3>
          <p className="text-[11px] text-[var(--muted)]">
            금액(자동)은 ⑫ 직전 말 기본재산 × 해당 비율입니다. 필요 시 수동 override 가능.
          </p>
        </header>

        <UsageRow
          title="㊷ 100분의 20 범위"
          amountLabel="㊷ 사용 기본재산 총액"
          amountAuto={u20AmountAuto}
          amountName="u20BaseAssetUsed"
          amountDefault={record?.u20BaseAssetUsed ?? null}
          onAmountChange={setU20A}
          recipientName="u20RecipientCount"
          recipientDefault={record?.u20RecipientCount ?? null}
          onRecipientChange={setU20R}
          vendorName="u20VendorWelfareAmount"
          vendorDefault={record?.u20VendorWelfareAmount ?? null}
          perHead={u20PerHead}
        />

        <UsageRow
          title="㊼ 100분의 25 범위"
          amountLabel="㊼ 사용 기본재산 총액"
          amountAuto={u25AmountAuto}
          amountName="u25BaseAssetUsed"
          amountDefault={record?.u25BaseAssetUsed ?? null}
          onAmountChange={setU25A}
          recipientName="u25RecipientCount"
          recipientDefault={record?.u25RecipientCount ?? null}
          onRecipientChange={setU25R}
          vendorName="u25VendorWelfareAmount"
          vendorDefault={record?.u25VendorWelfareAmount ?? null}
          perHead={u25PerHead}
        />

        <UsageRow
          title="◯52 100분의 30 범위"
          amountLabel="◯52 사용 기본재산 총액"
          amountAuto={u30AmountAuto}
          amountName="u30BaseAssetUsed"
          amountDefault={record?.u30BaseAssetUsed ?? null}
          onAmountChange={setU30A}
          recipientName="u30RecipientCount"
          recipientDefault={record?.u30RecipientCount ?? null}
          onRecipientChange={setU30R}
          vendorName="u30VendorWelfareAmount"
          vendorDefault={record?.u30VendorWelfareAmount ?? null}
          perHead={u30PerHead}
        />
      </section>

      <button type="submit" className="btn btn-primary text-sm">
        사용현황 저장
      </button>
    </form>
  );
}

/**
 * amountName/amountDefault/onAmountChange 가 주어지면 편집 가능,
 * 주어지지 않으면 읽기 전용 자동 금액 표시.
 */
function UsageRow({
  title,
  amountLabel,
  amountAuto,
  amountName,
  amountDefault,
  onAmountChange,
  recipientName,
  recipientDefault,
  onRecipientChange,
  vendorName,
  vendorDefault,
  perHead,
}: {
  title: string;
  amountLabel: string;
  amountAuto: number;
  amountName?: string;
  amountDefault?: number | null;
  onAmountChange?: (n: number) => void;
  recipientName: string;
  recipientDefault: number | null;
  onRecipientChange: (n: number) => void;
  vendorName: string;
  vendorDefault: number | null;
  perHead: number;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-[var(--muted)]">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={amountLabel}>
          {amountName ? (
            <>
              <CommaWonInput
                name={amountName}
                defaultValue={amountDefault ?? null}
                onUserChange={onAmountChange}
                className="input w-full text-sm"
                placeholder={`자동: ${f(amountAuto)}`}
              />
              <Hint>
                자동 = <b>{f(amountAuto)}</b>원
              </Hint>
            </>
          ) : (
            <>
              <div className="input flex w-full items-center font-mono tabular-nums text-sm text-[var(--muted)]">
                {f(amountAuto)}
              </div>
              <Hint>㉚ 또는 출연금 비율로 자동 계산됨 (수동 수정 불가)</Hint>
            </>
          )}
        </Field>
        <Field label="수혜자 수">
          <CommaWonInput
            name={recipientName}
            defaultValue={recipientDefault}
            onUserChange={onRecipientChange}
            className="input w-full text-sm"
            placeholder="명"
          />
        </Field>
        <Field label="협력업체근로자 복리후생 증진 사용액">
          <CommaWonInput
            name={vendorName}
            defaultValue={vendorDefault}
            className="input w-full text-sm"
          />
        </Field>
        <Field label="1인당 수혜금액 (자동)">
          <div className="input flex w-full items-center font-mono tabular-nums text-sm text-[var(--muted)]">
            {f(perHead)}
          </div>
          <Hint>= 금액 ÷ 수혜자 수 (수혜자 0이면 0)</Hint>
        </Field>
      </div>
    </div>
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
