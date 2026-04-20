/**
 * 단일 사용자 시드 — 계정 한 명만 만들고, 그 한 계정으로 모든 업체(다업체)를 관리한다.
 *
 * 사용 흐름:
 *   1) `.env` 에 PocketBase 관리자 정보 + 시드 입력값 채움 (`.env.example` 참고)
 *   2) `npm run pb:seed` 실행
 *   3) 로그인 → 「거래처 선택」 화면에서 업체를 자유롭게 추가·전환·삭제
 *
 * 시드 입력 환경변수:
 *   - SABOK_USER_EMAIL       (필수) 로그인 이메일
 *   - SABOK_USER_PASSWORD    (필수) 평문 비밀번호 — bcrypt 해시되어 저장
 *   - SABOK_USER_NAME        (선택, 기본: 이메일 @ 앞부분)
 *   - SABOK_TENANT_CODE      (선택) 함께 만들 첫 업체 코드. 비우면 업체는 생성하지 않음.
 *   - SABOK_TENANT_NAME      (선택) 첫 업체명. 코드만 있고 이름이 비면 코드를 이름으로 사용.
 *
 * 계정·업체가 이미 있으면 비밀번호·이름·역할만 갱신(upsert) — 비밀번호 분실 시 재실행으로 복구 가능.
 *
 * (참고) 예전 다중 역할 시드(admin/senior/junior@reversep.local)는 자동으로 정리한다.
 */
/** tsx 스크립트는 Next.js 와 달리 `.env` 자동 로드가 없어 직접 로드해 준다. */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PAYMENT_EVENT } from "../src/lib/business-rules";
import { getAdminPb } from "../src/lib/pb/admin-client";
import { C } from "../src/lib/pb/collections";
import { esc } from "../src/lib/pb/filter-esc";
import { Role } from "../src/lib/role";

const pbReady = () => getAdminPb();

async function firstByFilter(collection: string, filter: string) {
  const pb = await pbReady();
  const { items } = await pb.collection(collection).getList(1, 1, { filter });
  return items[0] as Record<string, unknown> | undefined;
}

const tenantProfileDefaults = {
  clientEntityType: "INDIVIDUAL",
  operationMode: "GENERAL",
} as const;

/** 예전 다중 역할 시드 — 단일 사용자 모드로 옮기면서 자동 정리 */
const LEGACY_SEED_EMAILS = [
  "admin@sabok.local",
  "senior@sabok.local",
  "junior@sabok.local",
  "outsourcer@sabok.local",
  "admin@reversep.local",
  "senior@reversep.local",
  "junior@reversep.local",
] as const;

async function deleteUserByEmailIfExists(email: string, keepEmail: string) {
  if (email.toLowerCase() === keepEmail.toLowerCase()) return;
  const existing = await firstByFilter(C.users, `email="${esc(email)}"`);
  if (!existing?.id) return;
  const userId = String(existing.id);
  const pb = await pbReady();
  const links = await pb.collection(C.userTenants).getFullList({ filter: `userId="${esc(userId)}"` });
  for (const row of links) {
    await pb.collection(C.userTenants).delete(String((row as { id: string }).id));
  }
  await pb.collection(C.users).delete(userId);
  console.log("정리(기존 시드 계정 삭제):", email);
}

async function upsertTenantByCode(code: string, name: string) {
  const existing = await firstByFilter(C.tenants, `code="${esc(code)}"`);
  const pb = await pbReady();
  if (existing?.id) {
    await pb.collection(C.tenants).update(String(existing.id), { name, active: true });
    return String(existing.id);
  }
  const created = await pb.collection(C.tenants).create({
    code,
    name,
    active: true,
    ...tenantProfileDefaults,
  });
  return String((created as Record<string, unknown>).id);
}

async function upsertUser(email: string, data: Record<string, unknown>) {
  const existing = await firstByFilter(C.users, `email="${esc(email)}"`);
  const pb = await pbReady();
  if (existing?.id) {
    await pb.collection(C.users).update(String(existing.id), data);
    return String(existing.id);
  }
  const created = await pb.collection(C.users).create({ email, ...data });
  return String((created as Record<string, unknown>).id);
}

type SeedInput = {
  email: string;
  password: string;
  displayName: string;
  /** 비어 있으면 업체를 만들지 않고 사용자만 시드한다(다업체 운영자가 화면에서 직접 추가) */
  tenant: { code: string; name: string } | null;
};

function readSeedInput(): SeedInput {
  const email = process.env.SABOK_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.SABOK_USER_PASSWORD;
  if (!email || !password) {
    console.error(
      [
        "필수 환경변수가 비었습니다.",
        "  SABOK_USER_EMAIL = 로그인 이메일",
        "  SABOK_USER_PASSWORD = 비밀번호 (평문 — 해시되어 저장)",
        "선택:",
        "  SABOK_USER_NAME    표시 이름 (기본: 이메일 @ 앞부분)",
        "  SABOK_TENANT_CODE  함께 만들 첫 업체 코드 (비우면 업체는 화면에서 직접 추가)",
        "  SABOK_TENANT_NAME  첫 업체명 (생략 시 코드를 이름으로 사용)",
        ".env 또는 셸에서 export 후 다시 실행하세요.",
      ].join("\n"),
    );
    process.exit(1);
  }
  const tenantCode = process.env.SABOK_TENANT_CODE?.trim();
  const tenantName = process.env.SABOK_TENANT_NAME?.trim();
  return {
    email,
    password,
    displayName: process.env.SABOK_USER_NAME?.trim() || email.split("@")[0] || "관리자",
    tenant: tenantCode ? { code: tenantCode, name: tenantName || tenantCode } : null,
  };
}

async function main() {
  const input = readSeedInput();

  /** 1) 사용자 (단일 ADMIN + isPlatformAdmin + accessAllTenants)
   *     - isPlatformAdmin: 거래처(테넌트) 추가·삭제·전환, 사용자 관리 등 전권
   *     - accessAllTenants: 멤버십(user_tenants) 등록 없이도 모든 업체 데이터 접근 */
  const passwordHash = await bcrypt.hash(input.password, 12);
  const userId = await upsertUser(input.email, {
    passwordHash,
    name: input.displayName,
    role: Role.ADMIN,
    isPlatformAdmin: true,
    accessAllTenants: true,
  });

  /** 2) (선택) 첫 업체 — 환경변수가 있을 때만 만든다 */
  let firstTenantId: string | null = null;
  if (input.tenant) {
    firstTenantId = await upsertTenantByCode(input.tenant.code, input.tenant.name);

    const pb = await pbReady();
    const link = await firstByFilter(
      C.userTenants,
      `userId="${esc(userId)}" && tenantId="${esc(firstTenantId)}"`,
    );
    if (link?.id) {
      await pb.collection(C.userTenants).update(String(link.id), { role: Role.ADMIN });
    } else {
      await pb.collection(C.userTenants).create({ userId, tenantId: firstTenantId, role: Role.ADMIN });
    }

    /** 전사 설정 — 없으면 기본값 생성 (있으면 그대로 유지) */
    const cs = await firstByFilter(C.companySettings, `tenantId="${esc(firstTenantId)}"`);
    if (!cs?.id) {
      await pb.collection(C.companySettings).create({
        tenantId: firstTenantId,
        foundingMonth: 1,
        defaultPayDay: 25,
        activeYear: new Date().getFullYear(),
        accrualCurrentMonthPayNext: false,
        paymentEventDefs: {},
      });
    }

    /** 레벨별 정기 지급 규칙 — 비어 있을 때만 가벼운 기본값 채움 */
    const year = new Date().getFullYear();
    const events = Object.values(PAYMENT_EVENT);
    for (let level = 1; level <= 5; level++) {
      for (const eventKey of events) {
        const f = `tenantId="${esc(firstTenantId)}" && year=${year} && level=${level} && eventKey="${esc(eventKey)}"`;
        const ex = await firstByFilter(C.levelPaymentRules, f);
        if (!ex?.id) {
          const base = level * 100_000;
          await pb.collection(C.levelPaymentRules).create({
            tenantId: firstTenantId,
            year,
            level,
            eventKey,
            amount: base,
          });
        }
      }
    }
  }

  /** 3) 예전 다중 역할 시드 청소 (지금 만든 계정은 보존) */
  for (const em of LEGACY_SEED_EMAILS) {
    await deleteUserByEmailIfExists(em, input.email);
  }

  const tenantBlock = input.tenant
    ? [
        `첫 업체 코드 : ${input.tenant.code}`,
        `첫 업체명    : ${input.tenant.name}`,
        `업체 ID      : ${firstTenantId}`,
      ]
    : ["첫 업체     : (생략) — 로그인 후 「거래처 선택」 화면에서 직접 추가하세요."];

  console.log(
    [
      "",
      "================================================================",
      "단일 사용자 / 다업체 시드 완료",
      "----------------------------------------------------------------",
      `이메일       : ${input.email}`,
      `비밀번호     : (방금 입력한 SABOK_USER_PASSWORD 값)`,
      `이름         : ${input.displayName}`,
      `역할         : ADMIN · isPlatformAdmin · accessAllTenants (모든 업체·메뉴 ON)`,
      ...tenantBlock,
      "----------------------------------------------------------------",
      "주의: .env 의 SABOK_SINGLE_TENANT_ID 는 비워 두세요.",
      "       (값이 있으면 거래처 선택 화면이 사라져 다업체 모드를 쓸 수 없습니다.)",
      "----------------------------------------------------------------",
      "다른 업체 추가:  로그인 → 우측 상단/사이드바 → 「거래처 선택」 → 새 업체 등록",
      "비밀번호 갱신:   .env 의 SABOK_USER_PASSWORD 새 값 + `npm run pb:seed` 재실행",
      "================================================================",
      "",
    ].join("\n"),
  );
}

main().catch((e: unknown) => {
  if (e && typeof e === "object" && "response" in e) {
    try {
      console.error("PocketBase 상세:", JSON.stringify((e as { response: unknown }).response, null, 2));
    } catch {
      /* ignore */
    }
  }
  console.error(e);
  process.exit(1);
});
