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
import { Alert } from "@/components/ui/Alert";

/** 요율 표: 셀 가운데·조금 큰 입력 */
const INPUT_QTR =
  "mx-auto block w-full min-w-[5.75rem] max-w-[7.5rem] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-center text-sm tabular-nums focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]";
const INPUT_QTR_WIDE =
  "mx-auto block w-full min-w-[6.75rem] max-w-[8.5rem] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-center text-sm tabular-nums focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]";

const MONTHS_1_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const DEFAULT_QUARTER_PAY_MONTHS: readonly number[] = [3, 6, 9, 12];

function PayMonthCheckboxes({ defaultMonths }: { defaultMonths: readonly number[] }) {
  const selected = new Set(defaultMonths);
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2.5">
      {MONTHS_1_12.map((m) => (
        <label
          key={m}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm font-medium text-[var(--text)] shadow-[var(--shadow-card)]"
        >
          <input
            type="checkbox"
            name="payMonth"
            value={String(m)}
            defaultChecked={selected.has(m)}
            className="size-4 rounded border-[var(--border)]"
          />
          {m}월
        </label>
      ))}
    </div>
  );
}

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

  /**
   * “지급월 선택이 반영 안 됨” 사고를 빠르게 진단:
   * 저장된 설정 중 paymentMonths 가 1개뿐인 항목이 있으면, PB 컬렉션에 json 필드 paymentMonths 가 없거나
   * 저장이 단일 paymentMonth 로만 떨어졌을 가능성을 한 번에 알려준다.
   */
  const onlySingleMonth =
    configs.length > 0 && configs.every((c) => c.paymentMonths.length <= 1);

  const ratesTab = (
    <div className="space-y-4">
      {canRates ? (
        <div className="surface dash-panel-pad">
          <form action={saveQuarterlyRatesFormAction} className="space-y-4">
            <input type="hidden" name="year" value={year} />
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th
                      rowSpan={2}
                      className="dash-table-th-md border-b-2 border-[var(--border)] align-bottom text-left"
                    >
                      항목
                    </th>
                    <th colSpan={3} className="dash-table-head text-center font-semibold text-[var(--text)]">
                      자녀장학금
                    </th>
                    <th colSpan={2} className="dash-table-head text-center font-semibold text-[var(--text)]">
                      부모봉양지원금
                    </th>
                    <th
                      rowSpan={2}
                      className="dash-table-th-md dash-table-vline-strong border-b-2 border-[var(--border)] align-bottom text-center max-w-[8rem]"
                    >
                      정액·월세 한도
                    </th>
                    <th
                      rowSpan={2}
                      className="dash-table-th-md dash-table-vline border-b-2 border-[var(--border)] align-bottom text-center max-w-[8rem]"
                    >
                      보험 한도
                    </th>
                    <th
                      rowSpan={2}
                      className="dash-table-th-md dash-table-vline border-b-2 border-[var(--border)] align-bottom text-center max-w-[8rem]"
                    >
                      이자 한도
                    </th>
                  </tr>
                  <tr className="border-b-2 border-[var(--border)]">
                    {["영유아 단가", "미취학 단가", "청소년 단가", "부모 단가", "시부모 단가"].map((h, i) => (
                      <th
                        key={h}
                        className={`dash-table-th-md text-center ${i === 0 ? "dash-table-vline-strong" : "dash-table-vline"}`}
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
                        <td className="py-2.5 pr-4 text-left text-sm font-medium">{QUARTERLY_ITEM_LABELS[itemKey]}</td>
                        <td className="dash-table-vline-strong px-2 py-2.5 text-center align-middle">
                          <CommaWonInput name={`${itemKey}_infant`} defaultValue={r?.amountPerInfant ?? null} className={INPUT_QTR} />
                        </td>
                        <td className="dash-table-vline px-2 py-2.5 text-center align-middle">
                          <CommaWonInput name={`${itemKey}_pre`} defaultValue={r?.amountPerPreschool ?? null} className={INPUT_QTR} />
                        </td>
                        <td className="dash-table-vline px-2 py-2.5 text-center align-middle">
                          <CommaWonInput name={`${itemKey}_teen`} defaultValue={r?.amountPerTeen ?? null} className={INPUT_QTR} />
                        </td>
                        <td className="dash-table-vline px-2 py-2.5 text-center align-middle">
                          <CommaWonInput name={`${itemKey}_par`} defaultValue={r?.amountPerParent ?? null} className={INPUT_QTR} />
                        </td>
                        <td className="dash-table-vline px-2 py-2.5 text-center align-middle">
                          <CommaWonInput name={`${itemKey}_inlaw`} defaultValue={r?.amountPerInLaw ?? null} className={INPUT_QTR} />
                        </td>
                        <td className="dash-table-vline-strong px-2 py-2.5 text-center align-middle">
                          <CommaWonInput name={`${itemKey}_flat`} defaultValue={r?.flatAmount ?? null} className={INPUT_QTR} />
                        </td>
                        <td className="dash-table-vline px-2 py-2.5 text-center align-middle">
                          <CommaWonInput
                            name={`${itemKey}_pins`}
                            defaultValue={r?.percentInsurance ?? null}
                            className={INPUT_QTR_WIDE}
                          />
                        </td>
                        <td className="dash-table-vline px-2 py-2.5 text-center align-middle">
                          <CommaWonInput
                            name={`${itemKey}_ploan`}
                            defaultValue={r?.percentLoanInterest ?? null}
                            className={INPUT_QTR_WIDE}
                          />
                        </td>
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
        <div className="surface dash-panel-pad">
          <h3 className="mb-4 text-center text-sm font-semibold tracking-normal text-[var(--text)]">
            직원에게 요율 일괄 적용
          </h3>
          <form
            action={applyQuarterlyTemplateFormAction}
            className="mx-auto flex max-w-3xl flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center"
          >
            <input type="hidden" name="year" value={year} />
            <div className="w-full min-w-[12rem] max-w-md sm:w-auto">
              <label className="dash-field-label text-center sm:text-left">직원</label>
              <select name="employeeId" className="input mt-1 w-full text-sm">
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
                ))}
              </select>
            </div>
            <div className="w-full">
              <label className="dash-field-label mb-2 block text-center">지급 월</label>
              <PayMonthCheckboxes defaultMonths={DEFAULT_QUARTER_PAY_MONTHS} />
            </div>
            <div className="flex w-full justify-center sm:w-auto sm:shrink-0">
              <button type="submit" className="btn btn-outline px-6 py-2 text-sm">
                일괄 채우기
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );

  const configTab = (
    <div className="space-y-4">
      {canCfg ? (
        <>
          <div className="surface dash-panel-pad">
            <h3 className="mb-4 text-center text-sm font-semibold tracking-normal text-[var(--text)]">
              항목·지급 월 추가
            </h3>
            <form
              action={saveQuarterlyEmployeeConfigFormAction}
              className="mx-auto flex max-w-2xl flex-col items-center gap-4"
            >
              <input type="hidden" name="year" value={year} />
              <div className="w-full max-w-md">
                <label className="dash-field-label text-center">직원</label>
                <select name="employeeId" className="input mt-1 w-full text-sm" required>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-full max-w-md">
                <label className="dash-field-label text-center">항목</label>
                <select name="itemKey" className="input mt-1 w-full text-sm">
                  {items.map((k) => (
                    <option key={k} value={k}>{QUARTERLY_ITEM_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="w-full">
                <label className="dash-field-label mb-2 block text-center">지급 월</label>
                <PayMonthCheckboxes defaultMonths={DEFAULT_QUARTER_PAY_MONTHS} />
              </div>
              <div className="flex w-full max-w-md flex-col items-center">
                <label className="dash-field-label text-center">금액</label>
                <CommaWonInput
                  name="amount"
                  className="input mt-1 w-full max-w-[14rem] py-2.5 text-center text-sm tabular-nums"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary px-8 py-2 text-sm">
                저장
              </button>
            </form>
          </div>

          <div className="surface overflow-x-auto dash-panel-pad">
            <h3 className="mb-3 text-sm font-semibold tracking-normal text-[var(--text)]">설정 목록</h3>
            {configs.length === 0 ? (
              <p className="py-4 text-sm text-[var(--muted)]">설정된 분기 지급이 없습니다.</p>
            ) : (
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)]">
                    {(["직원", "항목", "지급 월", "금액"] as const).map((h) => (
                      <th
                        key={h}
                        className={`dash-table-th-md text-left ${h === "금액" ? "dash-table-vline-strong" : ""}`}
                      >
                        {h}
                      </th>
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
                        <td className="py-2 pr-4 tabular-nums">
                          {c.paymentMonths.length ? `${c.paymentMonths.join("·")}월` : "—"}
                        </td>
                        <td className="dash-table-vline-strong py-2 text-right font-mono tabular-nums">
                          {Number(c.amount).toLocaleString("ko-KR")}
                        </td>
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
        <p className="mt-1 text-sm text-[var(--muted)]">{year}년 · 분기 지원금은 직원의 연간 “총 지급금액(연간 기금)” 합계와 월별 스케줄 지급월 칸에 자동 합산됩니다.</p>
      </div>
      {onlySingleMonth ? (
        <Alert tone="warn" title="지급월 선택이 1개씩만 저장되고 있습니다 — PB 컬럼 점검 필요">
          저장된 분기 설정의 지급월이 모두 한 달짜리입니다. PocketBase{" "}
          <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-xs">sabok_quarterly_employee_configs</code>{" "}
          컬렉션에 <strong>json 타입 필드 <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-xs">paymentMonths</code></strong>
          {" "}가 빠져 있을 가능성이 큽니다. Admin → Edit collection → Add field → type <strong>json</strong>, name{" "}
          <strong>paymentMonths</strong>(Required 끔) 으로 추가한 뒤 분기 설정을 다시 저장해 주세요. 이미 단일 달로 저장된 항목도 다시 저장하면
          여러 달이 정상 반영됩니다.
        </Alert>
      ) : null}
      <Tabs
        tabs={[
          { label: "요율 템플릿", content: ratesTab },
          { label: "직원별 분기 항목", content: configTab },
        ]}
      />
    </div>
  );
}
