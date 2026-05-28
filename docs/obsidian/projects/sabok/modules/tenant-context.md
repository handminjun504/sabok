# 테넌트·접근 제어

## 역할

로그인 직후 **활성 거래처(tenant)** 결정, 업무 라우트에서 테넌트 컨텍스트 강제, 서버 액션/API 호출자의 테넌트 해석.

## 주요 함수/클래스

- `resolveLoginTenantState` — `src/lib/resolve-login-tenant.ts`
- `requireTenantContext`, `resolveCallerTenant` — `src/lib/tenant-context.ts`
- `(work)` 레이아웃 — `src/app/dashboard/(work)/layout.tsx` (`activeTenantId` 없으면 거래처 선택으로 리다이렉트)
- 단일 테넌트 모드 — `src/lib/single-tenant.ts`

## 의존성

- [[sabok/modules/auth-session|인증·세션]] — 세션의 `activeTenantId`
- [[sabok/modules/pocketbase|PocketBase 연동]] — `sabok_tenants`, `sabok_user_tenants` 등

## 관련 파일

- `src/lib/resolve-login-tenant.ts`
- `src/lib/tenant-context.ts`
- `src/lib/single-tenant.ts`
- `src/app/dashboard/select-tenant/page.tsx`

## 상위 문서

- [[sabok/architecture|sabok 개요]]
