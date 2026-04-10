import {
  addCustomPaymentEventFormAction,
  deleteCustomPaymentEventFormAction,
  saveLevelRulesFormAction,
  saveLevelTargetFormAction,
} from "@/app/actions/levelRules";
import { Tabs } from "@/components/Tabs";
import {
  allPaymentEventKeysForYear,
  customPaymentDefsForYear,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import { WELFARE_ANNUAL_HINT, WELFARE_INTRO } from "@/lib/domain/welfare-payment-principles";
import { companySettingsByTenant, levelPaymentRuleList, levelTargetList } from "@/lib/pb/repository";
import { canEditLevelRules } from "@/lib/permissions";
import { requireTenantContext } from "@/lib/tenant-context";

const INPUT_CLS =
  "w-28 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]";

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

export default async function LevelsPage() {
  const { tenantId, role } = await requireTenantContext();
  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();

  const [rules, targets] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    levelTargetList(tenantId, year),
  ]);

  const ruleMap = new Map<string, string>();
  for (const r of rules) {
    ruleMap.set(`${r.level}_${r.eventKey}`, String(r.amount));
  }
  const targetMap = new Map<number, string>();
  for (const t of targets) {
    targetMap.set(t.level, String(t.targetAmount));
  }

  const customDefs = customPaymentDefsForYear(settings, year);
  const eventKeys = allPaymentEventKeysForYear(settings, year);
  const canEdit = canEditLevelRules(role);

  const targetsTab = (
    <div className="surface p-5">
      <form action={saveLevelTargetFormAction} className="space-y-4">
        {!canEdit && <p className="text-sm text-[var(--muted)]">조회만 가능합니다.</p>}
        <p className="text-sm text-[var(--muted)]">
          연간 목표를 행사 수만큼 <strong>만원 단위</strong>로 나눠 정기 지급 탭에 넣습니다. 만원 미만은 빠집니다.{" "}
          {WELFARE_ANNUAL_HINT}
        </p>
        <input type="hidden" name="year" value={year} />
        <div className="grid gap-4 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((lv) => (
            <div key={lv}>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">레벨 {lv}</label>
              <input
                name={`target_${lv}`}
                defaultValue={fmtInt(Number(targetMap.get(lv) ?? 0))}
                readOnly={!canEdit}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] read-only:bg-[var(--surface-hover)] read-only:text-[var(--muted)]"
              />
            </div>
          ))}
        </div>
        {canEdit && (
          <button type="submit" className="btn btn-primary">
            목표액 저장 및 정기 지급에 배분
          </button>
        )}
      </form>
    </div>
  );

  const rulesTab = (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-[var(--warn)]">
          조회 전용입니다. 레벨 규칙 수정은 선임·관리자만 가능합니다.
        </p>
      )}
      <div className="surface overflow-x-auto p-4">
        {canEdit ? (
          <form action={saveLevelRulesFormAction} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-[var(--muted)]">기준 연도</label>
                <input
                  name="year"
                  type="number"
                  defaultValue={year}
                  className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
              <button type="submit" className="btn btn-primary">
                저장
              </button>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--border)]">
                  <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    행사
                  </th>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <th
                      key={lv}
                      className="py-2 pr-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                    >
                      레벨 {lv}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventKeys.map((ev) => {
                  const isCustom = customDefs.some((c) => c.eventKey === ev);
                  return (
                    <tr key={ev} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{paymentEventLabel(ev, customDefs)}</span>
                          {isCustom && (
                            <form action={deleteCustomPaymentEventFormAction} className="inline">
                              <input type="hidden" name="year" value={year} />
                              <input type="hidden" name="eventKey" value={ev} />
                              <button
                                type="submit"
                                className="text-xs text-[var(--danger)] hover:underline"
                                title="이 행과 해당 연도 규칙·레벨5 오버라이드를 삭제합니다"
                              >
                                삭제
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                      {[1, 2, 3, 4, 5].map((lv) => (
                        <td key={lv} className="py-1.5 pr-2">
                          <input
                            name={`amt_${lv}_${ev}`}
                            defaultValue={fmtInt(Number(ruleMap.get(`${lv}_${ev}`) ?? 0))}
                            className={INPUT_CLS}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </form>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--border)]">
                <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  행사
                </th>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <th
                    key={lv}
                    className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                  >
                    레벨 {lv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventKeys.map((ev) => (
                <tr key={ev} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                  <td className="py-2 pr-4">{paymentEventLabel(ev, customDefs)}</td>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <td key={lv} className="py-2 pr-4 font-mono">
                      {fmtInt(Number(ruleMap.get(`${lv}_${ev}`) ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canEdit && (
          <form
            action={addCustomPaymentEventFormAction}
            className="mt-6 flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-4"
          >
            <input type="hidden" name="year" value={year} />
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">추가 행사명</label>
              <input
                name="label"
                required
                placeholder="예: 하계 휴가비"
                className="w-48 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">귀속 월</label>
              <select
                name="accrualMonth"
                required
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
                defaultValue={6}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary">
              항목 추가
            </button>
            <p className="w-full text-xs text-[var(--muted)]">
              추가된 행사는 스케줄에서 해당 귀속 월에만 집계됩니다. 키는 자동 부여됩니다.
            </p>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">레벨별 정기 지급 금액</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{WELFARE_INTRO}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도 <strong>{year}</strong>. 레벨별 행사 금액 적용, 레벨 5는 직원 상세에서만 따로 조정합니다.
        </p>
      </div>
      <Tabs
        tabs={[
          { label: "레벨별 연간 목표액", content: targetsTab },
          { label: "정기 지급 금액", content: rulesTab },
        ]}
      />
    </div>
  );
}
