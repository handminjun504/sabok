"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveFundOperationAnnualAction,
  type OperatingReportActionState,
} from "@/app/actions/operating-report";
import { CommaWonInput } from "@/components/CommaWonInput";
import type { FundOperationAnnual } from "@/types/models";

type Props = {
  year: number;
  record: FundOperationAnnual | null;
  /** ⑳ 당해 말 기본재산 총액 (㉘ 검증용) */
  expectedTotalMatch: number;
};

function f(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function FundOperationAnnualForm({ year, record, expectedTotalMatch }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<OperatingReportActionState, FormData>(
    saveFundOperationAnnualAction,
    null,
  );

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  const [deposit, setDeposit] = useState<number>(record?.deposit ?? 0);
  const [trust, setTrust] = useState<number>(record?.trust ?? 0);
  const [security, setSecurity] = useState<number>(record?.security ?? 0);
  const [ownStock, setOwnStock] = useState<number>(record?.ownStock ?? 0);
  const [reit, setReit] = useState<number>(record?.reit ?? 0);
  const [etc, setEtc] = useState<number>(record?.etc ?? 0);
  const [loan, setLoan] = useState<number>(record?.loan ?? 0);

  const total = useMemo(
    () => deposit + trust + security + ownStock + reit + etc + loan,
    [deposit, trust, security, ownStock, reit, etc, loan],
  );

  const mismatch = expectedTotalMatch !== 0 && total !== expectedTotalMatch;
  const diff = total - expectedTotalMatch;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="year" value={year} />

      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}

      <div className="surface-inset dash-panel-pad space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="㉑ 금융회사 예입·예탁">
            <CommaWonInput
              name="deposit"
              defaultValue={record?.deposit ?? null}
              onUserChange={setDeposit}
              className="input w-full text-sm"
            />
          </Row>
          <Row label="㉒ 투자신탁 수익증권 매입">
            <CommaWonInput
              name="trust"
              defaultValue={record?.trust ?? null}
              onUserChange={setTrust}
              className="input w-full text-sm"
            />
          </Row>
          <Row label="㉓ 유가증권 매입">
            <CommaWonInput
              name="security"
              defaultValue={record?.security ?? null}
              onUserChange={setSecurity}
              className="input w-full text-sm"
            />
          </Row>
          <Row label="㉔ 보유 자사주 유상증자 참여">
            <CommaWonInput
              name="ownStock"
              defaultValue={record?.ownStock ?? null}
              onUserChange={setOwnStock}
              className="input w-full text-sm"
            />
          </Row>
          <Row label="㉕ (부동산)투자회사 주식 매입">
            <CommaWonInput
              name="reit"
              defaultValue={record?.reit ?? null}
              onUserChange={setReit}
              className="input w-full text-sm"
            />
          </Row>
          <Row label="㉖ 기타">
            <CommaWonInput
              name="etc"
              defaultValue={record?.etc ?? null}
              onUserChange={setEtc}
              className="input w-full text-sm"
            />
          </Row>
          <Row label="㉗ 근로자 대부(누계)">
            <CommaWonInput
              name="loan"
              defaultValue={record?.loan ?? null}
              onUserChange={setLoan}
              className="input w-full text-sm"
            />
          </Row>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-[var(--muted)]">
            ㉘ 합계
            <span className="ml-2 font-mono tabular-nums text-sm text-[var(--text)]">{f(total)}</span>
          </div>
          <div className="text-xs text-[var(--muted)]">
            ⑳ 당해 말 기본재산 총액
            <span className="ml-2 font-mono tabular-nums text-sm text-[var(--text)]">
              {f(expectedTotalMatch)}
            </span>
          </div>
        </div>

        {mismatch ? (
          <div className="rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-xs text-[var(--warn)]">
            ㉘ 합계가 ⑳ 당해 말 총액과 {diff > 0 ? "+" : ""}
            {f(diff)}원만큼 차이가 납니다. 양식 작성요령상 두 값은 반드시 일치해야 합니다.
          </div>
        ) : null}
      </div>

      <button type="submit" className="btn btn-primary text-sm">
        운용방법 저장
      </button>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="dash-field-label">{label}</label>
      {children}
    </div>
  );
}
