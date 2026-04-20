import { NextResponse } from "next/server";
import { canEditEmployees } from "@/lib/permissions";
import { parseEmployeeCsv } from "@/lib/csv-import";
import { writeAudit } from "@/lib/audit";
import { employeeUpsertByTenantCode } from "@/lib/pb/repository";
import { requireApiCallerTenant } from "@/lib/api-tenant";

export async function POST(req: Request) {
  const caller = await requireApiCallerTenant();
  if (!caller.ok) return caller.response;
  if (!canEditEmployees(caller.role)) {
    return NextResponse.json({ 오류: "권한 없음" }, { status: 403 });
  }
  const { tenantId, userId } = caller;

  const text = await req.text();
  const rows = parseEmployeeCsv(text);
  const 결과: { row: number; employeeCode: string; 상태: string; 메시지?: string }[] = [];

  for (const r of rows) {
    if (r.오류) {
      결과.push({ row: r.row, employeeCode: r.employeeCode, 상태: "건너뜀", 메시지: r.오류 });
      continue;
    }
    const f = r.fields;
    const code = String(f.employeeCode);
    const create = {
      name: String(f.name),
      position: String(f.position),
      baseSalary: Number(f.baseSalary),
      adjustedSalary: Number(f.adjustedSalary),
      welfareAllocation: Number(f.welfareAllocation),
      priorOverpaidWelfareWon:
        f.priorOverpaidWelfareWon != null && f.priorOverpaidWelfareWon !== ""
          ? Number(f.priorOverpaidWelfareWon)
          : null,
      incentiveAmount:
        f.incentiveAmount != null && f.incentiveAmount !== "" ? Number(f.incentiveAmount) : null,
      discretionaryAmount:
        f.discretionaryAmount != null && f.discretionaryAmount !== "" ? Number(f.discretionaryAmount) : null,
      birthMonth: f.birthMonth as number | null,
      hireMonth: f.hireMonth as number | null,
      resignMonth: f.resignMonth as number | null,
      resignYear: f.resignYear as number | null,
      weddingMonth: f.weddingMonth as number | null,
      childrenInfant: Number(f.childrenInfant),
      childrenPreschool: Number(f.childrenPreschool),
      childrenTeen: Number(f.childrenTeen),
      parentsCount: Number(f.parentsCount),
      parentsInLawCount: Number(f.parentsInLawCount),
      insurancePremium: Number(f.insurancePremium),
      loanInterest: Number(f.loanInterest),
      monthlyRentAmount: (() => {
        const s = f.monthlyRentAmount;
        if (s == null || s === "") return null;
        const n = Number(String(s).replace(/,/g, ""));
        return Number.isFinite(n) ? n : null;
      })(),
      payDay: f.payDay as number | null,
      level: Number(f.level),
      flagAutoAmount: Boolean(f.flagAutoAmount),
      flagRepReturn: Boolean(f.flagRepReturn),
      flagSpouseReceipt: Boolean(f.flagSpouseReceipt),
      flagWorkerNet: Boolean(f.flagWorkerNet),
      salaryInclusionVarianceMode: null,
    };
    try {
      await employeeUpsertByTenantCode(tenantId, code, { ...create, tenantId, employeeCode: code }, create);
      결과.push({ row: r.row, employeeCode: code, 상태: "저장됨" });
    } catch (e) {
      console.error(e);
      결과.push({
        row: r.row,
        employeeCode: code,
        상태: "오류",
        메시지: "DB 저장 실패",
      });
    }
  }

  await writeAudit({
    userId,
    tenantId,
    action: "CSV_IMPORT",
    entity: "Employee",
    payload: { 건수: 결과.length },
  });

  return NextResponse.json({ 결과 });
}
