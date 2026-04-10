import { redirect } from "next/navigation";
import { tenantListAllByCodeAscWithCounts } from "@/lib/pb/repository";
import { requireSession } from "@/lib/auth-context";
import { setTenantActiveFormAction } from "@/app/actions/tenant-admin";
import { isSingleTenantMode } from "@/lib/single-tenant";
import { tenantClientEntityLabel, tenantOperationModeLabel } from "@/lib/domain/tenant-profile";

export default async function TenantsAdminPage() {
  if (isSingleTenantMode()) redirect("/dashboard");
  const session = await requireSession();
  if (!session.isPlatformAdmin) {
    redirect("/dashboard");
  }

  const tenants = await tenantListAllByCodeAscWithCounts();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">거래처 관리</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">목록·활성 전환. 신규는 거래처 선택 화면 <strong>+</strong>.</p>
      </div>

      <div className="surface overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-semibold">거래처 목록</h2>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-2">코드</th>
              <th className="py-2">이름</th>
              <th className="py-2">사업자</th>
              <th className="py-2">운영 방식</th>
              <th className="py-2">활성</th>
              <th className="py-2">직원 수</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-[var(--border)]">
                <td className="py-2 font-mono">{t.code}</td>
                <td className="py-2">{t.name}</td>
                <td className="py-2 whitespace-nowrap">{tenantClientEntityLabel(t.clientEntityType)}</td>
                <td className="max-w-[12rem] py-2 text-xs leading-snug">{tenantOperationModeLabel(t.operationMode)}</td>
                <td className="py-2">{t.active ? "예" : "아니오"}</td>
                <td className="py-2">{t._count.employees}</td>
                <td className="py-2">
                  <form action={setTenantActiveFormAction}>
                    <input type="hidden" name="tenantId" value={t.id} />
                    <input type="hidden" name="active" value={t.active ? "false" : "true"} />
                    <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
                      {t.active ? "비활성화" : "활성화"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
