# 인증·세션

## 역할

로그인 처리, 세션 JWT 발급·검증, 쿠키 저장. `/dashboard` 경로는 미들웨어에서 토큰 존재 및 서명만 확인한다.

## 주요 함수/클래스

- `createSessionToken` / `verifySessionToken` / `getSession` — `src/lib/session.ts`
- `requireSession` — `src/lib/auth-context.ts`
- `POST /api/auth/login` — `src/app/api/auth/login/route.ts`
- 미들웨어 JWT 검증 — `src/middleware.ts`

## 의존성

- [[sabok/modules/pocketbase|PocketBase 연동]] — 사용자 조회
- `jose` (SignJWT, jwtVerify)
- 환경 변수: `SESSION_SECRET`, `COOKIE_SECURE`

## 관련 파일

- `src/lib/session.ts`
- `src/lib/auth-context.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/login/page.tsx`
- `src/middleware.ts`

## 상위 문서

- [[sabok/architecture|sabok 개요]]
