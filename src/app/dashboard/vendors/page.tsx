import Link from "next/link";
import { vendorListByTenant } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { VendorCreateForm } from "@/components/VendorCreateForm";
import { VendorsSubNav } from "@/components/VendorsSubNav";
import { redirect } from "next/navigation";

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function VendorsPage() {
  const { tenantId, role } = await requireTenantContext();
  if (!canEditCompanySettings(role)) {
    redirect("/dashboard");
  }

  const list = await vendorListByTenant(tenantId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="neu-title-gradient text-2xl font-bold">거래처 등록</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          사복 관련 거래처별로 개인/법인을 구분합니다. 출연금 등록 시 법인은 사업장 자본금의 50%까지 추가 적립(출연금의 20%)이 반영되고, 개인은 매번 20%가 누적됩니다.
        </p>
      </div>

      <VendorsSubNav active="list" />

      <VendorCreateForm />

      <div className="surface overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-semibold">거래처 목록</h2>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-2">코드</th>
              <th className="py-2">이름</th>
              <th className="py-2">유형</th>
              <th className="py-2 text-right">자본금</th>
              <th className="py-2 text-right">누적 추가적립</th>
              <th className="py-2">상태</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className="border-b border-[var(--border)]">
                <td className="py-2 font-mono">{v.code}</td>
                <td className="py-2">{v.name}</td>
                <td className="py-2">{v.businessType === "CORPORATE" ? "법인" : "개인"}</td>
                <td className="py-2 text-right">{v.businessType === "CORPORATE" ? fmt(v.workplaceCapital) : "—"}</td>
                <td className="py-2 text-right">{fmt(v.accumulatedReserve)}</td>
                <td className="py-2">{v.active ? "활성" : "비활성"}</td>
                <td className="py-2">
                  <Link href={`/dashboard/vendors/${v.id}`} className="text-[var(--accent)] hover:underline">
                    상세
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="py-4 text-sm text-[var(--muted)]">등록된 거래처가 없습니다.</p>}
      </div>
    </div>
  );
}
