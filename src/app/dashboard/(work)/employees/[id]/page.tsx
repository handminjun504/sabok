import { notFound } from "next/navigation";
import {
  companySettingsByTenant,
  employeeFindFirst,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeYear,
  levelPaymentRuleList,
} from "@/lib/pb/repository";
import { koreaMinimumAnnualSalaryWon } from "@/lib/domain/korea-minimum-wage";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees, canEditLevelRules } from "@/lib/permissions";
import { EmployeeForm } from "@/components/EmployeeForm";
import {
  allPaymentEventKeysForYear,
  customPaymentDefsForYear,
  paymentEventLabel,
} from "@/lib/domain/payment-events";
import { CollapsibleEditorPanel } from "@/components/CollapsibleEditorPanel";
import { Level5OverrideMatrixForm, type Level5OverrideRow } from "@/components/Level5OverrideMatrixForm";

async function OverrideMatrix({
  employeeId,
  tenantId,
  year,
}: {
  employeeId: string;
  tenantId: string;
  year: number;
}) {
  const settings = await companySettingsByTenant(tenantId);
  const customDefs = customPaymentDefsForYear(settings, year);
  const eventKeys = allPaymentEventKeysForYear(settings, year);

  const [rules, overrides] = await Promise.all([
    levelPaymentRuleList(tenantId, year),
    level5OverrideListByEmployeeYear(employeeId, year),
  ]);

  const level5DefaultByEvent = new Map<string, number>();
  for (const r of rules) {
    if (r.year === year && r.level === 5) {
      level5DefaultByEvent.set(r.eventKey, Math.round(r.amount));
    }
  }
  const overrideByEvent = new Map<string, number>();
  for (const o of overrides) {
    overrideByEvent.set(o.eventKey, Math.round(o.amount));
  }

  const rows: Level5OverrideRow[] = eventKeys.map((ev) => ({
    eventKey: ev,
    label: paymentEventLabel(ev, customDefs),
    defaultAmountWon: level5DefaultByEvent.get(ev) ?? 0,
    overrideAmountWon: overrideByEvent.has(ev) ? (overrideByEvent.get(ev) ?? 0) : null,
  }));

  /** 행사 추가/삭제 등 구조 변경 시에만 바뀌는 키 */
  const rulesSignature = `${year}|${eventKeys.join(",")}`;

  return (
    <Level5OverrideMatrixForm
      employeeId={employeeId}
      year={year}
      rows={rows}
      rulesSignature={rulesSignature}
    />
  );
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantContext();
  const emp = await employeeFindFirst(id, tenantId);
  if (!emp) notFound();

  const [settings, allEmployees] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const minimumAnnualSalaryWon = koreaMinimumAnnualSalaryWon(year);
  const existingEmployees = allEmployees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.name,
    position: e.position,
  }));

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
          tenantSalaryInclusionVarianceMode={settings?.salaryInclusionVarianceMode ?? "BOTH"}
          surveyShowRepReturn={settings?.surveyShowRepReturn ?? false}
          surveyShowSpouseReceipt={settings?.surveyShowSpouseReceipt ?? false}
          surveyShowWorkerNet={settings?.surveyShowWorkerNet ?? false}
          existingEmployees={existingEmployees}
        />
      ) : (
        <p className="text-sm text-[var(--muted)]">조회 전용입니다.</p>
      )}

      {emp.level === 5 && canEditLevelRules(role) && (
        <CollapsibleEditorPanel
          title="레벨 5 · 이벤트별 금액 오버라이드"
          description="직원별 금액이 레벨 공통보다 우선합니다. 셀에 입력하면 자동 저장되고, 0/빈값이면 공통 금액이 다시 적용됩니다."
          triggerLabel="오버라이드 열기"
          defaultOpen={false}
          summary={<p className="text-sm text-[var(--muted)]">행사별 금액을 표에서 바로 입력·자동 저장합니다.</p>}
        >
          <OverrideMatrix employeeId={emp.id} tenantId={tenantId} year={year} />
        </CollapsibleEditorPanel>
      )}
    </div>
  );
}
