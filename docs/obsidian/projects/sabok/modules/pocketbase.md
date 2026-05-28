# PocketBase 연동

## 역할

모든 업무 데이터의 단일 저장소. Next 서버는 **관리자 인증**된 PocketBase 클라이언트로 컬렉션에 접근한다.

## 주요 함수/클래스

- `getAdminPb()` — `src/lib/pb/admin-client.ts`
- 컬렉션 상수·매핑·쿼리 — `src/lib/pb/repository.ts`, `src/lib/pb/collections.ts`, `src/lib/pb/mappers.ts`

## 의존성

- `pocketbase` npm 패키지
- 환경 변수: `POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`

## 관련 파일

- `src/lib/pb/admin-client.ts`
- `src/lib/pb/repository.ts`
- `docs/pb-collections.md`(저장소)

## 상위 문서

- [[sabok/architecture|sabok 개요]]
