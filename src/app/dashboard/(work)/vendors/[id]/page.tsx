import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL,
  VENDOR_CONTRIBUTION_RESERVE_RATE,
} from "@/lib/domain/vendor-reserve";
import { vendorContributionListByVendor, vendorFindFirst } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import { VendorEditForm } from "@/components/VendorEditForm";
import { VendorContributionForm } from "@/components/VendorContributionForm";

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantContext();
  if (!canEditCompanySettings(role)) {
    redirect("/dashboard");
  }

  const vendor = await vendorFindFirst(id, tenantId);
  if (!vendor) notFound();

  const history = await vendorContributionListByVendor(vendor.id, 100);
  const cap =
    vendor.businessType === "CORPORATE"
      ? Math.round(vendor.workplaceCapital * CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL)
      : null;
  const remainingToCap = cap != null ? Math.max(0, cap - vendor.accumulatedReserve) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/dashboard/vendors" className="text-sm text-[var(--accent)] hover:underline">
          ← 목록
        </Link>
        <h1 className="neu-title-gradient text-2xl font-bold">
          {vendor.name} <span className="font-mono text-base font-normal text-[var(--muted)]">({vendor.code})</span>
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface p-4 text-sm">
          <p className="text-[var(--muted)]">유형</p>
          <p className="mt-1 font-medium">{vendor.businessType === "CORPORATE" ? "법인사업자" : "개인사업자"}</p>
          {vendor.businessType === "CORPORATE" && (
            <>
              <p className="mt-3 text-[var(--muted)]">사업장 자본금</p>
              <p className="mt-1">{fmt(vendor.workplaceCapital)} 원</p>
              <p className="mt-3 text-[var(--muted)]">추가 적립 상한 (자본금 × {CORPORATE_RESERVE_CAP_RATIO_OF_CAPITAL * 100}%)</p>
              <p className="mt-1">{fmt(cap!)} 원</p>
              <p className="mt-3 text-[var(--muted)]">현재 누적 추가 적립 / 남은 여유</p>
              <p className="mt-1">
                {fmt(vendor.accumulatedReserve)} 원 / {fmt(remainingToCap!)} 원
              </p>
            </>
          )}
          {vendor.businessType === "INDIVIDUAL" && (
            <>
              <p className="mt-3 text-[var(--muted)]">출연금 대비 추가 적립 비율</p>
              <p className="mt-1">{VENDOR_CONTRIBUTION_RESERVE_RATE * 100}% (상한 없음)</p>
              <p className="mt-3 text-[var(--muted)]">누적 추가 적립</p>
              <p className="mt-1">{fmt(vendor.accumulatedReserve)} 원</p>
            </>
          )}
        </div>
      </div>

      <VendorEditForm vendor={vendor} />
      <VendorContributionForm vendorId={vendor.id} disabled={!vendor.active} />

      <div className="surface p-4">
        <h2 className="text-sm font-semibold">출연금 이력</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="py-2">일시</th>
                <th className="py-2 text-right">출연금</th>
                <th className="py-2 text-right">추가 적립</th>
                <th className="py-2 text-right">적립 후 누적</th>
                <th className="py-2">비고</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-[var(--border)]">
                  <td className="py-1 whitespace-nowrap">{h.created.toLocaleDateString("ko-KR")}</td>
                  <td className="py-1 text-right">{fmt(h.contributionAmount)}</td>
                  <td className="py-1 text-right">{fmt(h.additionalReserved)}</td>
                  <td className="py-1 text-right">{fmt(h.reserveAfter)}</td>
                  <td className="max-w-[200px] truncate py-1">{h.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <p className="py-4 text-[var(--muted)]">이력 없음</p>}
        </div>
      </div>
    </div>
  );
}
