/**
 * PM2 단일 인스턴스 (fork). 사복 저장소 루트에서만 사용.
 *   pm2 start ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs --update-env
 * GL 대시보드 `start` API가 불안정할 때 서버 RDP에서 위 명령으로 기동·재시작.
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
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "5s",
      kill_timeout: 8_000,
      env: {
        NODE_ENV: "production",
        PORT: "10002",
      },
    },
  ],
};
