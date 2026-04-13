#!/usr/bin/env node
/**
 * sabok_employees: number / bool 필드의 required(Nonempty)를 끄는 일회성·반복 실행 스크립트.
 *
 * sabok 루트에 복사:
 *   mkdir -p scripts
 *   cp <gl-server>/scripts/sabok/pb-fix-employees-schema.mjs scripts/
 *
 * package.json:
 *   "pb:fix-employees-schema": "node scripts/pb-fix-employees-schema.mjs"
 *
 * 실행:
 *   cd /path/to/sabok
 *   POCKETBASE_URL=http://127.0.0.1:8090 \
 *   POCKETBASE_ADMIN_EMAIL=you@example.com \
 *   POCKETBASE_ADMIN_PASSWORD='secret' \
 *   npm run pb:fix-employees-schema
 *
 * 미리보기만:
 *   DRY_RUN=1 npm run pb:fix-employees-schema
 *
 * 환경변수 별칭: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD (GL MCP와 동일)
 */

import PocketBase from "pocketbase";

const url =
  process.env.POCKETBASE_URL?.trim() ||
  process.env.PB_URL?.trim() ||
  "";
const email =
  process.env.POCKETBASE_ADMIN_EMAIL?.trim() ||
  process.env.PB_ADMIN_EMAIL?.trim() ||
  "";
const password =
  process.env.POCKETBASE_ADMIN_PASSWORD ||
  process.env.PB_ADMIN_PASSWORD ||
  "";

const COLLECTION = (process.env.PB_EMPLOYEES_COLLECTION || "sabok_employees").trim();
const DRY = ["1", "true", "yes"].includes(String(process.env.DRY_RUN || "").toLowerCase());

/** 콤마 구분 시 해당 필드만; 비우면 모든 number/bool */
const ONLY_NAMES = new Set(
  String(process.env.PB_FIX_FIELDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

if (!url || !email || !password) {
  console.error(
    "환경변수가 필요합니다: POCKETBASE_URL(또는 PB_URL), POCKETBASE_ADMIN_EMAIL(또는 PB_ADMIN_EMAIL), POCKETBASE_ADMIN_PASSWORD(또는 PB_ADMIN_PASSWORD)",
  );
  process.exit(1);
}

function clonePlain(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function auth(pb) {
  if (typeof pb.collection === "function") {
    try {
      await pb.collection("_superusers").authWithPassword(email, password);
      return;
    } catch {
      /* fall through */
    }
  }
  if (typeof pb.admins?.authWithPassword === "function") {
    await pb.admins.authWithPassword(email, password);
    return;
  }
  throw new Error("PocketBase SDK에서 _superusers 또는 admins 인증을 사용할 수 없습니다.");
}

const pb = new PocketBase(url);
pb.autoCancellation(false);

await auth(pb);

const col = await pb.collections.getOne(COLLECTION);
const changed = [];

const newFields = col.fields.map((f) => {
  if (f.system) return f;
  if (f.type !== "number" && f.type !== "bool") return f;
  if (!f.required) return f;
  if (ONLY_NAMES.size > 0 && !ONLY_NAMES.has(f.name)) return f;

  changed.push(`${f.name} (${f.type})`);
  const next = clonePlain(f);
  next.required = false;
  return next;
});

if (changed.length === 0) {
  console.log(`[${COLLECTION}] required=true 인 number/bool 필드가 없거나 PB_FIX_FIELDS에 맞는 항목이 없습니다.`);
  process.exit(0);
}

console.log(DRY ? `[DRY_RUN] 다음 필드에서 required 해제 예정:` : `다음 필드에서 required 해제:`, changed.join(", "));

if (DRY) {
  process.exit(0);
}

/** MCP tools와 동일: 전송 시 system 키 제거 */
const payloadFields = newFields.map((f) => {
  const x = clonePlain(f);
  delete x.system;
  return x;
});

await pb.collections.update(col.id, { fields: payloadFields });
console.log(`[${COLLECTION}] 스키마 업데이트 완료.`);
