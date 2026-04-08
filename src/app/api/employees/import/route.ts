import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canEditEmployees } from "@/lib/permissions";
import { parseEmployeeCsv } from "@/lib/csv-import";
import { writeAudit } from "@/lib/audit";
import { employeeUpsertByTenantCode, userTenantFind } from "@/lib/pb/repository";

async function resolveTenantIdForApi(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  if (!session.activeTenantId) {
    return { ok: false as const, 응답: NextResponse.json({ 오류: "업체를 먼저 선택하세요." }, { status: 400 }) };
  }
  const tenantId = session.activeTenantId;
  if (session.isPlatformAdmin) return { ok: true as const, tenantId };
  const ut = await userTenantFind(session.sub, tenantId);
  if (!ut) return { ok: false as const, 응답: NextResponse.json({ 오류: "권한 없음" }, { status: 403 }) };
  return { ok: true as const, tenantId };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ 오류: "로그인 필요" }, { status: 401 });
  if (!canEditEmployees(session.role)) return NextResponse.json({ 오류: "권한 없음" }, { status: 403 });

  const rTen = await resolveTenantIdForApi(session);
  if (!rTen.ok) return rTen.응답;
  const { tenantId } = rTen;

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
      incentiveAmount:
        f.incentiveAmount != null && f.incentiveAmount !== "" ? Number(f.incentiveAmount) : null,
      discretionaryAmount:
        f.discretionaryAmount != null && f.discretionaryAmount !== "" ? Number(f.discretionaryAmount) : null,
      birthMonth: f.birthMonth as number | null,
      hireMonth: f.hireMonth as number | null,
      weddingMonth: f.weddingMonth as number | null,
      childrenInfant: Number(f.childrenInfant),
      childrenPreschool: Number(f.childrenPreschool),
      childrenTeen: Number(f.childrenTeen),
      parentsCount: Number(f.parentsCount),
      parentsInLawCount: Number(f.parentsInLawCount),
      insurancePremium: Number(f.insurancePremium),
      loanInterest: Number(f.loanInterest),
      payDay: f.payDay as number | null,
      level: Number(f.level),
      flagAutoAmount: Boolean(f.flagAutoAmount),
      flagRepReturn: Boolean(f.flagRepReturn),
      flagSpouseReceipt: Boolean(f.flagSpouseReceipt),
      flagWorkerNet: Boolean(f.flagWorkerNet),
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
    userId: session.sub,
    tenantId,
    action: "CSV_IMPORT",
    entity: "Employee",
    payload: { 건수: 결과.length },
  });

  return NextResponse.json({ 결과 });
}
