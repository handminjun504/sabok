import { redirect } from "next/navigation";
import { tenantListAllByCodeAscWithCounts } from "@/lib/pb/repository";
import { requireSession } from "@/lib/auth-context";
import { createTenantFormAction, setTenantActiveFormAction } from "@/app/actions/tenant-admin";

export default async function TenantsAdminPage() {
  const session = await requireSession();
  if (!session.isPlatformAdmin) {
    redirect("/dashboard");
  }

  const tenants = await tenantListAllByCodeAscWithCounts();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">업체(고객사) 관리</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">위탁 운영 단위별 테넌트를 생성·비활성화합니다.</p>
      </div>

      <form action={createTenantFormAction} className="surface max-w-xl space-y-4 p-6">
        <h2 className="text-sm font-semibold">새 업체</h2>
        <div>
          <label className="text-xs text-[var(--muted)]">업체 코드 (영문·숫자 권장)</label>
          <input name="code" required className="input mt-1" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">업체명</label>
          <input name="name" required className="input mt-1" />
        </div>
        <button type="submit" className="btn btn-primary px-4 py-2 text-sm">
          업체 생성
        </button>
      </form>

      <div className="surface overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-semibold">업체 목록</h2>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-2">코드</th>
              <th className="py-2">이름</th>
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
