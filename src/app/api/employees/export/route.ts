import { NextResponse } from "next/server";
import { canAccessAnyTenant, getSession } from "@/lib/session";
import { buildEmployeeSheetCsv } from "@/lib/csv-import";
import { employeeListByTenantCodeAsc, userTenantFind } from "@/lib/pb/repository";

async function resolveTenantIdForApi(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  if (!session.activeTenantId) {
    return { ok: false as const, 응답: NextResponse.json({ 오류: "업체를 먼저 선택하세요." }, { status: 400 }) };
  }
  const tenantId = session.activeTenantId;
  if (canAccessAnyTenant(session)) return { ok: true as const, tenantId };
  const ut = await userTenantFind(session.sub, tenantId);
  if (!ut) return { ok: false as const, 응답: NextResponse.json({ 오류: "권한 없음" }, { status: 403 }) };
  return { ok: true as const, tenantId };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ 오류: "로그인 필요" }, { status: 401 });

  const rTen = await resolveTenantIdForApi(session);
  if (!rTen.ok) return rTen.응답;

  const list = await employeeListByTenantCodeAsc(rTen.tenantId);
  const csv = buildEmployeeSheetCsv(list);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sabok-employees-sheet.csv"`,
    },
  });
}
