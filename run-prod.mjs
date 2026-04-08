/**
 * GL 서버 PM2용: PocketBase 시드 후 next start
 * SABOK_SKIP_DB_SETUP=1 이면 시드 생략
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  if (process.env.SABOK_SKIP_DB_SETUP === "1" || process.env.SABOK_SKIP_DB_SETUP === "true") {
    console.log("[sabok] SABOK_SKIP_DB_SETUP set — skipping pb:seed");
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
  process.exit(dbCode);
}

const child = spawn(process.execPath, [nextBin, "start", "-H", "0.0.0.0", "-p", String(port)], {
  cwd: __dirname,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
