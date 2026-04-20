#!/usr/bin/env node
/**
 * `sabok_quarterly_employee_configs` 컬렉션에 json 필드 `paymentMonths` 가 없으면 추가하고,
 * 기존 단일 `paymentMonth` 만 들어 있는 레코드를 `paymentMonths = [paymentMonth]` 로 마이그레이션한다.
 *
 * 실행:
 *   npm run pb:fix-quarterly-payment-months           # 실제 적용
 *   npm run pb:fix-quarterly-payment-months:dry       # 변경 대상만 출력 (DRY_RUN=1)
 *
 * 환경변수:
 *   POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD
 *   (별칭: PB_URL / PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD — GL MCP 와 동일)
 */
import "dotenv/config";
import PocketBase from "pocketbase";

function envTruthy(name) {
  return ["1", "true", "yes"].includes(String(process.env[name] ?? "").toLowerCase());
}

const url =
  process.env.POCKETBASE_URL?.trim() || process.env.PB_URL?.trim() || "";
const email =
  process.env.POCKETBASE_ADMIN_EMAIL?.trim() ||
  process.env.PB_ADMIN_EMAIL?.trim() ||
  "";
const password =
  process.env.POCKETBASE_ADMIN_PASSWORD || process.env.PB_ADMIN_PASSWORD || "";

const COLLECTION = "sabok_quarterly_employee_configs";
const FIELD = "paymentMonths";
const DRY = envTruthy("DRY_RUN");

async function auth(pb) {
  if (typeof pb.collection === "function") {
    try {
      await pb.collection("_superusers").authWithPassword(email, password);
      return;
    } catch {
      /* fall through to legacy admins API */
    }
  }
  if (typeof pb.admins?.authWithPassword === "function") {
    await pb.admins.authWithPassword(email, password);
    return;
  }
  throw new Error("PocketBase SDK에서 _superusers 또는 admins 인증을 사용할 수 없습니다.");
}

function clonePlain(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function ensurePaymentMonthsField(pb) {
  const col = await pb.collections.getOne(COLLECTION);
  /** PB 0.23+ 는 fields, 0.22 이하는 schema. 둘 다 호환. */
  const fields = (col.fields ?? col.schema ?? []).slice();
  const has = fields.some((f) => f.name === FIELD);
  if (has) {
    console.log(`✔ 컬럼 '${FIELD}' 이미 존재 — 추가 건너뜀.`);
    return { added: false };
  }

  const newField = {
    type: "json",
    name: FIELD,
    required: false,
    presentable: false,
    system: false,
    hidden: false,
    /** PB 0.23+ json 옵션. maxSize 는 byte. 작은 배열이라 1MB 면 충분. */
    maxSize: 1_000_000,
  };

  if (DRY) {
    console.log(`[dry-run] 컬럼 '${FIELD}' (json) 을 컬렉션 '${COLLECTION}' 에 추가합니다.`);
    return { added: false };
  }

  const next = clonePlain(col);
  if (Array.isArray(next.fields)) {
    next.fields.push(newField);
  } else {
    next.schema = [...(next.schema ?? []), newField];
  }
  try {
    await pb.collections.update(col.id, next);
    console.log(`✔ 컬럼 '${FIELD}' (json) 추가 완료.`);
    return { added: true };
  } catch (e) {
    console.error("✗ 컬럼 추가 실패:", e?.response ?? e?.message ?? e);
    throw e;
  }
}

async function migrateExistingRecords(pb) {
  const all = await pb.collection(COLLECTION).getFullList({ batch: 500 });
  let candidates = 0;
  let updated = 0;
  const skipped = [];

  for (const rec of all) {
    const pm = rec.paymentMonths;
    const pmIsEmpty =
      pm == null ||
      (Array.isArray(pm) && pm.length === 0) ||
      (typeof pm === "string" && pm.trim() === "");

    if (!pmIsEmpty) continue; // 이미 채워진 건 건드리지 않음

    const single = Number(rec.paymentMonth);
    if (!Number.isFinite(single) || single < 1 || single > 12) {
      skipped.push({ id: rec.id, reason: `paymentMonth 가 유효하지 않음(${rec.paymentMonth})` });
      continue;
    }

    candidates += 1;
    if (DRY) {
      console.log(
        `  [dry-run] ${rec.id}  paymentMonth=${single}  →  paymentMonths=[${single}]`,
      );
      continue;
    }
    try {
      await pb.collection(COLLECTION).update(rec.id, { paymentMonths: [single] });
      updated += 1;
    } catch (e) {
      console.error(`✗ 업데이트 실패 ${rec.id}:`, e?.response ?? e?.message ?? e);
    }
  }

  console.log(
    `${DRY ? "[dry-run] " : ""}대상 ${candidates}건${DRY ? "" : ` / 업데이트 ${updated}건`}` +
      (skipped.length ? ` / 스킵 ${skipped.length}건` : ""),
  );
  if (skipped.length) {
    for (const s of skipped) console.log(`  - 스킵 ${s.id}: ${s.reason}`);
  }
}

async function main() {
  if (!url || !email || !password) {
    console.error(
      [
        "필수 환경변수가 비었습니다.",
        "  POCKETBASE_URL          PB 베이스 URL",
        "  POCKETBASE_ADMIN_EMAIL  Admin(슈퍼유저) 이메일",
        "  POCKETBASE_ADMIN_PASSWORD",
        ".env 또는 셸에서 export 후 다시 실행하세요.",
      ].join("\n"),
    );
    process.exit(1);
  }
  console.log(`PB ${url}  /  컬렉션 ${COLLECTION}  ${DRY ? "(DRY-RUN)" : ""}`);

  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  await auth(pb);
  console.log("✔ 인증 OK");

  const { added } = await ensurePaymentMonthsField(pb);
  if (added && !DRY) {
    /** 컬럼이 막 생긴 경우 일부 PB 버전에서 캐시 갱신 시간이 필요할 수 있어 잠시 대기 */
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(
    `\n--- 기존 레코드 마이그레이션 ${DRY ? "(미리보기)" : ""} ---`,
  );
  await migrateExistingRecords(pb);

  console.log(
    DRY
      ? "\nDRY-RUN 끝. 실제 적용하려면 DRY_RUN 없이 다시 실행하세요."
      : "\n완료. 분기 지원금 / 월별 스케줄 페이지를 새로고침하면 진단 배너가 사라지고 여러 지급월이 정상 반영됩니다.",
  );
}

main().catch((e) => {
  console.error(e?.response ?? e?.message ?? e);
  process.exit(1);
});
