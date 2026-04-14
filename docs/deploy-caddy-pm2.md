# 배포(Caddy + PM2) — 앱이 기대하는 주입 값

수동 절차 대신 **배포 파이프라인이** 빌드·PM2 기동·Caddy 설정·포트·도메인을 **자동 할당**한다고 가정합니다.  
이 문서는 그 파이프라인이 맞춰 줄 **계약(체크리스트)** 만 정리합니다.

## 역할

- **Caddy**: TLS 종료, `reverse_proxy`로 앱 프로세스로 전달(호스트·경로·도메인은 배포가 결정).
- **PM2**: `run-prod.mjs` 실행, 재시작·로그(프로세스 env는 배포가 주입).

## 반드시 주입할 환경 변수

| 변수 | 용도 |
|------|------|
| `PORT` | `run-prod.mjs` **필수**. Next 리스닝 포트. Caddy `reverse_proxy` 대상과 **동일**해야 함. |
| `SESSION_SECRET` | 16자 이상 |
| `POCKETBASE_URL` | PocketBase 베이스 URL |
| `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` | Admin SDK (서버 전용) |

선택: `COOKIE_SECURE=1`(HTTPS만), `SABOK_*` 등 기존 `.env.example` 참고.

## 배포 파이프라인에서 맞출 것

- **`npm run build`** 후 **`run-prod.mjs`** 기동(또는 동일한 `next start` 조건).
- PM2가 **위 env 전체**를 자식 프로세스에 넘길 것(파일 merge·시크릿 스토어·템플릿 등 방식은 배포 쪽 자유).
- Caddy 설정의 **업스트림 포트 = `PORT`**. 서브패스 프록시 시 Next **`basePath`** 와 경로 일치 필요.

## 참고 파일(휴먼·스캐폴드용)

- `ecosystem.config.cjs` — PM2 앱 정의(포트·비밀은 **저장소에 고정하지 않음**; 배포가 주입).
- `deploy/Caddyfile.example` — 문법 참고용 스니펫(값은 플레이스홀더).
