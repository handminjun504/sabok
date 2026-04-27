import { addCustomPaymentEventFormAction } from "@/app/actions/levelRules";
import {
  allPaymentEventKeysForYear,
  customPaymentDefsForYear,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import {
  companySettingsByTenant,
  employeeListByTenantCodeAsc,
  levelPaymentRuleList,
  quarterlyRateList,
} from "@/lib/pb/repository";
import { canEditLevelRules } from "@/lib/permissions";
import { requireTenantContext } from "@/lib/tenant-context";
import { LevelRulesMatrixForm } from "@/components/LevelRulesMatrixForm";
import { MidYearChangeButton } from "@/components/MidYearChangeButton";
import { QuarterlyRatesMatrixForm } from "@/components/QuarterlyRatesMatrixForm";
import { Tabs } from "@/components/Tabs";


export default async function PaymentRulesPage() {
  const { tenantId, role } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();

  const [rules, rates, employees] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    quarterlyRateList(tenantId, year),
    employeeListByTenantCodeAsc(tenantId),
  ]);

  const ruleMap = new Map<string, string>();
  for (const r of rules) {
    ruleMap.set(`${r.level}_${r.eventKey}`, String(r.amount));
  }

  const customDefs = customPaymentDefsForYear(settings, year);
  const eventKeys = allPaymentEventKeysForYear(settings, year);
  const canEdit = canEditLevelRules(role);

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
          canEdit={canEdit}
        />
      </div>

      <div className="space-y-1.5">
        {!canEdit && (
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

        {canEdit && (
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

  const quarterlyTab = (
    <QuarterlyRatesMatrixForm
      year={year}
      rates={rates}
      canEdit={canEdit}
    />
  );

  return (
    <div className="space-y-2">
      <div>
        <h1 className="neu-title-gradient text-xl font-bold sm:text-2xl">지급 규칙</h1>
        <p className="mt-0.5 text-sm leading-snug text-[var(--muted)]">
          레벨별 정기 지급 금액과 분기 지원 요율을 한 곳에서 관리합니다.
        </p>
      </div>

      <Tabs
        tabs={[
          { label: "레벨별 정기 지급", content: levelTab },
          { label: "분기 지원 요율", content: quarterlyTab },
        ]}
      />
    </div>
  );
}
