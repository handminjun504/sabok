/**
 * 개발 서버: `next dev` 를 셸 없이 기동해 Windows에서 불필요한 CMD/콘솔 창이 뜨는 것을 줄입니다.
 * 포트는 환경변수 `PORT`가 있고 인자에 `-p`/`--port`가 없을 때만 자동으로 넘깁니다. 없으면 Next 기본(3000).
 *
 * 사용: npm run dev | npm run dev:web (-H 0.0.0.0)
 * 추가 인자: npm run dev -- --turbo
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nextBin = path.join(__dirname, "node_modules", "next", "dist", "bin", "next");
const isWin = process.platform === "win32";

function argvHasPort(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-p" || a === "--port") return true;
    if (typeof a === "string" && a.startsWith("--port=")) return true;
  }
  return false;
}

/** npm 스크립트의 `--` 구분자는 next 에 넘기지 않음 */
const passThrough = process.argv.slice(2).filter((a) => a !== "--");
const portEnv = process.env.PORT?.trim();
const extra =
  portEnv && !argvHasPort(passThrough) ? [...passThrough, "-p", portEnv] : passThrough;
const nextArgs = [nextBin, "dev", ...extra];

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
