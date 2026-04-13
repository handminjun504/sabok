import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  quarterlyEmployeeConfigListByTenantYear,
  quarterlyRateList,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { QUARTERLY_ITEM, QUARTERLY_ITEM_LABELS, type QuarterlyItemKey } from "@/lib/business-rules";
import { canEditEmployees, canEditLevelRules } from "@/lib/permissions";
import {
  applyQuarterlyTemplateFormAction,
  saveQuarterlyEmployeeConfigFormAction,
  saveQuarterlyRatesFormAction,
} from "@/app/actions/quarterly";
import { CommaWonInput } from "@/components/CommaWonInput";
import { Tabs } from "@/components/Tabs";

const INPUT_SM =
  "w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]";

export default async function QuarterlyPage() {
  const { tenantId, role } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const employees = await employeeListByTenantCodeAsc(tenantId);
  const ids = employees.map((e) => e.id);
  const [rates, configs] = await Promise.all([
    quarterlyRateList(tenantId, year),
    quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids),
  ]);

  const rateMap = new Map(rates.map((r) => [r.itemKey, r]));
  const items = Object.values(QUARTERLY_ITEM) as QuarterlyItemKey[];
  const canRates = canEditLevelRules(role);
  const canCfg = canEditEmployees(role);

  const ratesTab = (
    <div className="space-y-4">
      {canRates ? (
        <div className="surface p-5">
          <form action={saveQuarterlyRatesFormAction} className="space-y-4">
            <input type="hidden" name="year" value={year} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th
                      rowSpan={2}
                      className="border-b-2 border-[var(--border)] py-2 pr-4 align-bottom text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                    >
                      항목
                    </th>
                    <th
                      colSpan={3}
                      className="py-2 pr-2 text-center text-xs font-semibold tracking-wide text-[var(--text)]"
                    >
                      자녀장학금
                    </th>
                    <th
                      colSpan={2}
                      className="py-2 pr-2 text-center text-xs font-semibold tracking-wide text-[var(--text)]"
                    >
                      부모봉양지원금
                    </th>
                    <th
                      rowSpan={2}
                      className="border-b-2 border-[var(--border)] py-2 pr-2 align-bottom text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                    >
                      정액
                    </th>
                    <th
                      rowSpan={2}
                      className="border-b-2 border-[var(--border)] py-2 pr-2 align-bottom text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                    >
                      보험%
                    </th>
                    <th
                      rowSpan={2}
                      className="border-b-2 border-[var(--border)] py-2 pr-2 align-bottom text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                    >
                      이자%
                    </th>
                  </tr>
                  <tr className="border-b-2 border-[var(--border)]">
                    {["영유아 단가", "미취학 단가", "청소년 단가", "부모 단가", "시부모 단가"].map((h) => (
                      <th
                        key={h}
                        className="py-2 pr-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((itemKey) => {
                    const r = rateMap.get(itemKey);
                    return (
                      <tr key={itemKey} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                        <td className="py-2 pr-4 text-sm font-medium">{QUARTERLY_ITEM_LABELS[itemKey]}</td>
                        <td className="py-1.5 pr-2">
                          <CommaWonInput name={`${itemKey}_infant`} defaultValue={r?.amountPerInfant ?? null} className={INPUT_SM} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <CommaWonInput name={`${itemKey}_pre`} defaultValue={r?.amountPerPreschool ?? null} className={INPUT_SM} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <CommaWonInput name={`${itemKey}_teen`} defaultValue={r?.amountPerTeen ?? null} className={INPUT_SM} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <CommaWonInput name={`${itemKey}_par`} defaultValue={r?.amountPerParent ?? null} className={INPUT_SM} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <CommaWonInput name={`${itemKey}_inlaw`} defaultValue={r?.amountPerInLaw ?? null} className={INPUT_SM} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <CommaWonInput name={`${itemKey}_flat`} defaultValue={r?.flatAmount ?? null} className={INPUT_SM} />
                        </td>
                        <td className="py-1.5 pr-2"><input name={`${itemKey}_pins`} defaultValue={r?.percentInsurance != null ? String(r.percentInsurance) : ""} className="w-16 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm" /></td>
                        <td className="py-1.5 pr-2"><input name={`${itemKey}_ploan`} defaultValue={r?.percentLoanInterest != null ? String(r.percentLoanInterest) : ""} className="w-16 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="submit" className="btn btn-primary">
              요율 저장
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
      )}

      {canRates && (
        <div className="surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-[var(--text)]">직원에게 요율 일괄 적용</h3>
          <form action={applyQuarterlyTemplateFormAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="year" value={year} />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">직원</label>
              <select name="employeeId" className="input">
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">기본 지급월</label>
              <input name="paymentMonth" type="number" min={1} max={12} defaultValue={3}
                className={INPUT_SM} />
            </div>
            <button type="submit" className="btn btn-outline">
              일괄 채우기
            </button>
          </form>
        </div>
      )}
    </div>
  );

  const configTab = (
    <div className="space-y-4">
      {canCfg ? (
        <>
          <div className="surface p-5">
            <h3 className="mb-4 text-sm font-semibold text-[var(--text)]">항목·지급 월 추가</h3>
            <form action={saveQuarterlyEmployeeConfigFormAction} className="grid gap-4 sm:grid-cols-4">
              <input type="hidden" name="year" value={year} />
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">직원</label>
                <select name="employeeId" className="input" required>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">항목</label>
                <select name="itemKey" className="input">
                  {items.map((k) => (
                    <option key={k} value={k}>{QUARTERLY_ITEM_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">지급 월</label>
                <input name="paymentMonth" type="number" min={1} max={12} defaultValue={3} className="input" required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">금액</label>
                <CommaWonInput name="amount" className="input" required />
              </div>
              <div className="flex items-end sm:col-span-4">
                <button type="submit" className="btn btn-primary">저장</button>
              </div>
            </form>
          </div>

          <div className="surface overflow-x-auto p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">설정 목록</h3>
            {configs.length === 0 ? (
              <p className="py-4 text-sm text-[var(--muted)]">설정된 분기 지급이 없습니다.</p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)]">
                    {["직원", "항목", "지급월", "금액"].map((h) => (
                      <th key={h} className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => {
                    const e = employees.find((x) => x.id === c.employeeId);
                    return (
                      <tr key={c.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                        <td className="py-2 pr-4">{e ? `${e.employeeCode} ${e.name}` : c.employeeId}</td>
                        <td className="py-2 pr-4">{QUARTERLY_ITEM_LABELS[c.itemKey as QuarterlyItemKey] ?? c.itemKey}</td>
                        <td className="py-2 pr-4">{c.paymentMonth}월</td>
                        <td className="py-2 font-mono">{Number(c.amount).toLocaleString("ko-KR")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">분기 지원금</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도 <strong>{year}</strong> · 3개월 주기, 직원별 지급 월
        </p>
      </div>
      <Tabs
        tabs={[
          { label: "요율 템플릿", content: ratesTab },
          { label: "직원별 분기 항목", content: configTab },
        ]}
      />
    </div>
  );
}
