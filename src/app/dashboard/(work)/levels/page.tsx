import {
  addCustomPaymentEventFormAction,
  deleteCustomPaymentEventFormAction,
  saveLevelRulesFormAction,
} from "@/app/actions/levelRules";
import { CommaWonInput } from "@/components/CommaWonInput";
import {
  allPaymentEventKeysForYear,
  customPaymentDefsForYear,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import { companySettingsByTenant, levelPaymentRuleList } from "@/lib/pb/repository";
import { canEditLevelRules } from "@/lib/permissions";
import { requireTenantContext } from "@/lib/tenant-context";

const INPUT_CLS =
  "w-[4.75rem] max-w-[5.25rem] rounded-md border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-xs tabular-nums focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-soft)]";

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

  const customEventKeys = eventKeys.filter((ev) => customDefs.some((c) => c.eventKey === ev));

  return (
    <div className="space-y-2">
      <div>
        <h1 className="neu-title-gradient text-lg font-bold sm:text-xl">레벨별 정기 지급 금액</h1>
        <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
          기준 연도 <strong className="text-[var(--text)]">{year}</strong> · 세로 레벨(1~5) · 가로 행사 · 레벨 5는 직원 상세에서 개별 조정
        </p>
      </div>

      <div className="space-y-2">
        {!canEdit && (
          <p className="text-xs text-[var(--warn)]">조회 전용입니다. 선임·관리자만 수정할 수 있습니다.</p>
        )}

        <div className="surface overflow-x-auto p-2.5 sm:p-3">
          {/* 중첩 form 금지: 삭제는 form 속성으로 연결된 별도 폼만 사용 */}
          <form action={canEdit ? saveLevelRulesFormAction : undefined} id="level-rules-save" className="space-y-1.5">
            <input type="hidden" name="year" value={year} />
            <table className="min-w-max border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-strong)]">
                  <th className="dash-table-th sticky left z-10 !px-2 !py-1.5 bg-[var(--surface)] text-left">
                    레벨 / 행사
                  </th>
                  {eventKeys.map((ev, evIdx) => {
                    const isCustom = customDefs.some((c) => c.eventKey === ev);
                    return (
                      <th
                        key={ev}
                        className={`dash-table-th max-w-[7.5rem] whitespace-normal text-center leading-tight !px-1 !py-1.5 ${
                          evIdx === 0 ? "dash-table-vline-strong" : "dash-table-vline"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-0">
                          <span className="whitespace-pre-line leading-snug">
                            {paymentEventLabel(ev, customDefs)}
                          </span>
                          {canEdit && isCustom && (
                            <button
                              type="submit"
                              form={`delete-custom-event-${ev}`}
                              className="font-normal text-[var(--danger)] hover:underline"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <tr key={lv} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                    <td className="sticky left z-[1] bg-[var(--surface)] px-2 py-1 text-left text-[0.6875rem] font-medium tracking-normal whitespace-nowrap text-[var(--text)]">
                      레벨 {lv}
                    </td>
                    {eventKeys.map((ev, evIdx) => (
                      <td
                        key={ev}
                        className={`px-0.5 py-0.5 text-center ${
                          evIdx === 0 ? "dash-table-vline-strong" : "dash-table-vline"
                        }`}
                      >
                        {canEdit ? (
                          <CommaWonInput
                            name={`amt_${lv}_${ev}`}
                            defaultValue={Number(ruleMap.get(`${lv}_${ev}`) ?? 0)}
                            className={INPUT_CLS}
                          />
                        ) : (
                          <span className="inline-block w-[4.75rem] font-mono text-xs tabular-nums">
                            {fmtInt(Number(ruleMap.get(`${lv}_${ev}`) ?? 0))}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit && (
              <button type="submit" className="btn btn-primary">
                저장
              </button>
            )}
          </form>
        </div>

        {canEdit &&
          customEventKeys.map((ev) => (
            <form
              key={ev}
              id={`delete-custom-event-${ev}`}
              action={deleteCustomPaymentEventFormAction}
              className="hidden"
              aria-hidden
            >
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="eventKey" value={ev} />
            </form>
          ))}

        {canEdit && (
          <form
            action={addCustomPaymentEventFormAction}
            className="surface flex flex-wrap items-end gap-2 p-2.5 sm:p-3"
          >
            <input type="hidden" name="year" value={year} />
            <div>
              <label className="dash-field-label">추가 행사명</label>
              <input
                name="label"
                required
                placeholder="예: 하계 휴가비"
                className="input w-44 text-xs"
              />
            </div>
            <div>
              <label className="dash-field-label">귀속 월</label>
              <select
                name="accrualMonth"
                required
                className="input w-[5.5rem] text-xs"
                defaultValue={6}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-outline">
              항목 추가
            </button>
            <p className="m-0 w-full text-[0.6875rem] leading-snug text-[var(--muted)]">귀속 월 기준 스케줄 반영, 키 자동.</p>
          </form>
        )}
      </div>
    </div>
  );
}
