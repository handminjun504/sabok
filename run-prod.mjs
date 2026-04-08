/**
 * GL 서버 PM2용: interpreter=node 일 때 next start 를 안정적으로 실행
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nextBin = path.join(__dirname, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT || "10001";

const child = spawn(process.execPath, [nextBin, "start", "-H", "0.0.0.0", "-p", String(port)], {
  cwd: __dirname,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
