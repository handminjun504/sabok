import {
  companySettingsByTenant,
  levelPaymentRuleList,
  levelTargetList,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { PAYMENT_EVENT, PAYMENT_EVENT_LABELS, type PaymentEventKey } from "@/lib/business-rules";
import { canEditLevelRules } from "@/lib/permissions";
import { saveLevelRulesFormAction, saveLevelTargetFormAction } from "@/app/actions/levelRules";
import { Tabs } from "@/components/Tabs";

const INPUT_CLS =
  "w-28 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]";

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

  const events = Object.values(PAYMENT_EVENT) as PaymentEventKey[];
  const canEdit = canEditLevelRules(role);

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
                  <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">행사</th>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <th key={lv} className="py-2 pr-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      레벨 {lv}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                    <td className="py-2 pr-4 text-sm">{PAYMENT_EVENT_LABELS[ev]}</td>
                    {[1, 2, 3, 4, 5].map((lv) => (
                      <td key={lv} className="py-1.5 pr-2">
                        <input
                          name={`amt_${lv}_${ev}`}
                          defaultValue={ruleMap.get(`${lv}_${ev}`) ?? "0"}
                          className={INPUT_CLS}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </form>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--border)]">
                <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">행사</th>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <th key={lv} className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    레벨 {lv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                  <td className="py-2 pr-4">{PAYMENT_EVENT_LABELS[ev]}</td>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <td key={lv} className="py-2 pr-4 font-mono">
                      {Number(ruleMap.get(`${lv}_${ev}`) ?? 0).toLocaleString("ko-KR")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const targetsTab = (
    <div className="surface p-5">
      <form action={saveLevelTargetFormAction} className="space-y-4">
        {!canEdit && <p className="text-sm text-[var(--muted)]">조회만 가능합니다.</p>}
        <input type="hidden" name="year" value={year} />
        <div className="grid gap-4 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((lv) => (
            <div key={lv}>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">레벨 {lv}</label>
              <input
                name={`target_${lv}`}
                defaultValue={targetMap.get(lv) ?? "0"}
                readOnly={!canEdit}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] read-only:bg-[var(--surface-hover)] read-only:text-[var(--muted)]"
              />
            </div>
          ))}
        </div>
        {canEdit && (
          <button type="submit" className="btn btn-primary">
            목표액 저장
          </button>
        )}
      </form>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">레벨별 정기 지급 금액</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기준 연도 <strong>{year}</strong> — 동일 레벨 직원은 행사별 대표 금액을 적용합니다. 레벨 5는 직원 상세에서 개별 오버라이드 가능합니다.
        </p>
      </div>
      <Tabs
        tabs={[
          { label: "정기 지급 금액", content: rulesTab },
          { label: "레벨별 연간 목표액", content: targetsTab },
        ]}
      />
    </div>
  );
}
