/**
 * 추가 사용자 생성 또는 비밀번호·역할 갱신 후 테넌트에 연결.
 *
 * 단일 사용자 모드(권장)에서는 `npm run pb:seed` 만으로 충분하며,
 * 이 스크립트는 “별도 계정을 더 만들고 싶을 때”만 쓴다.
 * 평문 비밀번호는 저장소에 커밋하지 말 것. `POCKETBASE_URL` 등은 `.env` 또는 셸에서 설정.
 *
 * 1) 인자 모드 (로컬에서 실행):
 *   npx tsx scripts/pb-create-user.ts user@example.com 'pw' '이름' default SENIOR
 *   (역할 생략 시 SENIOR. 단일 사용자만 쓰면 ADMIN 권장)
 *
 * 2) 환경변수 모드:
 *   export SABOK_CREATE_USER_EMAIL=...
 *   export SABOK_CREATE_USER_PASSWORD=...
 *   optional: SABOK_CREATE_USER_NAME, SABOK_CREATE_USER_TENANT (기본 default), SABOK_CREATE_USER_ROLE
 *   npm run pb:create-user
 *
 * 3) 노트북 → 서버 PocketBase만 쓰고 싶을 때 (SSH 없이):
 *   POCKETBASE_URL=http://서버IP:8090 POCKETBASE_ADMIN_EMAIL=... POCKETBASE_ADMIN_PASSWORD=... \\
 *   npx tsx scripts/pb-create-user.ts user@example.com 'pw'
 */
import bcrypt from "bcryptjs";
import { getAdminPb } from "../src/lib/pb/admin-client";
import { C } from "../src/lib/pb/collections";
import { esc } from "../src/lib/pb/filter-esc";
import { Role, type Role as RoleT } from "../src/lib/role";

async function firstByFilter(collection: string, filter: string) {
  const pb = await getAdminPb();
  const { items } = await pb.collection(collection).getList(1, 1, { filter });
  return items[0] as Record<string, unknown> | undefined;
}

function parseRoleArg(s: string | undefined): RoleT {
  const v = s?.trim();
  if (v === Role.ADMIN || v === Role.SENIOR || v === Role.JUNIOR) return v;
  return Role.SENIOR;
}

type Input = {
  email: string;
  password: string;
  displayName: string;
  tenantCode: string;
  role: RoleT;
};

async function runCreateUser(input: Input) {
  const { email, password, displayName, tenantCode, role } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  const pb = await getAdminPb();

  const tenantRow = await firstByFilter(C.tenants, `code="${esc(tenantCode)}"`);
  if (!tenantRow?.id) {
    console.error(
      `테넌트 코드 '${tenantCode}' 가 없습니다. 먼저 npm run pb:seed 로 demo 등을 만들거나 테넌트를 추가하세요.`,
    );
    process.exit(1);
  }
  const tenantId = String(tenantRow.id);

  const existing = await firstByFilter(C.users, `email="${esc(email)}"`);
  let userId: string;
  if (existing?.id) {
    await pb.collection(C.users).update(String(existing.id), {
      passwordHash,
      name: displayName,
      role,
      isPlatformAdmin: false,
      accessAllTenants: false,
    });
    userId = String(existing.id);
    console.log("기존 사용자 갱신:", email);
  } else {
    const created = await pb.collection(C.users).create({
      email,
      passwordHash,
      name: displayName,
      role,
      isPlatformAdmin: false,
      accessAllTenants: false,
    });
    userId = String((created as Record<string, unknown>).id);
    console.log("사용자 생성:", email);
  }

  const link = await firstByFilter(C.userTenants, `userId="${esc(userId)}" && tenantId="${esc(tenantId)}"`);
  if (link?.id) {
    await pb.collection(C.userTenants).update(String(link.id), { role });
  } else {
    await pb.collection(C.userTenants).create({ userId, tenantId, role });
  }
  console.log(`테넌트 '${tenantCode}' 연결 완료 (역할: ${role}).`);
}

function readFromEnv(): Input | null {
  const email = process.env.SABOK_CREATE_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.SABOK_CREATE_USER_PASSWORD;
  if (!email || !password) return null;
  const displayName =
    process.env.SABOK_CREATE_USER_NAME?.trim() || email.split("@")[0] || "사용자";
  const tenantCode = process.env.SABOK_CREATE_USER_TENANT?.trim() || "default";
  const role = parseRoleArg(process.env.SABOK_CREATE_USER_ROLE);
  return { email, password, displayName, tenantCode, role };
}

function printUsage() {
  console.error(`사용법 (택일):
  [인자] npm run pb:create-user -- <email> <password> [이름] [테넌트코드] [ADMIN|SENIOR|JUNIOR]
  [환경] SABOK_CREATE_USER_EMAIL, SABOK_CREATE_USER_PASSWORD 설정 후 npm run pb:create-user (인자 없이)

원격 PB만 쓸 때: POCKETBASE_URL=http://서버:8090 과 Admin 계정 env를 현재 셸에 넣은 뒤 위와 동일하게 실행.`);
}

async function main() {
  const [, , emailRaw, passwordRaw, nameOpt, tenantCodeOpt, roleOpt] = process.argv;

  if (emailRaw?.trim() && passwordRaw) {
    const email = emailRaw.trim().toLowerCase();
    await runCreateUser({
      email,
      password: passwordRaw,
      displayName: nameOpt?.trim() || email.split("@")[0] || "사용자",
      tenantCode: tenantCodeOpt?.trim() || "default",
      role: parseRoleArg(roleOpt),
    });
    return;
  }

  const fromEnv = readFromEnv();
  if (fromEnv) {
    await runCreateUser(fromEnv);
    return;
  }

  printUsage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
