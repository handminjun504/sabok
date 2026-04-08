import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-context";
import { switchTenantFormAction } from "@/app/actions/tenant-switch";

export default async function SelectTenantPage() {
  const session = await requireSession();

  let tenants: { id: string; code: string; name: string; active: boolean }[];
  if (session.isPlatformAdmin) {
    tenants = await prisma.tenant.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, active: true },
    });
  } else {
    const links = await prisma.userTenant.findMany({
      where: { userId: session.sub, tenant: { active: true } },
      include: { tenant: true },
      orderBy: { tenant: { code: "asc" } },
    });
    tenants = links.map((l) => ({
      id: l.tenant.id,
      code: l.tenant.code,
      name: l.tenant.name,
      active: l.tenant.active,
    }));
  }

  if (tenants.length === 0) {
    return (
      <div className="surface mx-auto max-w-lg p-8">
        <h1 className="text-xl font-bold">접근 가능한 업체 없음</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          플랫폼 관리자에게 업체 생성 또는 배정을 요청하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">업체 선택</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">작업할 고객사(위탁 업체)를 선택하세요.</p>
      </div>
      <ul className="space-y-3">
        {tenants.map((t) => (
          <li key={t.id} className="surface flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-semibold">{t.name}</p>
              <p className="text-xs text-[var(--muted)]">코드: {t.code}</p>
            </div>
            <form action={switchTenantFormAction}>
              <input type="hidden" name="tenantId" value={t.id} />
              <button
                type="submit"
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
              >
                이 업체로 들어가기
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
