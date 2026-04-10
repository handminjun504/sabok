/**
 * 내부 전용 단일 업체 모드.
 * `SABOK_SINGLE_TENANT_ID` 에 PocketBase `sabok_tenants` 레코드 id 를 넣으면
 * 업체 선택·업체 관리 메뉴가 숨겨지고, 로그인 시 항상 그 업체로 세션이 잡힙니다.
 */
export function singleTenantIdFromEnv(): string | null {
  const v = process.env.SABOK_SINGLE_TENANT_ID?.trim();
  return v && v.length > 0 ? v : null;
}

export function isSingleTenantMode(): boolean {
  return singleTenantIdFromEnv() != null;
}
