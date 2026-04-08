import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-context";
import { redirect } from "next/navigation";

export default async function AuditPage() {
  const session = await requireSession();
  if (!session.isPlatformAdmin) {
    redirect("/dashboard");
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { tenant: { select: { code: true, name: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">감사 로그</h1>
      <p className="text-sm text-[var(--muted)]">플랫폼 관리자 · 최근 200건 (업체 구분은 tenantId 기준)</p>
      <div className="overflow-x-auto surface p-2">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-2">시각</th>
              <th className="py-2">사용자</th>
              <th className="py-2">동작</th>
              <th className="py-2">엔티티</th>
              <th className="py-2">업체</th>
              <th className="py-2">ID</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-[var(--border)]">
                <td className="whitespace-nowrap py-1">{l.createdAt.toISOString()}</td>
                <td className="py-1">{l.userId ?? "-"}</td>
                <td className="py-1">{l.action}</td>
                <td className="py-1">{l.entity}</td>
                <td className="max-w-[140px] truncate py-1">
                  {l.tenant ? `${l.tenant.name} (${l.tenant.code})` : "—"}
                </td>
                <td className="max-w-[180px] truncate py-1">{l.entityId ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="p-4 text-[var(--muted)]">기록 없음</p>}
      </div>
    </div>
  );
}
