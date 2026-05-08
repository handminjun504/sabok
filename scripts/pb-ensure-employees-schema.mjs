#!/usr/bin/env node
/**
 * PocketBase 컬렉션이 우리 앱 코드에서 기대하는 필드(number/bool/text 등)를 갖고 있는지
 * 보장하는 스크립트(컬렉션별 카탈로그 내장).
 *
 * 배경: PB 가 200 응답을 주면서도 입력값이 영영 안 들어가는("silent ignore") 사고는,
 *       대부분 해당 컬렉션에 컬럼이 없거나 required(Nonempty) 가 켜져 있어 발생한다.
 *       앱 단계에서는 응답을 정상 처리해 사용자가 원인 파악이 어려워진다.
 *
 * 동작:
 *  1) 컬렉션을 가져와 기대 필드(CATALOG[컬렉션]) 와 비교.
 *  2) 누락된 필드는 추가 (required=false, system=false).
 *  3) 존재하지만 required=true 인 number/bool/text 필드는 required=false 로 변경.
 *  4) DRY_RUN=1 이면 변경 사항만 출력하고 적용하지 않음.
 *
 * 사용:
 *   npm run pb:ensure-employees-schema           # sabok_employees
 *   npm run pb:ensure-company-settings-schema    # sabok_company_settings
 *   DRY_RUN=1 npm run pb:ensure-employees-schema # 미리보기
 *
 * 직접 컬렉션 지정:
 *   PB_FIX_COLLECTION=sabok_company_settings node scripts/pb-ensure-employees-schema.mjs
 *
 * 환경변수:
 *   POCKETBASE_URL / PB_URL
 *   POCKETBASE_ADMIN_EMAIL / PB_ADMIN_EMAIL
 *   POCKETBASE_ADMIN_PASSWORD / PB_ADMIN_PASSWORD
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
 * 컬렉션별 기대 필드 카탈로그.
 * - 모든 number/bool 필드는 required=false (입력이 비어 있을 수 있음)
 */
const CATALOG = {
  sabok_employees: [
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
  ],
  sabok_company_settings: [
    // 활성/회계 연도
    { name: "activeYear", type: "number" },
    { name: "foundingMonth", type: "number" },
    // 인센티브 자동 세후 변환 비율(1~100). 핵심 사고 지점.
    { name: "incentiveNetRatioPercent", type: "number" },
    // 본사 자본금
    { name: "headOfficeCapital", type: "number" },
    // 부속 표시 토글류 (mapCompanySettings 가 읽는 bool 들)
    { name: "surveyShowRepReturn", type: "bool" },
    { name: "surveyShowSpouseReceipt", type: "bool" },
    { name: "surveyShowWorkerNet", type: "bool" },
    /** 급여포함신고·스케줄 상한 초과/미달 표시 — BOTH | OVER_ONLY | UNDER_ONLY */
    { name: "salaryInclusionVarianceMode", type: "text" },
    /**
     * 「대표반환·배우자수령·알아서금액」 월별 금액 일정 — 월별 스케줄 ▸ 새 탭에서 입력.
     * 구조: { 직원ID: { "1": 원금액, "3": 원금액, ... } }. 빈/0 키는 저장 시 자동 제거.
     */
    { name: "repReturnSchedule", type: "json" },
    { name: "spouseReceiptSchedule", type: "json" },
    { name: "discretionarySchedule", type: "json" },
    /**
     * 「+ 반환 추가」 사용자 정의 반환 카테고리 — `{ categories: [{ key, label, byEmployeeMonth }] }`.
     * 안내 멘트 ㄴ 줄 + 수수료 base A 차감에 사용.
     */
    { name: "customReturnsSchedule", type: "json" },
    /**
     * 사복기금 운영 수수료 요율(%) — 비면 거래처 구분(개인 10/법인 2) 디폴트로 폴백.
     */
    { name: "feeRatePercent", type: "number" },
    /**
     * 수수료 청구 방식 — `EVEN_12` | `ON_PAY_MONTH`. 비면 EVEN_12.
     */
    { name: "feeBillingMode", type: "text" },
    /**
     * 사용 중단된 「당월 귀속·차월 지급」 토글. 모델·UI 에서는 제거되었지만, 기존 컬렉션과
     * 호환되도록 컬럼이 존재하는 경우 required(Nonempty)만 끄도록 catalog 에는 남겨 둔다.
     * 새 PB 환경에서 컬럼이 없다면 graceful skip(이 catalog 는 누락된 컬럼만 추가).
     */
    { name: "accrualCurrentMonthPayNext", type: "bool" },
  ],
  sabok_tenants: [
    /**
     * 「현재 통장 잔고」 — 신규 적립금 입력 경로(원).
     * null 이면 구 데이터(`reserveMonthlyByYearJson` / `accumulatedReserveTotalWon`) 폴백 활성.
     */
    { name: "reserveBalanceWon", type: "number" },
    /** 잔고 기준월 — `YYYY-MM` (예: `2026-05`). UI 표시용. */
    { name: "reserveBalanceAsOfYearMonth", type: "text" },
    /**
     * 근로자 대부금 현재 잔고(원) — 적립금과 동일한 자본금 50% 한도 트랙(별도 컬럼).
     * null 이면 「대부금 미입력」 상태(진행도/한도 표시는 0원).
     */
    { name: "workerLoanBalanceWon", type: "number" },
    /** 대부금 잔고 기준월 — `YYYY-MM`. UI 표시용. */
    { name: "workerLoanBalanceAsOfYearMonth", type: "text" },
  ],
};

const EXPECTED = CATALOG[(process.env.PB_FIX_COLLECTION || "sabok_employees").trim()] || [];

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
  if (spec.type === "text") {
    return { ...base, min: 0, max: 0, pattern: "", autogeneratePattern: "" };
  }
  if (spec.type === "json") {
    /** PocketBase JSON 필드 — 기본 maxSize 2MB 충분. */
    return { ...base, maxSize: 2_000_000 };
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

  if (EXPECTED.length === 0) {
    console.error(
      `[${COLLECTION}] 카탈로그가 정의되지 않은 컬렉션입니다. CATALOG 에 항목을 추가하거나 다른 컬렉션을 지정하세요.`,
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
  console.log(`→ required=true 인 필드(number/bool/text): ${requiredFlips.length === 0 ? "없음" : requiredFlips.join(", ")}`);
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
    if (requiredFlips.includes(f.name) && (f.type === "number" || f.type === "bool" || f.type === "text")) {
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
