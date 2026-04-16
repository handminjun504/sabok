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

---

## PM2·Caddy가 “제각각”일 때 (정리 순서)

아래는 **앱 코드 문제가 아니라** 역프록시·프로세스 관리가 어긋날 때의 전형적인 패턴입니다.

### 1) 포트 한 줄로 맞추기

- `run-prod.mjs`는 **`PORT` 없으면 즉시 종료**합니다. 값은 **앱이 리슨하는 포트**입니다.
- Caddy의 `reverse_proxy` 대상(예: `127.0.0.1:10002`)이 **그 숫자와 반드시 동일**해야 합니다.
- Caddy에서 `{$PORT}` 같은 env 치환을 쓰면, **Caddy 실행 환경**에도 같은 `PORT`가 있어야 합니다. 없으면 **Caddyfile에 숫자를 박아 두고**, 바꿀 때마다 앱 `.env`의 `PORT`와 같이 수정하는 편이 덜 헷갈립니다.

### 2) PM2에 sabok가 여러 개/유령 프로세스

- `pm2 list`에 `sabok`가 두 개 이상이면 포트 충돌·재시작 난사가 납니다.
- 정리: `pm2 delete sabok` (또는 id로 삭제) 후, **저장소 루트에서** `pm2 start ecosystem.config.cjs` **한 번만**.
- `run-prod.mjs`를 콘솔에서 따로 또 띄우지 않습니다. **항상 PM2 → `run-prod.mjs` → `next start` 한 줄**이면 됩니다.

### 3) `.env`를 고쳤는데 반영이 안 될 때

- PM2는 기본적으로 **기동 시점 env**를 붙잡습니다. `.env`만 바꾸고 재시작만 하면 옛값이 남을 수 있습니다.
- 권장: `pm2 reload ecosystem.config.cjs --update-env`  
  또는 `pm2 delete sabok` 후 다시 `pm2 start ecosystem.config.cjs`.
- `run-prod.mjs`가 시작 시 `.env` / `.env.local`을 읽지만, **이미 부모(PM2)에 박힌 `PORT`가 우선**되는 경우가 있으므로, PM2 `env` 블록이나 호스트의 시스템 env에 **옛 `PORT`가 남아 있지 않은지**도 확인합니다.

### 4) `pm2 list`가 비었다가 안 비었다가 할 때

- **로그인한 Windows 사용자**용 PM2와 **서비스/배치 계정**용 PM2는 **다른 데몬**입니다. RDP로 들어가서 본 목록과 실제 서비스가 쓰는 목록이 다를 수 있습니다.
- “어디서 돌고 있는지”는 **그 계정으로** `pm2 list` / 로그 경로(`logs/pm2-sabok-*.log`)를 봐야 합니다. (자세한 운영 계정은 내부 GL 문서 기준.)

### 5) Caddy만 바꿨을 때

- 설정 저장 후 **`caddy validate --config …`** 로 문법 확인, 그다음 **`caddy reload`**(또는 OS 서비스 재시작).
- TLS·업스트림을 바꾼 뒤에도 **업스트림 포트**가 위 `PORT`와 일치하는지 다시 확인합니다.

### 6) 서버 안에서 앱이 살아 있는지 (Caddy 제외)

- 같은 머신에서: `curl -sI "http://127.0.0.1:${PORT}/login"` (실제 `PORT`로 치환)  
  → `200` / `307` 등 응답이 오면 Next는 정상이고, 그때는 **Caddy·방화벽·도메인 DNS** 쪽을 의심합니다.
- 여기서도 안 되면 `logs/pm2-sabok-error.log`와 `run-prod`가 찍는 `[sabok]` 메시지(특히 `PORT` 없음, `.next` 없음, 시드 실패)를 먼저 봅니다.

### 7) 배포 직후 “화면이 이상하다”

- `git pull`만 하고 **`npm run build` 없이** PM2만 재시작하면 RSC digest 오류가 날 수 있습니다. 문서화된 대로 **빌드 후 재시작**하거나 `.env`에 `SABOK_BUILD_BEFORE_START=1`(자동 빌드)을 검토합니다.
