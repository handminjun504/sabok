import {
  companySettingsByTenant,
  levelPaymentRuleList,
  levelTargetList,
} from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { PAYMENT_EVENT, PAYMENT_EVENT_LABELS, type PaymentEventKey } from "@/lib/business-rules";
import { canEditLevelRules } from "@/lib/permissions";
import { saveLevelRulesFormAction, saveLevelTargetFormAction } from "@/app/actions/levelRules";

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">레벨별 정기 지급 금액</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          동일 레벨 직원은 행사(신년·가정의달·추석·연말·입사·창립·생일·결혼)별 대표 금액을 적용합니다. 레벨 5는 직원
          상세에서 개별 오버라이드가 가능합니다.
        </p>
      </div>

      {!canEdit && (
        <p className="rounded-lg border border-[var(--warn)] p-3 text-sm text-[var(--warn)]">
          조회 전용입니다. 레벨 규칙 수정은 선임·관리자만 가능합니다.
        </p>
      )}

      {canEdit ? (
        <form action={saveLevelRulesFormAction} className="space-y-4 overflow-x-auto surface p-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--muted)]">기준 연도</label>
            <input
              name="year"
              type="number"
              defaultValue={year}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
              정기 금액 저장
            </button>
          </div>
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="py-2 pr-4">행사</th>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <th key={lv} className="py-2 pr-2">
                    레벨 {lv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev} className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4">{PAYMENT_EVENT_LABELS[ev]}</td>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <td key={lv} className="py-1 pr-2">
                      <input
                        name={`amt_${lv}_${ev}`}
                        defaultValue={ruleMap.get(`${lv}_${ev}`) ?? "0"}
                        className="w-28 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </form>
      ) : (
        <div className="surface overflow-x-auto p-4">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="py-2">행사</th>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <th key={lv} className="py-2">
                    레벨 {lv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev} className="border-b border-[var(--border)]">
                  <td className="py-2">{PAYMENT_EVENT_LABELS[ev]}</td>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <td key={lv} className="py-2">
                      {ruleMap.get(`${lv}_${ev}`) ?? "0"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={saveLevelTargetFormAction} className="surface space-y-3 p-4">
        <h2 className="text-sm font-semibold">레벨별 사복 지급 목표액 (연간)</h2>
        {!canEdit && <p className="text-xs text-[var(--muted)]">조회만 가능합니다.</p>}
        <input type="hidden" name="year" value={year} />
        <div className="grid gap-3 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((lv) => (
            <div key={lv}>
              <label className="text-xs text-[var(--muted)]">레벨 {lv}</label>
              <input
                name={`target_${lv}`}
                defaultValue={targetMap.get(lv) ?? "0"}
                readOnly={!canEdit}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm disabled:opacity-70"
              />
            </div>
          ))}
        </div>
        {canEdit && (
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
            목표액 저장
          </button>
        )}
      </form>
    </div>
  );
}
