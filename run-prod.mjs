/**
 * GL 서버 PM2용: next start (기본은 기동 시 pb:seed 안 함)
 * 매 기동 시 시드: .env 에 SABOK_RUN_SEED_ON_START=1
 * 시드 실패: SABOK_STRICT_SEED=1 이면 프로세스 종료, 아니면 Next 계속 기동
 * 레거시: SABOK_SKIP_DB_SETUP=1 → 시드 생략(SABOK_RUN_SEED_ON_START 없을 때와 동일)
 * PM2는 .env를 자동 주입하지 않으므로, 여기서 .env / .env.local 을 읽는다.
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
const port = process.env.PORT || "10001";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

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
  const r = spawnSync(npmCmd, ["run", "pb:seed"], {
    cwd: __dirname,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
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

const child = spawn(process.execPath, [nextBin, "start", "-H", "0.0.0.0", "-p", String(port)], {
  cwd: __dirname,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

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
