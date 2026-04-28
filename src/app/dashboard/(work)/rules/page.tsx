import { addCustomPaymentEventFormAction } from "@/app/actions/levelRules";
import {
  deleteQuarterlyEmployeeConfigAction,
  saveQuarterlyEmployeeConfigAction,
  setItemQuarterlyPayMonthsAction,
} from "@/app/actions/quarterly";
import {
  allPaymentEventKeysForYear,
  customPaymentDefsForYear,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  levelPaymentRuleList,
  quarterlyEmployeeConfigListByTenantYear,
  quarterlyRateList,
} from "@/lib/pb/repository";
import { canEditEmployees, canEditLevelRules } from "@/lib/permissions";
import { requireTenantContext } from "@/lib/tenant-context";
import { QUARTERLY_ITEM, QUARTERLY_ITEM_LABELS, type QuarterlyItemKey } from "@/lib/business-rules";
import { CommaWonInput } from "@/components/CommaWonInput";
import { LevelRulesMatrixForm } from "@/components/LevelRulesMatrixForm";
import { MidYearChangeButton } from "@/components/MidYearChangeButton";
import { QuarterlyBulkCheckGrid, type QuarterlyCheckItem } from "@/components/QuarterlyBulkCheckGrid";
import { QuarterlyConfigDeleteButton } from "@/components/QuarterlyConfigDeleteButton";
import { QuarterlyEmployeeConfigForm } from "@/components/QuarterlyEmployeeConfigForm";
import { QuarterlyRatesMatrixForm } from "@/components/QuarterlyRatesMatrixForm";
import { Tabs } from "@/components/Tabs";
import { Alert } from "@/components/ui/Alert";

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

export default async function PaymentRulesPage() {
  const { tenantId, role } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();

  const [rules, rates, employees] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    quarterlyRateList(tenantId, year),
    employeeListByTenantCodeAsc(tenantId),
  ]);
  const ids = employees.map((e) => e.id);
  const configs = await quarterlyEmployeeConfigListByTenantYear(tenantId, year, ids);

  const ruleMap = new Map<string, string>();
  for (const r of rules) {
    ruleMap.set(`${r.level}_${r.eventKey}`, String(r.amount));
  }

  const customDefs = customPaymentDefsForYear(settings, year);
  const eventKeys = allPaymentEventKeysForYear(settings, year);
  const canEditLevels = canEditLevelRules(role);
  const canEditQuarterly = canEditEmployees(role);

  const eventLabels = eventKeys.map((ev) => paymentEventLabel(ev, customDefs));
  const customEventKeys = eventKeys.filter((ev) => customDefs.some((c) => c.eventKey === ev));
  const amountsByLevelEvent: Record<string, number> = {};
  /** MidYearChangeModal 은 `[level][eventKey]` 중첩 맵을 요구 — 매트릭스 폼 원본은 `${lv}_${ev}` 키 단일맵 */
  const amountsByLevelEventNested: Record<number, Record<string, number>> = {};
  for (let lv = 1; lv <= 5; lv++) {
    amountsByLevelEventNested[lv] = {};
    for (const ev of eventKeys) {
      const val = Number(ruleMap.get(`${lv}_${ev}`) ?? 0);
      amountsByLevelEvent[`${lv}_${ev}`] = val;
      amountsByLevelEventNested[lv]![ev] = val;
    }
  }
  const rulesSignature = `${year}|${eventKeys.join(",")}|${rules.length}`;

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    code: e.employeeCode,
    name: e.name,
    level: Math.min(5, Math.max(1, Math.round(Number(e.level)))),
  }));

  const quarterlyItems = Object.values(QUARTERLY_ITEM) as QuarterlyItemKey[];

  /** 분기 항목별 지급 월 — settings.quarterlyPayMonths 에 있으면 그 값, 없으면 기본값 [3,6,9,12]. */
  const DEFAULT_Q_MONTHS: readonly number[] = [3, 6, 9, 12];
  function effectiveQMonths(itemKey: string): readonly number[] {
    const saved = settings?.quarterlyPayMonths?.[itemKey];
    return saved && saved.length > 0 ? saved : DEFAULT_Q_MONTHS;
  }

  const checkItems: QuarterlyCheckItem[] = quarterlyItems.map((itemKey) => {
    const configByEmployeeId: Record<string, string> = {};
    for (const c of configs) {
      if (c.itemKey === itemKey) {
        configByEmployeeId[c.employeeId] = c.id;
      }
    }
    return {
      itemKey,
      label: QUARTERLY_ITEM_LABELS[itemKey],
      configByEmployeeId,
      payMonths: effectiveQMonths(itemKey),
    };
  });

  const checkEmployees = employees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.name,
    level: e.level ?? 0,
    childrenInfant: e.childrenInfant ?? 0,
    childrenPreschool: e.childrenPreschool ?? 0,
    childrenTeen: e.childrenTeen ?? 0,
    parentsCount: e.parentsCount ?? 0,
    parentsInLawCount: e.parentsInLawCount ?? 0,
    insurancePremium: e.insurancePremium ?? 0,
    loanInterest: e.loanInterest ?? 0,
    monthlyRentAmount: e.monthlyRentAmount ?? null,
    resignYear: e.resignYear ?? null,
    resignMonth: e.resignMonth ?? null,
  }));

  /** “지급월 선택이 반영 안 됨” 조기 진단 — PB paymentMonths 컬럼이 빠진 경우. */
  const onlySingleMonth =
    configs.length > 0 && configs.every((c) => c.paymentMonths.length <= 1);

  const levelTab = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm leading-snug text-[var(--muted)]">
          기준 연도 <strong className="text-[var(--text)]">{year}</strong> · 세로 레벨(1~5) · 가로 행사 · 레벨 5는 직원 상세에서 개별 조정
        </p>
        <MidYearChangeButton
          year={year}
          amountsByLevelEvent={amountsByLevelEventNested}
          eventKeys={eventKeys}
          eventLabels={eventLabels}
          employees={employeeOptions}
          canEdit={canEditLevels}
        />
      </div>

      <div className="space-y-1.5">
        {!canEditLevels && (
          <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
        )}

        <LevelRulesMatrixForm
          year={year}
          eventKeys={eventKeys}
          eventLabels={eventLabels}
          amountsByLevelEvent={amountsByLevelEvent}
          customEventKeys={customEventKeys}
          rulesSignature={rulesSignature}
        />

        {canEditLevels && (
          <form
            action={addCustomPaymentEventFormAction}
            className="surface flex flex-wrap items-end gap-x-3 gap-y-2 px-2 py-2 sm:px-3 sm:py-2.5"
          >
            <input type="hidden" name="year" value={year} />
            <div>
              <label className="dash-field-label text-xs sm:text-[0.8125rem]">추가 행사명</label>
              <input
                name="label"
                required
                placeholder="예: 하계 휴가비"
                className="input w-44 text-sm"
              />
            </div>
            <div>
              <label className="dash-field-label text-xs sm:text-[0.8125rem]">귀속 월</label>
              <select
                name="accrualMonth"
                required
                className="input w-[5.75rem] text-sm"
                defaultValue={6}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-outline px-3 py-2 text-sm">
              항목 추가
            </button>
            <p className="m-0 w-full text-xs leading-snug text-[var(--muted)]">귀속 월 기준 스케줄 반영, 키 자동.</p>
          </form>
        )}
      </div>
    </div>
  );

  const quarterlyRatesTab = (
    <QuarterlyRatesMatrixForm
      year={year}
      rates={rates}
      canEdit={canEditLevels}
    />
  );

  const quarterlyBulkTab = (
    <div className="space-y-4">
      {onlySingleMonth ? (
        <Alert tone="warn" title="지급월 선택이 1개만 저장되고 있습니다 — PB 컬럼 점검 필요">
          여러 달을 체크해도 첫 달만 저장되는 증상입니다. PocketBase{" "}
          <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-xs">
            sabok_quarterly_employee_configs
          </code>{" "}
          컬렉션에{" "}
          <strong>
            json 타입 필드{" "}
            <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-xs">paymentMonths</code>
          </strong>
          {" "}가 빠져 있어서 그렇습니다. 두 가지 중 하나로 한 번에 해결하세요:
          <ol className="mt-2 ml-5 list-decimal space-y-1">
            <li>
              서버에서 한 줄: <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-xs">
                npm run pb:fix-quarterly-payment-months
              </code>
              {" "} (필드 추가 + 기존 데이터 마이그레이션 자동)
            </li>
            <li>
              또는 PB Admin UI: 위 컬렉션 → Edit collection → Add field → type{" "}
              <strong>json</strong>, name <strong>paymentMonths</strong> (Required 끔) → 저장 후, 아래 표의 각 행을
              새 폼에서 같은 값으로 다시 저장
            </li>
          </ol>
        </Alert>
      ) : null}
      <div className="surface dash-panel-pad">
        <p className="mb-4 text-xs leading-relaxed text-[var(--muted)]">
          항목별로 직원을 체크하면 <strong className="text-[var(--text)]">요율 × 인원수</strong>로 자동 계산된
          금액이 설정됩니다. 지급 월은{" "}
          <strong className="text-[var(--text)]">전사 설정 → 분기 지원 항목별 지급 월</strong>에서 변경할 수
          있습니다. 체크 해제 시 해당 직원의 분기 설정이 삭제됩니다.
        </p>
        <QuarterlyBulkCheckGrid
          year={year}
          items={checkItems}
          employees={checkEmployees}
          rates={rates}
          canEdit={canEditQuarterly}
          onSave={saveQuarterlyEmployeeConfigAction}
          onDelete={deleteQuarterlyEmployeeConfigAction}
          onSetMonths={setItemQuarterlyPayMonthsAction}
        />
      </div>
    </div>
  );

  const quarterlyEmployeeTab = (
    <div className="space-y-4">
      {canEditQuarterly ? (
        <>
          <div className="surface dash-panel-pad">
            <h3 className="mb-4 text-center text-sm font-semibold tracking-normal text-[var(--text)]">
              항목·지급 월 추가
            </h3>
            <QuarterlyEmployeeConfigForm>
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
                  {quarterlyItems.map((k) => (
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
            </QuarterlyEmployeeConfigForm>
          </div>

          <div className="surface overflow-x-auto dash-panel-pad">
            <h3 className="mb-3 text-sm font-semibold tracking-normal text-[var(--text)]">설정 목록</h3>
            {configs.length === 0 ? (
              <p className="py-4 text-sm text-[var(--muted)]">설정된 분기 지급이 없습니다.</p>
            ) : (
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)]">
                    {(["직원", "항목", "지급 월", "금액", ""] as const).map((h, i) => (
                      <th
                        key={h || `c-${i}`}
                        className={`dash-table-th-md ${h === "금액" ? "dash-table-vline-strong text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => {
                    const e = employees.find((x) => x.id === c.employeeId);
                    /** 한 달짜리만 저장된 행 — 운영자가 의도해서 한 달인지, PB 컬럼 누락인지 한 눈에 알아야 함 */
                    const onlyOneMonth = c.paymentMonths.length === 1;
                    const empLabel = e ? `${e.employeeCode} ${e.name}` : c.employeeId;
                    return (
                      <tr key={c.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                        <td className="py-2 pr-4">{empLabel}</td>
                        <td className="py-2 pr-4">{QUARTERLY_ITEM_LABELS[c.itemKey as QuarterlyItemKey] ?? c.itemKey}</td>
                        <td className="py-2 pr-4 tabular-nums">
                          {c.paymentMonths.length ? (
                            <span
                              className={
                                onlyOneMonth
                                  ? "rounded bg-[var(--warn-soft)] px-1.5 py-0.5 text-[var(--warn)]"
                                  : undefined
                              }
                              title={
                                onlyOneMonth
                                  ? "1개 달만 저장됨. 의도한 게 아니라면 PB 컬럼 paymentMonths 점검 후 다시 저장하세요."
                                  : undefined
                              }
                            >
                              {c.paymentMonths.join("·")}월
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="dash-table-vline-strong py-2 text-right font-mono tabular-nums">
                          {Number(c.amount).toLocaleString("ko-KR")}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <QuarterlyConfigDeleteButton
                            configId={c.id}
                            description={`직원: ${empLabel}\n항목: ${
                              QUARTERLY_ITEM_LABELS[c.itemKey as QuarterlyItemKey] ?? c.itemKey
                            }\n지급 월: ${c.paymentMonths.length ? c.paymentMonths.join("·") + "월" : "—"}\n금액: ${Number(
                              c.amount,
                            ).toLocaleString("ko-KR")}원`}
                          />
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
    <div className="space-y-2">
      <div>
        <h1 className="neu-title-gradient text-xl font-bold sm:text-2xl">지급 규칙</h1>
        <p className="mt-0.5 text-sm leading-snug text-[var(--muted)]">
          레벨별 정기 지급 금액·분기 지원 요율·분기 대상자까지 한 페이지에서 관리합니다.
        </p>
      </div>

      <Tabs
        tabs={[
          { label: "레벨별 정기 지급", content: levelTab },
          { label: "분기 지원 요율", content: quarterlyRatesTab },
          { label: "분기 대상자 체크", content: quarterlyBulkTab },
          { label: "직원별 분기 항목", content: quarterlyEmployeeTab },
        ]}
      />
    </div>
  );
}
