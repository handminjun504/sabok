# sabok

Next.js 15(App Router) 기반 **사내근로복지기금** 운영 웹앱. 데이터는 **PocketBase** 단일 백엔드이며, 세션은 서명 JWT 쿠키(`sabok_session`)로 관리한다.

## 기술 스택

- **런타임**: Node 20+
- **프레임워크**: Next.js 15, React 19
- **DB / API**: PocketBase(관리자 계정으로 서버 전용 접근)
- **인증**: bcrypt 비밀번호 + `jose` HS256 세션 토큰

## 저장소에서의 위치

- Git 루트: `sabok`(워크스페이스 폴더명)
- 이 Obsidian 볼트: `docs/obsidian/projects` (본 파일 기준 상대: `sabok/architecture.md`)

## 상위 흐름

1. `/login` → `POST /api/auth/login` → PocketBase에서 사용자 조회·비밀번호 검증
2. 성공 시 세션 쿠키 설정 후 `/dashboard` 또는 `/dashboard/select-tenant` 로 이동
3. `middleware`가 `/dashboard/*` 에서 쿠키 JWT 서명만 검증
4. RSC에서 `getSession` / `requireSession` 으로 페이로드 사용
5. 업무 화면은 `activeTenantId` 필수 — [[sabok/modules/tenant-context|테넌트·접근 제어]] 참고

## 문서(모듈)

- [[sabok/modules/auth-session|인증·세션]]
- [[sabok/modules/pocketbase|PocketBase 연동]]
- [[sabok/modules/tenant-context|테넌트·접근 제어]]
- [[sabok/modules/dashboard|대시보드·네비게이션]]

## 배포·환경 변수(요약)

필수: `POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`, `SESSION_SECRET`(16자 이상).  
선택: `COOKIE_SECURE`, `SABOK_SINGLE_TENANT_ID` 등 — 저장소 루트 `.env.example` 참고.

## 관련 저장소 노트

- `docs/obsidian/dashboard-menus.md`, `docs/obsidian/새 노트.md` — 필요 시 여기 볼트로 복사해 `[[wikilink]]` 로 연결
