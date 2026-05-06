#!/usr/bin/env node
/**
 * PocketBase 컬렉션 `sabok_employees` 가 우리 앱 코드에서 기대하는 number/bool 필드를
 * 모두 갖고 있는지 보장하는 스크립트.
 *
 * 배경: PB 가 200 응답을 주면서도 입력값이 영영 안 들어가는("silent ignore") 사고는,
 *       대부분 해당 컬렉션에 컬럼이 없거나 required(Nonempty) 가 켜져 있어 발생한다.
 *       앱 단계에서는 응답을 정상 처리해 사용자가 원인 파악이 어려워진다.
 *
 * 동작:
 *  1) 컬렉션을 가져와 기대 필드(EXPECTED) 와 비교.
 *  2) 누락된 필드는 추가 (required=false, system=false).
 *  3) 존재하지만 required=true 인 number/bool 필드는 required=false 로 변경.
 *  4) DRY_RUN=1 이면 변경 사항만 출력하고 적용하지 않음.
 *
 * 사용:
 *   npm run pb:ensure-employees-schema
 *   DRY_RUN=1 npm run pb:ensure-employees-schema   # 미리보기
 *
 * 환경변수:
 *   POCKETBASE_URL / PB_URL
 *   POCKETBASE_ADMIN_EMAIL / PB_ADMIN_EMAIL
 *   POCKETBASE_ADMIN_PASSWORD / PB_ADMIN_PASSWORD
 *   PB_FIX_COLLECTION (기본 sabok_employees)
 */

import "dotenv/config";
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
const COLLECTION = (process.env.PB_FIX_COLLECTION || "sabok_employees").trim();
const DRY = envTruthy("DRY_RUN");

/**
 * 앱이 기대하는 필드 카탈로그.
 * `mappers.ts` 의 mapEmployee 와 actions/employee.ts 의 data 객체를 기준으로 작성.
 * - 모든 number 필드는 required=false (입력이 비어 있을 수 있음)
 * - 모든 bool 필드는 required=false (체크 안 한 상태가 정상값)
 */
const EXPECTED = [
  // 식별/문자열은 별도(이미 컬렉션 스키마에 있다고 가정). 여기서는 nullable number / bool 만 보장.
  // 급여/금액
  { name: "baseSalary", type: "number" },
  { name: "adjustedSalary", type: "number" },
  { name: "welfareAllocation", type: "number" },
  { name: "priorOverpaidWelfareWon", type: "number" },
  { name: "incentiveAmount", type: "number" },
  { name: "discretionaryAmount", type: "number" },
  { name: "monthlyPayAmount", type: "number" },
  { name: "quarterlyPayAmount", type: "number" },
  { name: "expectedYearlyWelfare", type: "number" },
  { name: "monthlyRentAmount", type: "number" },
  { name: "insurancePremium", type: "number" },
  { name: "loanInterest", type: "number" },
  // 일정 (월/연도)
  { name: "birthMonth", type: "number" },
  { name: "hireMonth", type: "number" },
  { name: "resignMonth", type: "number" },
  { name: "resignYear", type: "number" },
  { name: "weddingMonth", type: "number" },
  { name: "payDay", type: "number" },
  // 가족 수
  { name: "childrenInfant", type: "number" },
  { name: "childrenPreschool", type: "number" },
  { name: "childrenTeen", type: "number" },
  { name: "parentsCount", type: "number" },
  { name: "parentsInLawCount", type: "number" },
  // 레벨
  { name: "level", type: "number" },
  // 플래그
  { name: "flagAutoAmount", type: "bool" },
  { name: "flagRepReturn", type: "bool" },
  { name: "flagSpouseReceipt", type: "bool" },
  { name: "flagWorkerNet", type: "bool" },
  { name: "flagWelfareIneligible", type: "bool" },
  { name: "flagPayWelfareOnResignMonth", type: "bool" },
];

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
  throw new Error("PocketBase SDK 에서 _superusers/admins 인증을 사용할 수 없습니다.");
}

function makeNewField(spec) {
  const base = {
    name: spec.name,
    type: spec.type,
    required: false,
    presentable: false,
    hidden: false,
  };
  if (spec.type === "number") {
    return { ...base, min: null, max: null, onlyInt: false };
  }
  return base;
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
  console.log(`[${COLLECTION}] PB URL: ${url}`);

  const existingByName = new Map();
  for (const f of col.fields) existingByName.set(f.name, f);

  /** 누락 필드 추가 + required=true → false 변경 */
  const additions = [];
  const requiredFlips = [];
  const typeMismatches = [];

  for (const spec of EXPECTED) {
    const cur = existingByName.get(spec.name);
    if (!cur) {
      additions.push(spec);
      continue;
    }
    if (cur.type !== spec.type) {
      typeMismatches.push({ name: spec.name, expected: spec.type, actual: cur.type });
      continue;
    }
    if (cur.required === true) {
      requiredFlips.push(spec.name);
    }
  }

  console.log("");
  console.log(`→ 누락 필드: ${additions.length === 0 ? "없음" : additions.map((a) => `${a.name}(${a.type})`).join(", ")}`);
  console.log(`→ required=true 인 number/bool: ${requiredFlips.length === 0 ? "없음" : requiredFlips.join(", ")}`);
  if (typeMismatches.length > 0) {
    console.log(`⚠ 타입 불일치(수동 확인 필요): ${typeMismatches.map((t) => `${t.name}: 예상=${t.expected} / 실제=${t.actual}`).join(" · ")}`);
  }

  if (additions.length === 0 && requiredFlips.length === 0) {
    console.log("\n변경 없음 — 모든 기대 필드가 이미 올바르게 존재합니다.");
    return;
  }

  if (DRY) {
    console.log("\n[DRY_RUN] 변경 미적용. 실제 적용은 DRY_RUN 없이 다시 실행하세요.");
    return;
  }

  const newFields = col.fields.map((f) => {
    if (requiredFlips.includes(f.name) && (f.type === "number" || f.type === "bool")) {
      const next = clonePlain(f);
      next.required = false;
      return next;
    }
    return f;
  });
  for (const spec of additions) {
    newFields.push(makeNewField(spec));
  }

  const payloadFields = newFields.map((f) => {
    const x = clonePlain(f);
    delete x.system;
    return x;
  });

  await pb.collections.update(col.id, { fields: payloadFields });
  console.log(`\n[${COLLECTION}] 스키마 업데이트 완료.`);
  if (additions.length > 0) {
    console.log(`  + 추가된 필드: ${additions.map((a) => a.name).join(", ")}`);
  }
  if (requiredFlips.length > 0) {
    console.log(`  ~ required=false 로 변경: ${requiredFlips.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("[pb:ensure-employees-schema]", e);
  process.exitCode = 1;
});
