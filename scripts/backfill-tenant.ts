/**
 * 단일 Postgres + 아직 Tenant 레코드가 없는 DB에 대해,
 * 마이그레이션 중간 단계에서 남은 NULL tenantId 행을 한 업체로 묶을 때 사용합니다.
 *
 * 전제: SQL 마이그레이션에서 tenantId 컬럼이 존재하고, 일부 행이 NULL일 수 있음.
 * 이미 Tenant 가 1건 이상 있으면 아무 것도 하지 않고 종료합니다.
 *
 * 실행: npx tsx scripts/backfill-tenant.ts
 * 선택 환경변수: BACKFILL_TENANT_CODE (기본 legacy), BACKFILL_TENANT_NAME
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const code = process.env.BACKFILL_TENANT_CODE ?? "legacy";
  const name = process.env.BACKFILL_TENANT_NAME ?? "기존 데이터 (백필)";

  const n = await prisma.tenant.count();
  if (n > 0) {
    console.log(`Tenant가 이미 ${n}건 있어 백필을 건너뜁니다.`);
    return;
  }

  const tenant = await prisma.tenant.create({
    data: { code, name, active: true },
  });
  const tid = tenant.id;

  const updates: { label: string; sql: string }[] = [
    { label: "Employee", sql: `UPDATE "Employee" SET "tenantId" = $1 WHERE "tenantId" IS NULL` },
    {
      label: "CompanySettings",
      sql: `UPDATE "CompanySettings" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
    },
    {
      label: "LevelPaymentRule",
      sql: `UPDATE "LevelPaymentRule" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
    },
    { label: "LevelTarget", sql: `UPDATE "LevelTarget" SET "tenantId" = $1 WHERE "tenantId" IS NULL` },
    { label: "QuarterlyRate", sql: `UPDATE "QuarterlyRate" SET "tenantId" = $1 WHERE "tenantId" IS NULL` },
    { label: "GlSyncJob", sql: `UPDATE "GlSyncJob" SET "tenantId" = $1 WHERE "tenantId" IS NULL` },
  ];

  for (const u of updates) {
    try {
      const r = await prisma.$executeRawUnsafe(u.sql, tid);
      console.log(`${u.label}: 갱신 시도 완료 (${String(r)})`);
    } catch (e) {
      console.warn(`${u.label}: 건너뜀 또는 오류 (스키마/데이터 없음 가능)`, e);
    }
  }

  console.log(`백필 테넌트 생성: ${code} / id=${tid}`);
  console.log("이후 NOT NULL·FK·유니크 제약은 prisma migrate 로 마무리하세요.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
