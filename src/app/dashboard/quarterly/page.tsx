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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">분기 지원금</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          6개 항목은 3개월 주기 원칙이며, 직원별 지급 월을 선택할 수 있습니다. 요율은 선임이, 직원별 금액·월은
          후임도 입력 가능합니다.
        </p>
      </div>

      {canRates ? (
        <form action={saveQuarterlyRatesFormAction} className="surface space-y-4 p-4">
          <input type="hidden" name="year" value={year} />
          <h2 className="text-sm font-semibold">연도 {year} 요율 템플릿</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="py-2">항목</th>
                  <th className="py-2">영유아단가</th>
                  <th className="py-2">미취학단가</th>
                  <th className="py-2">청소년단가</th>
                  <th className="py-2">부모단가</th>
                  <th className="py-2">시부모단가</th>
                  <th className="py-2">정액</th>
                  <th className="py-2">보험%</th>
                  <th className="py-2">이자%</th>
                </tr>
              </thead>
              <tbody>
                {items.map((itemKey) => {
                  const r = rateMap.get(itemKey);
                  return (
                    <tr key={itemKey} className="border-b border-[var(--border)]">
                      <td className="py-2">{QUARTERLY_ITEM_LABELS[itemKey]}</td>
                      <td>
                        <input
                          name={`${itemKey}_infant`}
                          defaultValue={r?.amountPerInfant != null ? String(r.amountPerInfant) : ""}
                          className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-1"
                        />
                      </td>
                      <td>
                        <input
                          name={`${itemKey}_pre`}
                          defaultValue={r?.amountPerPreschool != null ? String(r.amountPerPreschool) : ""}
                          className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-1"
                        />
                      </td>
                      <td>
                        <input
                          name={`${itemKey}_teen`}
                          defaultValue={r?.amountPerTeen != null ? String(r.amountPerTeen) : ""}
                          className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-1"
                        />
                      </td>
                      <td>
                        <input
                          name={`${itemKey}_par`}
                          defaultValue={r?.amountPerParent != null ? String(r.amountPerParent) : ""}
                          className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-1"
                        />
                      </td>
                      <td>
                        <input
                          name={`${itemKey}_inlaw`}
                          defaultValue={r?.amountPerInLaw != null ? String(r.amountPerInLaw) : ""}
                          className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-1"
                        />
                      </td>
                      <td>
                        <input
                          name={`${itemKey}_flat`}
                          defaultValue={r?.flatAmount != null ? String(r.flatAmount) : ""}
                          className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-1"
                        />
                      </td>
                      <td>
                        <input
                          name={`${itemKey}_pins`}
                          defaultValue={r?.percentInsurance != null ? String(r.percentInsurance) : ""}
                          className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-1"
                        />
                      </td>
                      <td>
                        <input
                          name={`${itemKey}_ploan`}
                          defaultValue={r?.percentLoanInterest != null ? String(r.percentLoanInterest) : ""}
                          className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-1"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
            요율 저장
          </button>
        </form>
      ) : (
        <p className="text-sm text-[var(--muted)]">요율 조회는 가능하나 수정 권한이 없습니다.</p>
      )}

      {canRates && (
        <form action={applyQuarterlyTemplateFormAction} className="surface flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="year" value={year} />
          <div>
            <label className="text-xs text-[var(--muted)]">직원</label>
            <select name="employeeId" className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employeeCode} — {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">기본 지급월</label>
            <input
              name="paymentMonth"
              type="number"
              min={1}
              max={12}
              defaultValue={3}
              className="mt-1 w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
            요율로 직원 분기항목 일괄 채우기
          </button>
        </form>
      )}

      {canCfg && (
        <div className="surface space-y-4 p-4">
          <h2 className="text-sm font-semibold">직원별 분기 항목·지급 월</h2>
          <form action={saveQuarterlyEmployeeConfigFormAction} className="grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="year" value={year} />
            <div className="sm:col-span-2">
              <label className="text-xs text-[var(--muted)]">직원</label>
              <select name="employeeId" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeCode} — {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">항목</label>
              <select name="itemKey" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
                {items.map((k) => (
                  <option key={k} value={k}>
                    {QUARTERLY_ITEM_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">지급 월</label>
              <input name="paymentMonth" type="number" min={1} max={12} defaultValue={3} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">금액</label>
              <input name="amount" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" required />
            </div>
            <div className="sm:col-span-5">
              <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
                저장
              </button>
            </div>
          </form>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2">직원</th>
                  <th className="py-2">항목</th>
                  <th className="py-2">지급월</th>
                  <th className="py-2">금액</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => {
                  const e = employees.find((x) => x.id === c.employeeId);
                  return (
                    <tr key={c.id} className="border-b border-[var(--border)]">
                      <td className="py-2">{e ? `${e.employeeCode} ${e.name}` : c.employeeId}</td>
                      <td>{QUARTERLY_ITEM_LABELS[c.itemKey as QuarterlyItemKey] ?? c.itemKey}</td>
                      <td>{c.paymentMonth}</td>
                      <td>{String(c.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {configs.length === 0 && <p className="py-4 text-[var(--muted)]">설정된 분기 지급이 없습니다.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
