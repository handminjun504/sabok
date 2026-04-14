import { addCustomPaymentEventFormAction } from "@/app/actions/levelRules";
import {
  allPaymentEventKeysForYear,
  customPaymentDefsForYear,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import { companySettingsByTenant, levelPaymentRuleList } from "@/lib/pb/repository";
import { canEditLevelRules } from "@/lib/permissions";
import { requireTenantContext } from "@/lib/tenant-context";
import { LevelRulesMatrixForm } from "@/components/LevelRulesMatrixForm";

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

export default async function LevelsPage() {
  const { tenantId, role } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();

  const rules = await levelPaymentRuleList(tenantId, year);

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
  for (let lv = 1; lv <= 5; lv++) {
    for (const ev of eventKeys) {
      amountsByLevelEvent[`${lv}_${ev}`] = Number(ruleMap.get(`${lv}_${ev}`) ?? 0);
    }
  }
  const rulesSignature = [...rules]
    .sort((a, b) => (a.level !== b.level ? a.level - b.level : a.eventKey.localeCompare(b.eventKey)))
    .map((r) => `${r.level}:${r.eventKey}:${r.amount}`)
    .join("|");

  return (
    <div className="space-y-2">
      <div>
        <h1 className="neu-title-gradient text-xl font-bold sm:text-2xl">레벨별 정기 지급 금액</h1>
        <p className="mt-0.5 text-sm leading-snug text-[var(--muted)]">
          기준 연도 <strong className="text-[var(--text)]">{year}</strong> · 세로 레벨(1~5) · 가로 행사 · 레벨 5는 직원 상세에서 개별 조정
        </p>
      </div>

      <div className="space-y-1.5">
        {!canEdit && (
          <p className="text-sm text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
        )}

        {canEdit ? (
          <LevelRulesMatrixForm
            year={year}
            eventKeys={eventKeys}
            eventLabels={eventLabels}
            amountsByLevelEvent={amountsByLevelEvent}
            customEventKeys={customEventKeys}
            rulesSignature={rulesSignature}
          />
        ) : (
          <div className="surface overflow-x-auto px-2 py-2 sm:px-3 sm:py-2.5">
            <table className="min-w-max border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--border-strong)]">
                  <th className="sticky left z-10 bg-[var(--surface)] px-2 py-2 text-left text-sm font-bold text-[var(--text)]">
                    레벨 / 행사
                  </th>
                  {eventKeys.map((ev, evIdx) => (
                    <th
                      key={ev}
                      className={`max-w-[9rem] whitespace-normal px-2 py-2 text-center text-sm font-semibold leading-snug text-[var(--text)] ${
                        evIdx === 0 ? "dash-table-vline-strong" : "dash-table-vline"
                      }`}
                    >
                      <span className="whitespace-pre-line text-[var(--text)]">{eventLabels[evIdx]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <tr key={lv} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                    <td className="sticky left z-[1] bg-[var(--surface)] px-2 py-1.5 text-left text-sm font-semibold whitespace-nowrap text-[var(--text)]">
                      레벨 {lv}
                    </td>
                    {eventKeys.map((ev, evIdx) => (
                      <td
                        key={ev}
                        className={`px-1 py-1 text-center ${
                          evIdx === 0 ? "dash-table-vline-strong" : "dash-table-vline"
                        }`}
                      >
                        <span className="inline-block min-w-[5.5rem] font-mono text-sm font-medium tabular-nums text-[var(--text)]">
                          {fmtInt(Number(ruleMap.get(`${lv}_${ev}`) ?? 0))}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
}
