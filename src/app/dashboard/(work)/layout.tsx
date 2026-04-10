import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-context";

/**
 * 업체(테넌트)가 잡힌 뒤에만 접근 가능한 화면.
 * RSC/프리패치 요청에서 커스텀 헤더가 빠지는 환경을 피하려고 경로 헤더 대신 라우트 그룹으로 구분한다.
 */
export default async function DashboardWorkLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  if (!s.activeTenantId) {
    redirect("/dashboard/select-tenant");
  }
  return <>{children}</>;
}
