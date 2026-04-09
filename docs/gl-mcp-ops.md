# GL MCP 운영 연계 (sabok)

애플리케이션 데이터는 **PocketBase** 컬렉션(`sabok_*` 접두사)에 저장된다. 스키마 체크리스트는 [pb-collections.md](./pb-collections.md)를 따른다. GL MCP 도구는 **인프라/배포 환경** 과 직접 연관된 작업에 쓰인다.

## 아키텍처

- 브라우저는 PocketBase에 직접 붙지 않는다. **Next.js 서버**가 Admin API(`POCKETBASE_ADMIN_*`)로만 PB에 읽기/쓰기한다.
- 멀티테넌트·세션·bcrypt 로그인은 기존과 동일하며, 사용자 레코드는 `sabok_users`(일반 컬렉션, PB Auth 아님)에 둔다.

## 도구 요약 (user-gl-server)

| 도구 | 용도 | 비고 |
|------|------|------|
| `update_env` | 배포 환경 변수 갱신 (`vars`: 키·값 문자열 맵) | `POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`, `SESSION_SECRET` 등은 **GL·시크릿 저장소**에만 두고 채팅/저장소에 평문 커밋 금지 |
| `create_blueprint` | 블루프린트 YAML 생성 | GL에서 PocketBase 인스턴스·역프록시를 띄울 때 플랫폼 문서에 맞출 것 |
| `import_schema` | [pb-collections.md](./pb-collections.md)에 맞춘 컬렉션 **일괄 생성** | `projectId`와 `schema` 배열 전달 시 프로젝트에 자동 연결 |
| `update_collection` | 필드·규칙·**인덱스(SQL 문자열)** 수정 | 유니크는 `indexes: ["CREATE UNIQUE INDEX … ON 컬렉션명 (필드들)"]` 형태. **채팅 MCP에서 끝내기에 적합** |
| `create_db_index` | 복합 인덱스 생성 | 일부 환경에서는 대시보드에서 프로젝트를 먼저 선택해야 해서 MCP만으로는 실패할 수 있음 → 대신 `update_collection`의 `indexes` 사용 |

## MCP만으로 sabok 스키마 만들기 (요약)

1. `list_projects`로 프로젝트 ID를 확인한다 (예: 사복).
2. `import_schema`에 `projectId`와 컬렉션 정의 배열을 넣어 `sabok_*` 전체를 만든다. 필드·필수 여부는 [pb-collections.md](./pb-collections.md)와 동일하게 맞춘다.
3. 문서에 적힌 **Unique 조합**마다 `update_collection`으로 `nameOrId`만 지정하고 `indexes`에 SQLite용 `CREATE UNIQUE INDEX … ON sabok_테이블명 (col1, col2)` 한 줄씩 넣는다. (`sabok_audit_logs`, `sabok_gl_sync_jobs`, `sabok_vendor_contributions` 등 유니크 없는 테이블은 생략)

## 권장 플로우

1. **PocketBase**: GL에서 PB 프로세스를 기동하고 공개 URL(내부망이면 그 주소)을 확정한다.
2. **컬렉션·유니크**: Admin UI로 수동 생성하거나, 위 **MCP만으로 sabok 스키마** 절차를 따른다([pb-collections.md](./pb-collections.md)와 동일 규칙).
3. **환경 변수**: `update_env`로 `POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`, `SESSION_SECRET`(16자 이상) 주입 후 앱 재시작.
4. **시드**: 배포 후 `npm run pb:seed`(권장). PM2 기동 시마다 시드하려면 `.env`에 `SABOK_RUN_SEED_ON_START=1`(기본은 기동 시 시드 안 함).
5. **GL 동기화**: 앱은 `GlSyncJob` payload에 `tenantId`, 고객사 코드·이름을 넣어 업체별 요청을 분리한다.

## Vercel 등 서버리스 배포 시

빌드는 `next build`만 수행한다(PocketBase 클라이언트는 런타임에 PB로 HTTP).

1. **환경 변수**: `POCKETBASE_URL`(외부에서 Next 실행 환경이 접근 가능해야 함), Admin 이메일/비밀번호, `SESSION_SECRET`(16자 이상).
2. **PB 방화벽**: IP 화이트리스트나 사설망만 허용이면 서버리스에서 연결이 막힐 수 있다.
3. **시드**: 배포 파이프라인 또는 수동으로 `npm run pb:seed`를 한 번 이상 실행해 데모 테넌트·계정을 넣는다.

## GL 서버 · Windows PM2

**경로 분리(필수)**: sabok은 **`https://github.com/handminjun504/sabok`** 전용 클론 디렉터리에만 둔다. **GL 대시보드·gl-server(`handminjun504/gl-server`)와 같은 폴더를 쓰거나, GL이 쓰는 경로에 MCP/스크립트로 `git remote`·`reset`을 걸지 않는다.** 한 디렉터리에 두 제품을 섞으면 대시보드(예: 4000)와 사복(예: 10001)이 함께 망가질 수 있다.

1. **코드 동기화**: **사복 전용 루트**에서만 `git pull`(또는 수동 배포). 원격이 `handminjun504/sabok` 인지 `git remote -v`로 확인한 뒤 진행한다. MCP `git_pull`/`exec_command`는 **그 경로가 sabok 전용임이 확실할 때만** 사용한다.
2. **설치**: `npm install --include=dev` 권장(`next build`용 devDependency).
3. **빌드**: `npm run build`를 끝까지 실행.
4. **PM2**: `run-prod.mjs`를 `command`(절대 경로), `interpreter`=`node`, `cwd`=**그 사복 전용 루트**, `env`에 `PORT`, `NODE_ENV=production`, **`POCKETBASE_*`**, **`SESSION_SECRET`**.
5. **시드**: `run-prod.mjs`는 기본적으로 시드 생략. 기동 시 시드 필요 시 `SABOK_RUN_SEED_ON_START=1`. 레거시: `SABOK_SKIP_DB_SETUP=1`도 생략.
6. **재배포**: Windows에서는 저장소 루트에서 `.\scripts\deploy-sabok.ps1` 실행(원격이 `handminjun504/sabok` 인지 검사) 후 PM2에서 해당 앱만 재시작. 수동이면 `git pull` → `npm install --include=dev` → `npm run build` → 재시작.

`exec_command`의 `cwd`가 무시되면 `npm --prefix "C:\...\sabok-전용경로" run build` 또는 `Set-Location '...'; npm ...` 형태로 경로를 고정한다.

## 보안

Admin 비밀번호·`SESSION_SECRET`은 저장소에 넣지 않는다. 메시지에 노출된 `Authorization: Bearer` 키는 즉시 폐기·재발급한다.
