# Windows 자동 시작 — CMD 창 없이 백그라운드 기동

사복(sabok) 서버가 로그인 시 자동으로 올라오면서 CMD 창이 떠 버리는 문제를 막는 방법.

## 증상

- 로그인 직후 검은 CMD 창이 뜬다.
- 닫으면 Next 서버가 같이 죽는다(= 시작 폴더에 `.cmd`/`.bat` 바로가기가 있는 상태).
- 또는 잠깐 플래시 후 사라지긴 하는데, 화면이 번잡하다.

원인은 대부분 시작 폴더에 `.cmd`/`.bat` 또는 `node run-prod.mjs` 바로가기가 있어서다.
Windows 는 `.cmd`/`.bat`/콘솔 서브시스템 바이너리를 실행하면 기본적으로 CMD 창을 띄운다.
`windowsHide: true` 같은 옵션은 **자식 프로세스**에만 적용되고, 시작 폴더 자체에서 띄워지는
첫 프로세스에는 영향을 주지 않는다.

## 해결 — VBScript 런처로 교체

`scripts/windows/start-sabok-pm2-hidden.vbs` 는 `WScript.Shell.Run(cmd, 0, False)` 로
창을 숨긴 채(`0`) 비동기(`False`) 로 실행한다. 시작 폴더/작업 스케줄러에 이 파일을 등록하면
CMD 창이 뜨지 않는다.

### 1) 기존 시작 폴더 항목 제거

```
Win+R → shell:startup
```

열리는 폴더에서 기존 `.cmd` / `.bat` / "PM2 start" 바로가기 등을 모두 삭제하거나 보관용으로
다른 곳으로 옮긴다.

### 2) VBScript 바로가기 배치

`shell:startup` 폴더에서 **마우스 우클릭 → 새로 만들기 → 바로가기** 로 아래 경로를 지정.

```
wscript.exe "C:\path\to\sabok\scripts\windows\start-sabok-pm2-hidden.vbs"
```

또는 VBS 파일 자체를 우클릭해 "바로 가기 만들기" 한 뒤 그 바로가기를 `shell:startup` 으로
옮겨도 된다. 바로가기 속성에서 **실행(Run)** 은 "최소화" 로 두지 않아도 된다 — VBS 자체가
창을 만들지 않는다.

### 3) 사전 요구

- Node.js, npm 이 사용자 PATH 에 있어야 한다.
- PM2 설치: `npm i -g pm2`. PM2 가 `%APPDATA%\npm\pm2.cmd` 에 존재해야 VBS 가 PM2 경로로
  간다. 없으면 `node run-prod.mjs` 로 직접 기동(재시작 로직 없음)한다.
- PM2 에서 한 번은 수동으로 `pm2 start ecosystem.config.cjs` 후 `pm2 save` 를 해 두는 것을
  권장 (VBS 는 매번 start 를 재시도하는 게 아니라 `--update-env` 로 재반영만 한다).

### 4) 동작 확인

로그인 후 (또는 로그오프→재로그인) 잠시 기다린 뒤 PowerShell 에서:

```powershell
pm2 list          # sabok 프로세스가 online 이어야 한다
pm2 logs sabok    # 기동 로그
netstat -ano | findstr :<PORT>    # 리스닝 포트 확인
```

로그 파일: `logs/pm2-sabok-out.log`, `logs/pm2-sabok-error.log`.

## 왜 Task Scheduler 가 아닌 시작 폴더인가

- **시작 폴더**: 로그인 시점에 사용자 세션 컨텍스트로 실행. PATH 가 가장 자연스럽다. 대신 로그인
  없이 "머신 부팅만" 으로는 안 올라온다.
- **Task Scheduler "At logon"**: 시작 폴더와 거의 동일. VBS 런처를 동일하게 쓰면 된다.
- **Task Scheduler "At startup"**: 로그인 없이도 동작. 다만 SYSTEM 계정으로 동작시키려면
  `%APPDATA%` 경로가 달라져 PM2/Node 설치 위치에 주의해야 한다.
- **Windows 서비스 (NSSM / pm2-windows-service)**: 가장 견고하지만 설치 권한·관리 비용 있음.
  서비스 전환이 필요해지면 별도 논의.

## 참고 — run-prod.mjs 자체 개선

- `runPbSeed` 의 `npm.cmd + shell:true` 폴백 제거: 숨김 부모에서 CMD 가 튀어나오는 원인이었다.
- 자식 프로세스 `spawn/spawnSync` 는 부모가 TTY 가 아닐 때 `stdio: ["ignore", "pipe", "pipe"]`
  로 연결해 새 콘솔 할당을 완전히 차단한다. 출력은 PM2 의 out/error 파일로 그대로 흘러간다.
