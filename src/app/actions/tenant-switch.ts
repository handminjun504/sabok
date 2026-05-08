"use server";

import { redirect } from "next/navigation";
import { Role, parseRole } from "@/lib/role";
import {
  companySettingsByTenant,
  tenantFindFirstActive,
  userTenantFind,
} from "@/lib/pb/repository";
import { getAdminPb } from "@/lib/pb/admin-client";
import { getSession, createSessionToken, setSessionCookie } from "@/lib/session";
import { isSingleTenantMode } from "@/lib/single-tenant";
import { canEditCompanySettings } from "@/lib/permissions";

const TENANTS_COLLECTION_SETTINGS = "sabok_company_settings";

/**
 * 폼에서 들어온 `year` 가 거래처 활성 연도로 유효하면 정수로 반환, 아니면 null.
 *
 * 입력이 비어 있어도 정상(요청자가 연도 변경을 원하지 않는 경우) — null 을 그대로 흘려 보낸다.
 */
function pickRequestedYear(formData: FormData): number | null {
  const raw = String(formData.get("year") ?? "").trim();
  if (raw === "") return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

/**
 * 거래처 전환 — 선택적으로 활성 연도(`year`) 를 함께 갱신한다.
 *
 * 동작
 *   1) 거래처 활성 여부 확인 → 비활성/없으면 거래처 선택 화면으로 되돌린다.
 *   2) 사용자의 거래처별 role 결정(플랫폼 관리자 → ADMIN, accessAll → 세션 role, 그 외 → user_tenants).
 *   3) 폼에 `year` 가 들어 있고 권한(`canEditCompanySettings`) 이 있으면, 거래처 전사 설정의 `activeYear` 를 갱신.
 *      - 전사 설정 레코드가 없으면(=초기 거래처) 갱신을 건너뛰고 그대로 진입한다(설정 페이지에서 첫 저장 후 효력).
 *      - 권한 없거나 동일한 값이면 갱신 없이 진입.
 *   4) 세션 토큰 재발급 후 `/dashboard` 로 redirect.
 *
 * 데이터 보존: 활성 연도 갱신은 `activeYear` 단일 컬럼만 바꾸므로 이전 연도의 레벨 규칙·목표액·분기 요율·분기 대상자
 * 설정·월별 메모(notes) 등 연도 키 데이터는 그대로 남는다. 다시 이전 연도로 전환하면 그대로 복구된다.
 */
export async function switchTenantFormAction(formData: FormData) {
  if (isSingleTenantMode()) redirect("/dashboard");

  const tenantId = String(formData.get("tenantId") ?? "");
  const session = await getSession();
  if (!session) redirect("/login");

  const tenant = await tenantFindFirstActive(tenantId);
  if (!tenant) redirect("/dashboard/select-tenant");

  let role: Role;
  if (session.isPlatformAdmin) {
    role = Role.ADMIN;
  } else if (session.accessAllTenants) {
    role = session.role;
  } else {
    const ut = await userTenantFind(session.sub, tenantId);
    if (!ut) redirect("/dashboard/select-tenant");
    role = parseRole(ut.role);
  }

  const requestedYear = pickRequestedYear(formData);
  if (requestedYear != null && canEditCompanySettings(role)) {
    try {
      const settings = await companySettingsByTenant(tenantId);
      if (settings?.id && settings.activeYear !== requestedYear) {
        const pb = await getAdminPb();
        await pb.collection(TENANTS_COLLECTION_SETTINGS).update(settings.id, {
          activeYear: requestedYear,
        });
      }
    } catch (e) {
      /**
       * 연도 갱신 실패는 진입 자체를 막지 않는다 — 거래처 진입은 계속하고 콘솔에만 경고.
       * (네트워크 일시 오류로 진입까지 막는 건 사용자 경험 측면에서 손해)
       */
      console.error("[switchTenantFormAction] activeYear 갱신 실패", e);
    }
  }

  const maxAge = 60 * 60 * 24 * 7;
  const { token } = await createSessionToken(
    {
      sub: session.sub,
      email: session.email,
      name: session.name,
      role,
      isPlatformAdmin: session.isPlatformAdmin,
      accessAllTenants: session.accessAllTenants,
      activeTenantId: tenantId,
    },
    maxAge
  );
  await setSessionCookie(token, maxAge);
  redirect("/dashboard");
}
