import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PAYMENT_EVENT } from "../src/lib/business-rules";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("sabok123!", 12);

  const tenant = await prisma.tenant.upsert({
    where: { code: "demo" },
    create: { code: "demo", name: "데모 고객사", active: true },
    update: { name: "데모 고객사", active: true },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@sabok.local" },
    create: {
      email: "admin@sabok.local",
      passwordHash,
      name: "시스템 관리자",
      role: Role.ADMIN,
      isPlatformAdmin: true,
    },
    update: { passwordHash, role: Role.ADMIN, isPlatformAdmin: true },
  });

  const senior = await prisma.user.upsert({
    where: { email: "senior@sabok.local" },
    create: {
      email: "senior@sabok.local",
      passwordHash,
      name: "김선임",
      role: Role.SENIOR,
      isPlatformAdmin: false,
    },
    update: { passwordHash, isPlatformAdmin: false },
  });

  const junior = await prisma.user.upsert({
    where: { email: "junior@sabok.local" },
    create: {
      email: "junior@sabok.local",
      passwordHash,
      name: "이후임",
      role: Role.JUNIOR,
      isPlatformAdmin: false,
    },
    update: { passwordHash, isPlatformAdmin: false },
  });

  for (const u of [admin, senior, junior]) {
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: u.id, tenantId: tenant.id } },
      create: { userId: u.id, tenantId: tenant.id, role: u.role },
      update: { role: u.role },
    });
  }

  await prisma.companySettings.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      foundingMonth: 1,
      defaultPayDay: 25,
      activeYear: 2026,
      accrualCurrentMonthPayNext: false,
    },
    update: {},
  });

  const year = 2026;
  const events = Object.values(PAYMENT_EVENT);
  for (let level = 1; level <= 5; level++) {
    for (const eventKey of events) {
      const base = level * 100_000;
      await prisma.levelPaymentRule.upsert({
        where: {
          tenantId_year_level_eventKey: {
            tenantId: tenant.id,
            year,
            level,
            eventKey,
          },
        },
        create: {
          tenantId: tenant.id,
          year,
          level,
          eventKey,
          amount: base,
        },
        update: { amount: base },
      });
    }
  }

  for (let level = 1; level <= 5; level++) {
    await prisma.levelTarget.upsert({
      where: { tenantId_year_level: { tenantId: tenant.id, year, level } },
      create: { tenantId: tenant.id, year, level, targetAmount: 5_000_000 },
      update: {},
    });
  }

  const emp = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: "1" } },
    create: {
      tenantId: tenant.id,
      employeeCode: "1",
      name: "샘플 직원",
      position: "대리",
      baseSalary: 45_600_000,
      adjustedSalary: 15_000_000,
      welfareAllocation: 3_000_000,
      birthMonth: 7,
      hireMonth: 9,
      weddingMonth: 10,
      childrenInfant: 0,
      childrenPreschool: 1,
      childrenTeen: 0,
      parentsCount: 2,
      parentsInLawCount: 0,
      insurancePremium: 200_000,
      loanInterest: 150_000,
      payDay: 10,
      level: 3,
      flagAutoAmount: true,
    },
    update: {},
  });

  const items = [
    "INFANT_SCHOLARSHIP",
    "PRESCHOOL_SCHOLARSHIP",
    "TEEN_SCHOLARSHIP",
    "PARENT_SUPPORT",
    "HEALTH_INSURANCE",
    "HOUSING_INTEREST",
  ] as const;
  for (const itemKey of items) {
    await prisma.quarterlyRate.upsert({
      where: { tenantId_year_itemKey: { tenantId: tenant.id, year, itemKey } },
      create: {
        tenantId: tenant.id,
        year,
        itemKey,
        amountPerInfant: itemKey === "INFANT_SCHOLARSHIP" ? 300_000 : null,
        amountPerPreschool: itemKey === "PRESCHOOL_SCHOLARSHIP" ? 250_000 : null,
        amountPerTeen: itemKey === "TEEN_SCHOLARSHIP" ? 400_000 : null,
        amountPerParent: itemKey === "PARENT_SUPPORT" ? 100_000 : null,
        amountPerInLaw: itemKey === "PARENT_SUPPORT" ? 80_000 : null,
        percentInsurance: itemKey === "HEALTH_INSURANCE" ? 0.5 : null,
        percentLoanInterest: itemKey === "HOUSING_INTEREST" ? 0.3 : null,
        flatAmount: null,
      },
      update: {},
    });
  }

  await prisma.quarterlyEmployeeConfig.upsert({
    where: {
      employeeId_year_itemKey: {
        employeeId: emp.id,
        year,
        itemKey: "PRESCHOOL_SCHOLARSHIP",
      },
    },
    create: {
      employeeId: emp.id,
      year,
      itemKey: "PRESCHOOL_SCHOLARSHIP",
      paymentMonth: 3,
      amount: 250_000,
    },
    update: {},
  });

  console.log(
    "시드 완료: admin@sabok.local / senior@sabok.local / junior@sabok.local 비밀번호 sabok123! · 업체 코드 demo",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
