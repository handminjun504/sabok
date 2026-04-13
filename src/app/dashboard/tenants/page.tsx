import { redirect } from "next/navigation";
import { isSingleTenantMode } from "@/lib/single-tenant";

/** 예전 URL·북마크 호환: 거래처 관리는 `/dashboard/select-tenant` 에서 합니다. */
export default function TenantsAdminPageRedirect() {
  if (isSingleTenantMode()) redirect("/dashboard");
  redirect("/dashboard/select-tenant");
}
