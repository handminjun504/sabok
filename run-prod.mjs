/**
 * GL 서버 PM2용: next start (기본은 기동 시 pb:seed 안 함)
 * 매 기동 시 시드: .env 에 SABOK_RUN_SEED_ON_START=1
 * 시드 실패: SABOK_STRICT_SEED=1 이면 프로세스 종료, 아니면 Next 계속 기동
 * 레거시: SABOK_SKIP_DB_SETUP=1 → 시드 생략(SABOK_RUN_SEED_ON_START 없을 때와 동일)
 * PM2는 .env를 자동 주입하지 않으므로, 여기서 .env / .env.local 을 읽는다.
 *
 * git pull 직후에는 반드시 `npm run build` 후 재시작하세요. pull만 하고 빌드 없이 재시작하면
 * 브라우저에 "Server Components render" / digest 오류만 보일 수 있습니다.
 * 기동 시 자동 빌드: .env 에 SABOK_BUILD_BEFORE_START=1
 *
 * Windows: npm.cmd + shell 기동은 보조 CMD 창이 뜰 수 있어, 시드·빌드는 `node`로 직접 호출하고
 * Next 자식은 stdio 파이프로 붙여 불필요한 콘솔 창 생성을 줄입니다. 바탕화면 숨김 실행은
 * `scripts/windows/start-sabok-hidden.vbs` 참고.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** .env 로드(이미 설정된 process.env 는 덮어쓰지 않음). */
function loadEnvFile(rel) {
  const filePath = path.join(__dirname, rel);
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!key || key.startsWith("#")) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const nextBin = path.join(__dirname, "node_modules", "next", "dist", "bin", "next");
/** 기본 포트. PM2/`.env`의 `PORT`가 있으면 그 값이 우선합니다. */
const port = process.env.PORT || "10002";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const tsxCli = path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs");
const seedScript = path.join(__dirname, "scripts", "pb-seed.ts");

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 16) {
  console.error(
    "[sabok] SESSION_SECRET must be set to a string of at least 16 characters (see docs / .env.example)"
  );
  process.exit(1);
}

function runPbSeed() {
  const skip =
    process.env.SABOK_SKIP_DB_SETUP === "1" ||
    process.env.SABOK_SKIP_DB_SETUP === "true";
  const run =
    process.env.SABOK_RUN_SEED_ON_START === "1" ||
    process.env.SABOK_RUN_SEED_ON_START === "true";
  if (skip || !run) {
    if (skip) {
      console.log("[sabok] SABOK_SKIP_DB_SETUP — skipping pb:seed");
    } else {
      console.log(
        "[sabok] pb:seed skipped on boot (set SABOK_RUN_SEED_ON_START=1 to run). Manual: npm run pb:seed",
      );
    }
    return 0;
  }
  console.log("[sabok] PocketBase seed …");
  const seedEnv = { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" };
  const r = fs.existsSync(tsxCli)
    ? spawnSync(process.execPath, [tsxCli, seedScript], {
        cwd: __dirname,
        stdio: "inherit",
        windowsHide: true,
        env: seedEnv,
      })
    : spawnSync(npmCmd, ["run", "pb:seed"], {
        cwd: __dirname,
        stdio: "inherit",
        shell: true,
        windowsHide: true,
        env: seedEnv,
      });
  const code = r.status ?? 1;
  if (code !== 0) {
    console.error(
      "[sabok] pb:seed failed — check POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD, and collections (docs/pb-collections.md)"
    );
  }
  return code;
}

const dbCode = runPbSeed();
if (dbCode !== 0) {
  if (process.env.SABOK_STRICT_SEED === "1" || process.env.SABOK_STRICT_SEED === "true") {
    process.exit(dbCode);
  }
  console.error(
    "[sabok] pb:seed failed — Next는 그대로 기동합니다. PB·스키마 수정 후 수동: npm run pb:seed (시드 실패 시 전체 중단하려면 SABOK_STRICT_SEED=1)"
  );
}

const buildIdPath = path.join(__dirname, ".next", "BUILD_ID");

if (
  process.env.SABOK_BUILD_BEFORE_START === "1" ||
  process.env.SABOK_BUILD_BEFORE_START === "true"
) {
  console.log("[sabok] SABOK_BUILD_BEFORE_START — next build …");
  const br = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: __dirname,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production" },
  });
  if ((br.status ?? 1) !== 0) {
    console.error("[sabok] npm run build failed — exit");
    process.exit(br.status ?? 1);
  }
}

if (!fs.existsSync(buildIdPath)) {
  console.error(
    "[sabok] .next 빌드가 없습니다. 프로젝트 루트에서 실행 후 다시 기동하세요:\n" +
      "  npm run build\n" +
      "또는 .env 에 SABOK_BUILD_BEFORE_START=1 을 넣으면 기동 시 자동 빌드합니다."
  );
  process.exit(1);
}

function warnIfBuildOlderThanGitTip() {
  const mainRef = path.join(__dirname, ".git", "refs", "heads", "main");
  if (!fs.existsSync(mainRef) || !fs.existsSync(buildIdPath)) return;
  try {
    const refM = fs.statSync(mainRef).mtimeMs;
    const bM = fs.statSync(buildIdPath).mtimeMs;
    if (refM > bM) {
      console.warn(
        "[sabok] 경고: Git main 이 .next 빌드보다 최근입니다. `npm run build` 없이 재시작하면 RSC digest 오류가 날 수 있습니다."
      );
    }
  } catch {
    /* ignore */
  }
}
warnIfBuildOlderThanGitTip();

const isWin = process.platform === "win32";
const nextStartArgs = [nextBin, "start", "-H", "0.0.0.0", "-p", String(port)];
const child = spawn(process.execPath, nextStartArgs, {
  cwd: __dirname,
  /** Windows에서 inherit 시 부모에 콘솔이 없을 때 자식이 새 CMD를 띄우는 경우가 있어 파이프로 연결 */
  stdio: isWin ? ["ignore", "pipe", "pipe"] : "inherit",
  windowsHide: true,
  env: { ...process.env, NODE_ENV: "production" },
});
if (isWin) {
  child.stdout?.on("data", (chunk) => {
    try {
      process.stdout.write(chunk);
    } catch {
      /* hidden / no console */
    }
  });
  child.stderr?.on("data", (chunk) => {
    try {
      process.stderr.write(chunk);
    } catch {
      /* hidden / no console */
    }
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    console.error("[sabok] next process killed by signal:", signal);
    process.kill(process.pid, signal);
    return;
  }
  if (code !== 0 && code != null) {
    console.error("[sabok] next process exited with code:", code, "(check port", port, "EADDRINUSE / logs above)");
  }
  process.exit(code ?? 0);
});
