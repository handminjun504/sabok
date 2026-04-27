"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveBizResultAnnualAction,
  type OperatingReportActionState,
} from "@/app/actions/operating-report";
import { CommaWonInput } from "@/components/CommaWonInput";
import { LEGAL_WELFARE_CATEGORY_ROWS } from "@/lib/domain/operating-welfare-legal-categories";
import { BIZ_ITEM_CODES, type BizItemCode } from "@/lib/domain/operating-report";
import type { BizResultAnnual } from "@/types/models";

type Props = {
  year: number;
  record: BizResultAnnual | null;
  /** 법정 코드별 자동 배분 금액 */
  legalAllocByCode: Map<number, number>;
  /** ⑰ 기본재산 사용(연간 지급 총액) */
  baseAssetUsed: number;
  /** 기금사업 재원 합계(㉟) */
  fundSourceTotal: number;
  /** ㉗ 근로자 대부(누계) */
  loanTotal: number;
  /** 선택적 복지 수혜자 자동 추정 */
  autoOptionalRecipients: number;
};

type ItemRowState = {
  code: BizItemCode;
  label: string;
  purposeOverride: number | null;
  purposeCount: number;
  loanAmount: number;
  loanCount: number;
  auto: number;
};

function f(n: number): string {
  return n.toLocaleString("ko-KR");
}

function labelOf(code: BizItemCode): string {
  return LEGAL_WELFARE_CATEGORY_ROWS.find((r) => r.code === code)?.label ?? String(code);
}

export function BizResultAnnualForm({
  year,
  record,
  legalAllocByCode,
  baseAssetUsed,
  fundSourceTotal,
  loanTotal,
  autoOptionalRecipients,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<OperatingReportActionState, FormData>(
    saveBizResultAnnualAction,
    null,
  );

  useEffect(() => {
    if (state?.성공) router.refresh();
  }, [state?.성공, router]);

  const initRows: ItemRowState[] = useMemo(
    () =>
      BIZ_ITEM_CODES.map((code) => {
        const key = String(code);
        const saved = record?.bizItems?.[key];
        const auto = legalAllocByCode.get(code) ?? 0;
        return {
          code,
          label: labelOf(code),
          purposeOverride: saved?.purposeAmountOverride ?? null,
          purposeCount: saved?.purposeCount ?? 0,
          loanAmount: saved?.loanAmount ?? 0,
          loanCount: saved?.loanCount ?? 0,
          auto,
        };
      }),
    [record, legalAllocByCode],
  );

  const [rows, setRows] = useState<ItemRowState[]>(initRows);
  const [operationCost, setOperationCost] = useState<number>(record?.operationCost ?? 0);

  useEffect(() => {
    setRows(initRows);
  }, [initRows]);

  const subtotalPurpose = rows.reduce(
    (s, r) => s + (r.purposeOverride == null ? r.auto : r.purposeOverride),
    0,
  );
  const subtotalLoan = rows.reduce((s, r) => s + r.loanAmount, 0);
  const subtotal = subtotalPurpose + subtotalLoan;

  const balanceAuto = Math.max(0, fundSourceTotal - baseAssetUsed - operationCost);
  const total = subtotal + operationCost + balanceAuto;

  /** 검증: ㉗ + ㉟ == ◯70 */
  const loanPlusSource = loanTotal + fundSourceTotal;
  const mismatch = total !== loanPlusSource;

  const updateRow = (code: BizItemCode, patch: Partial<ItemRowState>) => {
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="year" value={year} />

      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}

      <section className="surface-inset dash-panel-pad space-y-3">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">
              사업실적 (◯57~◯66, 대부 포함)
            </h3>
            <p className="text-[11px] leading-4 text-[var(--muted)]">
              목적사업 금액은 자동 배분값(법정 코드별)을 기본으로 사용합니다. 값을 수동 입력하면 해당 칸만 override 됩니다.
            </p>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                <th className="px-2 py-1">코드</th>
                <th className="px-2 py-1">구분</th>
                <th className="px-2 py-1 text-right">목적사업 금액</th>
                <th className="px-2 py-1 text-right">목적사업 수혜자</th>
                <th className="px-2 py-1 text-right">대부사업 금액</th>
                <th className="px-2 py-1 text-right">대부사업 수혜자</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOverridden = row.purposeOverride != null;
                return (
                  <tr key={row.code} className="align-middle">
                    <td className="px-2 py-1 text-[var(--muted)] font-mono tabular-nums">◯{row.code}</td>
                    <td className="px-2 py-1 text-[var(--text)]">
                      <div className="flex items-center gap-2">
                        <span>{row.label}</span>
                        {isOverridden ? (
                          <span className="rounded bg-[var(--warn)]/15 px-1.5 py-0.5 text-[10px] text-[var(--warn)]">
                            수동
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <CommaWonInput
                        name={`biz_${row.code}_purposeAmountOverride`}
                        defaultValue={row.purposeOverride}
                        onUserChange={(n) =>
                          updateRow(row.code, {
                            purposeOverride:
                              Number.isFinite(n) && n !== 0 ? n : row.purposeOverride == null ? null : n,
                          })
                        }
                        className="input w-full text-xs text-right"
                        placeholder={`자동: ${f(row.auto)}`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CommaWonInput
                        name={`biz_${row.code}_purposeCount`}
                        defaultValue={row.purposeCount || null}
                        onUserChange={(n) => updateRow(row.code, { purposeCount: n })}
                        className="input w-full text-xs text-right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CommaWonInput
                        name={`biz_${row.code}_loanAmount`}
                        defaultValue={row.loanAmount || null}
                        onUserChange={(n) => updateRow(row.code, { loanAmount: n })}
                        className="input w-full text-xs text-right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CommaWonInput
                        name={`biz_${row.code}_loanCount`}
                        defaultValue={row.loanCount || null}
                        onUserChange={(n) => updateRow(row.code, { loanCount: n })}
                        className="input w-full text-xs text-right"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-xs text-[var(--muted)]">
                <td colSpan={2} className="px-2 pt-2">
                  ◯67 소계 (목적 + 대부)
                </td>
                <td className="px-2 pt-2 text-right font-mono tabular-nums text-[var(--text)]">
                  {f(subtotalPurpose)}
                </td>
                <td />
                <td className="px-2 pt-2 text-right font-mono tabular-nums text-[var(--text)]">
                  {f(subtotalLoan)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="surface-inset dash-panel-pad grid gap-3 sm:grid-cols-3">
        <Field label="◯68 기금 운영비">
          <CommaWonInput
            name="operationCost"
            defaultValue={record?.operationCost ?? null}
            onUserChange={setOperationCost}
            className="input w-full text-sm"
          />
        </Field>
        <Field label="◯69 잔액 (자동)">
          <div className="input flex w-full items-center font-mono tabular-nums text-sm text-[var(--muted)]">
            {f(balanceAuto)}
          </div>
          <Hint>= ㉟ − ⑰ − ◯68</Hint>
        </Field>
        <Field label="◯70 합계 (자동)">
          <div className="input flex w-full items-center font-mono tabular-nums text-sm text-[var(--text)]">
            {f(total)}
          </div>
          <Hint>= ◯67 + ◯68 + ◯69</Hint>
        </Field>
      </section>

      <section className="surface-inset dash-panel-pad grid gap-3 sm:grid-cols-2">
        <Field label="◯71 선택적 복지비 금액">
          <CommaWonInput
            name="optionalAmountOverride"
            defaultValue={record?.optionalAmountOverride ?? null}
            className="input w-full text-sm"
            placeholder={`자동: ${f(legalAllocByCode.get(71) ?? 0)}`}
          />
          <Hint>
            자동 = 법정코드 71(월별 노트 `optionalExtraAmount` 합) ={" "}
            <b>{f(legalAllocByCode.get(71) ?? 0)}</b>원. 중복 기재 가능(사업실적 ◯57~◯66 과 별도).
          </Hint>
        </Field>
        <Field label="◯72 선택적 복지 수혜자 수">
          <CommaWonInput
            name="optionalRecipientsOverride"
            defaultValue={record?.optionalRecipientsOverride ?? null}
            className="input w-full text-sm"
            placeholder={`자동: ${f(autoOptionalRecipients)}`}
          />
          <Hint>
            자동 = optionalExtraAmount &gt; 0 인 고유 직원 수 = <b>{f(autoOptionalRecipients)}</b>명
          </Hint>
        </Field>
      </section>

      {mismatch ? (
        <div className="rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-xs text-[var(--warn)]">
          ㉗(근로자 대부) + ㉟(기금사업 재원 합계) = <b>{f(loanPlusSource)}</b>원 이 ◯70 합계(
          <b>{f(total)}</b>원)와 일치해야 합니다. 차이:{" "}
          {f(total - loanPlusSource > 0 ? total - loanPlusSource : loanPlusSource - total)}원
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary text-sm">
        사업실적 저장
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
