/**
 * PM2 단일 인스턴스 (fork). 사복 저장소 루트에서만 사용.
 *   pm2 start ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs --update-env
 *
 * PORT·시크릿·PB 접속 정보는 저장소에 고정하지 않고 배포 파이프라인이 주입한다.
 * 계약·PM2/Caddy 꼬임 시 복구 순서: docs/deploy-caddy-pm2.md
 */
const path = require("path");

module.exports = {
  apps: [
    {
      name: "sabok",
      script: "run-prod.mjs",
      interpreter: "node",
      cwd: __dirname,
      /** Windows에서 불필요한 콘솔(CMD) 창 생성 억제 */
      windowsHide: true,
      /** 콘솔 대신 파일로 남김(Windows 서비스/RDP에서 CMD 플래시 완화) */
      merge_logs: true,
      out_file: path.join(__dirname, "logs", "pm2-sabok-out.log"),
      error_file: path.join(__dirname, "logs", "pm2-sabok-error.log"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "5s",
      kill_timeout: 8_000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
