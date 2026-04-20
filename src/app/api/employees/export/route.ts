import { NextResponse } from "next/server";
import { buildEmployeeSheetCsv } from "@/lib/csv-import";
import { companySettingsByTenant, employeeListByTenantCodeAsc } from "@/lib/pb/repository";
import { requireApiCallerTenant } from "@/lib/api-tenant";

export async function GET() {
  const caller = await requireApiCallerTenant();
  if (!caller.ok) return caller.response;

  const [list, settings] = await Promise.all([
    employeeListByTenantCodeAsc(caller.tenantId),
    companySettingsByTenant(caller.tenantId),
  ]);
  const csv = buildEmployeeSheetCsv(list, settings);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sabok-employees-sheet.csv"`,
    },
  });
}
