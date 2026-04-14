import { notFound } from "next/navigation";
import {
  companySettingsByTenant,
  employeeFindFirst,
  level5OverrideListByEmployeeYear,
} from "@/lib/pb/repository";
import type { CustomPaymentEventDef } from "@/types/models";
import { koreaMinimumAnnualSalaryWon } from "@/lib/domain/korea-minimum-wage";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees, canEditLevelRules } from "@/lib/permissions";
import { EmployeeForm } from "@/components/EmployeeForm";
import {
  customPaymentDefsForYear,
  orderedBuiltinPaymentEventKeys,
  paymentEventLabel,
  paymentEventLabelSingleLine,
} from "@/lib/domain/payment-events";
import { deleteLevel5OverrideFormAction, saveLevel5OverrideFormAction } from "@/app/actions/levelRules";
import { CommaWonInput } from "@/components/CommaWonInput";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";

async function OverrideForm({
  employeeId,
  year,
  customDefs,
}: {
  employeeId: string;
  year: number;
  customDefs: CustomPaymentEventDef[];
}) {
  const existing = await level5OverrideListByEmployeeYear(employeeId, year);
  const builtinKeys = orderedBuiltinPaymentEventKeys();

  return (
    <div className="space-y-4">
      <form action={saveLevel5OverrideFormAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="year" value={year} />
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--muted)]">이벤트</label>
          <select name="eventKey" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" required>
            {builtinKeys.map((k) => (
              <option key={k} value={k}>
                {paymentEventLabelSingleLine(k, customDefs)}
              </option>
            ))}
            {customDefs.map((d) => (
              <option key={d.eventKey} value={d.eventKey}>
                {paymentEventLabelSingleLine(d.eventKey, customDefs)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">금액</label>
          <CommaWonInput
            name="amount"
            required
            className="input mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
            오버라이드 저장
          </button>
        </div>
      </form>
      <ul className="mt-4 space-y-2 text-sm">
        {existing.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
            <span className="whitespace-pre-line">
              {paymentEventLabel(o.eventKey, customDefs)}:{" "}
              <strong>{o.amount.toLocaleString("ko-KR")}</strong> 원
            </span>
            <form action={deleteLevel5OverrideFormAction}>
              <input type="hidden" name="employeeId" value={employeeId} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="eventKey" value={o.eventKey} />
              <button type="submit" className="text-xs text-[var(--danger)] hover:underline">
                삭제
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantContext();
  const emp = await employeeFindFirst(id, tenantId);
  if (!emp) notFound();

  const settings = await companySettingsByTenant(tenantId);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const minimumAnnualSalaryWon = koreaMinimumAnnualSalaryWon(year);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        직원 상세 — {emp.name}{" "}
        <span className="text-base font-normal text-[var(--muted)]">({emp.employeeCode})</span>
      </h1>

      {canEditEmployees(role) ? (
        <EmployeeForm
          employee={emp}
          activeYear={year}
          foundingMonth={settings?.foundingMonth ?? 1}
          minimumAnnualSalaryWon={minimumAnnualSalaryWon}
          surveyShowRepReturn={settings?.surveyShowRepReturn ?? false}
          surveyShowSpouseReceipt={settings?.surveyShowSpouseReceipt ?? false}
          surveyShowWorkerNet={settings?.surveyShowWorkerNet ?? false}
        />
      ) : (
        <p className="text-sm text-[var(--muted)]">조회 전용입니다.</p>
      )}

      {emp.level === 5 && canEditLevelRules(role) && (
        <CollapsibleEditorPanel
          title="레벨 5 · 이벤트별 금액 오버라이드"
          description="직원별 금액이 레벨 공통보다 우선합니다. 삭제하면 공통 금액이 다시 적용됩니다."
          triggerLabel="오버라이드 열기"
          defaultOpen={false}
          summary={<p className="text-sm text-[var(--muted)]">직원별 정기 지급액을 레벨 공통보다 우선 적용합니다.</p>}
        >
          <OverrideForm employeeId={emp.id} year={year} customDefs={customPaymentDefsForYear(settings, year)} />
        </CollapsibleEditorPanel>
      )}
    </div>
  );
}
