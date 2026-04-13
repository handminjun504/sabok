#!/usr/bin/env node
/**
 * sabok_employees: number / bool 필드의 required(Nonempty)를 끄는 일회성·반복 실행 스크립트.
 *
 * 미리보기 / verbose (macOS·Linux·Windows 공통, cross-env):
 *   npm run pb:fix-employees-schema:dry
 *   npm run pb:fix-employees-schema:verbose
 *
 * Windows 환경변수 (Unix 스타일 PB_VERBOSE=1 은 CMD/PS에서 동작하지 않음):
 *   CMD:        set PB_VERBOSE=1 && npm run pb:fix-employees-schema
 *   PowerShell: $env:PB_VERBOSE='1'; npm run pb:fix-employees-schema
 *
 * verbose 별칭: PB_FIX_VERBOSE (PB_VERBOSE 와 동일)
 *
 * 환경변수 별칭: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD (GL MCP와 동일)
 */

import PocketBase from "pocketbase";

function envTruthy(name) {
  return ["1", "true", "yes"].includes(String(process.env[name] ?? "").toLowerCase());
}

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
const DRY = envTruthy("DRY_RUN");
const VERBOSE = envTruthy("PB_VERBOSE") || envTruthy("PB_FIX_VERBOSE");

/** 콤마 구분 시 해당 필드만; 비우면 모든 number/bool */
const ONLY_NAMES = new Set(
  String(process.env.PB_FIX_FIELDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

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

function printNumberBoolFields(col) {
  const rows = col.fields.filter(
    (f) => !f.system && (f.type === "number" || f.type === "bool"),
  );
  console.log(`→ 현재 number/bool 필드 (${rows.length}개):`);
  for (const f of rows) {
    const req = f.required === true ? "required=true" : "required=false";
    console.log(`    - ${f.name} (${f.type})  ${req}`);
  }
}

async function main() {
  if (!url || !email || !password) {
    console.error(
      "환경변수가 필요합니다: POCKETBASE_URL(또는 PB_URL), POCKETBASE_ADMIN_EMAIL(또는 PB_ADMIN_EMAIL), POCKETBASE_ADMIN_PASSWORD(또는 PB_ADMIN_PASSWORD)",
    );
    process.exitCode = 1;
    return;
  }

  const pb = new PocketBase(url);
  pb.autoCancellation(false);

  await auth(pb);

  const col = await pb.collections.getOne(COLLECTION);

  if (VERBOSE) {
    console.log(`[${COLLECTION}] PB URL: ${url}`);
  }

  const changed = [];

  const newFields = col.fields.map((f) => {
    if (f.system) return f;
    if (f.type !== "number" && f.type !== "bool") return f;
    if (f.required !== true) return f;
    if (ONLY_NAMES.size > 0 && !ONLY_NAMES.has(f.name)) return f;

    changed.push(`${f.name} (${f.type})`);
    const next = clonePlain(f);
    next.required = false;
    return next;
  });

  if (changed.length === 0) {
    const nb = col.fields.filter(
      (f) => !f.system && (f.type === "number" || f.type === "bool"),
    );
    if (ONLY_NAMES.size > 0) {
      console.log(
        `[${COLLECTION}] 수정할 항목 없음: PB_FIX_FIELDS에 적은 이름이 없거나, 이미 required=false 입니다.`,
      );
      console.log(
        `  → 필드 id 예: adjustedSalary. 여러 개: PB_FIX_FIELDS=adjustedSalary,flagAutoAmount`,
      );
    } else {
      console.log(
        `[${COLLECTION}] 수정할 항목 없음: number/bool 이면서 required=true 인 필드가 없습니다.`,
      );
      console.log(
        `→ 이미 모두 required=false 이면, 저장 400·Cannot be blank 은 API 규칙·훅·null 불가 number·앱과 다른 PB URL 등 다른 원인일 수 있습니다.`,
      );
    }
    if (VERBOSE) {
      printNumberBoolFields(col);
    } else {
      console.log(
        `→ number/bool 필드 ${nb.length}개 — 필드별 표시: npm run pb:fix-employees-schema:verbose`,
      );
    }
    return;
  }

  console.log(
    DRY ? `[DRY_RUN] 다음 필드에서 required 해제 예정:` : `다음 필드에서 required 해제:`,
    changed.join(", "),
  );

  if (DRY) {
    return;
  }

  const payloadFields = newFields.map((f) => {
    const x = clonePlain(f);
    delete x.system;
    return x;
  });

  await pb.collections.update(col.id, { fields: payloadFields });
  console.log(`[${COLLECTION}] 스키마 업데이트 완료.`);
}

main().catch((e) => {
  console.error("[pb:fix-employees-schema]", e);
  process.exitCode = 1;
});
