import { notFound } from "next/navigation";
import {
  companySettingsByTenant,
  employeeFindFirst,
  employeeListByTenantCodeAsc,
  level5OverrideListByEmployeeYear,
  levelPaymentRuleList,
  levelTargetList,
  tenantGetById,
} from "@/lib/pb/repository";
import { parseTenantOperationMode } from "@/lib/domain/tenant-profile";
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
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";

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

  const [settings, allEmployees, tenant] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
    tenantGetById(tenantId),
  ]);
  const year = settings?.activeYear ?? new Date().getFullYear();
  const minimumAnnualSalaryWon = koreaMinimumAnnualSalaryWon(year);
  const existingEmployees = allEmployees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.name,
    position: e.position,
  }));
  /** 레벨 변경 시 ‘사복지급분’ 비어 있으면 레벨 목표액으로 자동 채움 (작성된 값은 보존) */
  const levelTargets = await levelTargetList(tenantId, year);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="직원 상세"
        title={emp.name}
        actions={
          <Link href="/dashboard/employees" className="btn btn-outline text-sm">
            ← 직원 목록
          </Link>
        }
        meta={
          <>
            <span className="trust-pill">사번 {emp.employeeCode}</span>
            <span className="trust-pill">Lv.{emp.level}</span>
            {emp.position ? <span className="trust-pill">{emp.position}</span> : null}
          </>
        }
      />

      {canEditEmployees(role) ? (
        <EmployeeForm
          employee={emp}
          activeYear={year}
          foundingMonth={settings?.foundingMonth ?? 1}
          minimumAnnualSalaryWon={minimumAnnualSalaryWon}
          tenantSalaryInclusionVarianceMode={settings?.salaryInclusionVarianceMode ?? "BOTH"}
          tenantOperationMode={parseTenantOperationMode(tenant?.operationMode)}
          surveyShowRepReturn={settings?.surveyShowRepReturn ?? false}
          surveyShowSpouseReceipt={settings?.surveyShowSpouseReceipt ?? false}
          surveyShowWorkerNet={settings?.surveyShowWorkerNet ?? false}
          existingEmployees={existingEmployees}
          levelTargets={levelTargets}
        />
      ) : (
        <p className="text-sm text-[var(--muted)]">조회 전용입니다.</p>
      )}

      {emp.level === 5 && canEditLevelRules(role) && (
        <CollapsibleEditorPanel
          title="레벨 5 · 이벤트별 금액 오버라이드"
          triggerLabel="열기"
          defaultOpen={false}
        >
          <OverrideMatrix employeeId={emp.id} tenantId={tenantId} year={year} />
        </CollapsibleEditorPanel>
      )}
    </div>
  );
}
