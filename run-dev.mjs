/**
 * 개발 서버: `next dev` 를 셸 없이 기동해 Windows에서 불필요한 CMD/콘솔 창이 뜨는 것을 줄입니다.
 * macOS/Linux 는 기존과 같이 터미널에 로그가 출력됩니다.
 *
 * 사용: npm run dev  |  npm run dev:web
 * 추가 인자: npm run dev -- --turbo
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nextBin = path.join(__dirname, "node_modules", "next", "dist", "bin", "next");
const isWin = process.platform === "win32";

/** npm 스크립트의 `--` 구분자는 next 에 넘기지 않음 */
const passThrough = process.argv.slice(2).filter((a) => a !== "--");
const nextArgs = [nextBin, "dev", ...passThrough];

const child = spawn(process.execPath, nextArgs, {
  cwd: __dirname,
  stdio: isWin ? ["ignore", "pipe", "pipe"] : "inherit",
  windowsHide: true,
  env: { ...process.env },
});

if (isWin) {
  child.stdout?.on("data", (chunk) => {
    try {
      process.stdout.write(chunk);
    } catch {
      /* no console */
    }
  });
  child.stderr?.on("data", (chunk) => {
    try {
      process.stderr.write(chunk);
    } catch {
      /* no console */
    }
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
