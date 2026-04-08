# GL MCP 운영 연계 (sabok)

애플리케이션의 **테이블·제약·인덱스(비즈니스 단위)** 는 `prisma/schema.prisma`와 `migrate` / `db push`가 단일 진실 공급원입니다. GL MCP 도구는 **인프라/배포 환경** 과 직접 연관된 작업에 쓰입니다.

## 도구 요약 (user-gl-server)

| 도구 | 용도 | 비고 |
|------|------|------|
| `update_env` | 배포 환경 변수 갱신 (`vars`: 키·값 문자열 맵) | `DATABASE_URL`, `SESSION_SECRET` 등 런타임 시크릿은 **GL·시크릿 저장소**에만 두고 채팅/저장소에 평문 커밋 금지 |
| `create_blueprint` | 블루프린트 YAML 생성 (`name`, `yaml`) | Postgres 앱·DB 인스턴스 정의는 GL 콘솔 문서에 맞출 것 |
| `create_db_index` | 컬렉션·필드명 기반 인덱스 | 설명이 **컬렉션** 중심 — Mongo 등과 혼동 가능. **PostgreSQL + Prisma** 이면 우선 `@@index` / 마이그레이션으로 반영하고, MCP 인덱스는 대상 DB 종류를 GL 문서로 검증한 뒤 필요 시만 보완 |

## 권장 플로우

1. **Postgres·앱**: GL에서 블루프린트/앱으로 인스턴스를 준비한다.
2. **연결 문자열**: `update_env`로 `DATABASE_URL`을 주입한 뒤 앱 재시작(플랫폼 안내 준수).
3. **스키마**: 코드 저장소에서 `prisma migrate deploy` 또는 `db push`로 반영 — MCP로 RDB 스키마를 대체하지 않는다.
4. **GL 동기화**: 앱은 `GlSyncJob` payload에 `tenantId`, 고객사 코드·이름을 넣어 업체별 요청을 분리한다.

## Vercel(GL에서 연동 배포할 때)

배포가 실패하거나 배포 후 500이 나올 때 아래를 순서대로 확인한다.

1. **환경 변수(프로젝트·Preview/Production)**  
   - `DATABASE_URL`: 외부에서 접근 가능한 Postgres URL. 서버리스 연결 수 제한이 있으면 **PgBouncer/Neon `pooler` URL** 등 풀러 엔드포인트를 쓴다.  
   - `SESSION_SECRET`: **16자 이상** 난수 문자열. 짧으면 `src/middleware.ts`가 `/dashboard` 접근을 막는다.
2. **Prisma**  
   - 저장소에는 `schema.prisma`의 `binaryTargets`에 `rhel-openssl-3.0.x`가 포함되어 Vercel 리눅스 런타임용 엔진이 생성된다.  
   - `package.json`의 `build`는 `prisma generate && next build`로, install 단계에서 `postinstall`이 건너뛰여도 생성이 보장된다.
3. **DB 스키마**  
   - 배포 직후 DB가 비어 있으면 런타임 오류가 난다. CI/수동으로 `prisma migrate deploy` 또는 `db push`를 한 번 실행한다.
4. **빌드 로그**  
   - GL/Vercel 빌드 로그에서 `Can't reach database`、`Prisma Client could not locate the Query Engine`/`libquery_engine`、ESLint/Type 오류 문구를 확인한다.

## GL 서버 · Windows PM2 (Vercel 없이 MCP만)

1. **코드 동기화**: MCP `git_clone` / `PowerShell`에서 `git_pull`로 예: `C:\Services\apps\sabok-web` 에 최신 `main` 반영.
2. **설치**: 서버에서 `npm install --include=dev` 권장. `NODE_ENV=production`만 두고 설치하면 `@tailwindcss/postcss` 등 devDependency 가 빠져 **`next build`가 실패**할 수 있음.
3. **빌드**: `npm run build`를 **끝까지** 실행. 중간에 끊기면 `.next\prerender-manifest.json`이 **0바이트**로 남고, `next start` 시 `SyntaxError: Unexpected end of JSON input` 로 즉시 종료됨.
4. **PM2 등록**: GL이 `npm.cmd`에 `interpreter: node`를 붙이면 배치가 깨짐. 저장소 루트 `run-prod.mjs` 를 스크립트로 두고 MCP `create_app` 시 `command` = 해당 파일 **절대 경로**, `interpreter` = `node`, `cwd` = 앱 루트, `env`에 `PORT`(예: 10001), `NODE_ENV=production`.
5. **재배포**: `git_pull` → `npm install --include=dev`(필요 시) → `npm run build` → MCP `restart_app` (`name`: sabok).

`exec_command`의 `cwd` 옵션이 무시되는 경우가 있으므로, 명령 앞에 `Set-Location '...': npm ...` 형태로 경로를 박는 것이 안전함.

## 보안

메시지 등에 노출된 `Authorization: Bearer` 키는 즉시 폐기·재발급한다. CI/로컬은 환경변수만 사용한다.
