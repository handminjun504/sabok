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

## 보안

메시지 등에 노출된 `Authorization: Bearer` 키는 즉시 폐기·재발급한다. CI/로컬은 환경변수만 사용한다.
