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
import { PAYMENT_EVENT_LABELS } from "@/lib/business-rules";
import {
  customPaymentDefsForYear,
  orderedBuiltinPaymentEventKeys,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import { deleteLevel5OverrideFormAction, saveLevel5OverrideFormAction } from "@/app/actions/levelRules";

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
    <div className="surface p-4">
      <h2 className="text-sm font-semibold">레벨 5 전용: 이벤트별 금액 오버라이드</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">여기 금액이 레벨 공통보다 우선. 삭제 시 공통.</p>
      <form action={saveLevel5OverrideFormAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="year" value={year} />
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--muted)]">이벤트</label>
          <select name="eventKey" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" required>
            {builtinKeys.map((k) => (
              <option key={k} value={k}>
                {PAYMENT_EVENT_LABELS[k]}
              </option>
            ))}
            {customDefs.map((d) => (
              <option key={d.eventKey} value={d.eventKey}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">금액</label>
          <input name="amount" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" required />
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
            <span>
              {paymentEventLabel(o.eventKey, customDefs)}: <strong>{String(o.amount)}</strong> 원
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
        />
      ) : (
        <p className="text-sm text-[var(--muted)]">조회 전용입니다.</p>
      )}

      {emp.level === 5 && canEditLevelRules(role) && (
        <OverrideForm employeeId={emp.id} year={year} customDefs={customPaymentDefsForYear(settings, year)} />
      )}
    </div>
  );
}
