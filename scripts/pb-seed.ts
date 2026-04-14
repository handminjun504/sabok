/**
 * PocketBase 시드 (Admin API). `docs/pb-collections.md` 컬렉션이 준비된 뒤 실행.
 */
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

const tenantProfileDefaults = {
  clientEntityType: "INDIVIDUAL",
  operationMode: "GENERAL",
} as const;

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

async function main() {
  const passwordHash = await bcrypt.hash("sabok123!", 12);
  const tenantId = await upsertTenantByCode("demo", "데모 고객사");

  const adminId = await upsertUser("admin@sabok.local", {
    passwordHash,
    name: "시스템 관리자",
    role: Role.ADMIN,
    isPlatformAdmin: true,
    accessAllTenants: false,
  });
  const seniorId = await upsertUser("senior@sabok.local", {
    passwordHash,
    name: "김선임",
    role: Role.SENIOR,
    isPlatformAdmin: false,
    accessAllTenants: false,
  });
  const juniorId = await upsertUser("junior@sabok.local", {
    passwordHash,
    name: "이후임",
    role: Role.JUNIOR,
    isPlatformAdmin: false,
    accessAllTenants: false,
  });
  await upsertUser("outsourcer@sabok.local", {
    passwordHash,
    name: "아웃소싱 대리(데모)",
    role: Role.SENIOR,
    isPlatformAdmin: false,
    accessAllTenants: true,
  });

  const pb = await pbReady();
  for (const [uid, role] of [
    [adminId, Role.ADMIN],
    [seniorId, Role.SENIOR],
    [juniorId, Role.JUNIOR],
  ] as const) {
    const l = await firstByFilter(C.userTenants, `userId="${esc(uid)}" && tenantId="${esc(tenantId)}"`);
    if (l?.id) {
      await pb.collection(C.userTenants).update(String(l.id), { role });
    } else {
      await pb.collection(C.userTenants).create({ userId: uid, tenantId, role });
    }
  }

  const cs = await firstByFilter(C.companySettings, `tenantId="${esc(tenantId)}"`);
  if (cs?.id) {
    /* keep */
  } else {
    await pb.collection(C.companySettings).create({
      tenantId,
      foundingMonth: 1,
      defaultPayDay: 25,
      activeYear: 2026,
      accrualCurrentMonthPayNext: false,
      paymentEventDefs: {},
    });
  }

  const demoVendorF = `tenantId="${esc(tenantId)}" && code="DEMO-VENDOR"`;
  const demoVendor = await firstByFilter(C.vendors, demoVendorF);
  if (!demoVendor?.id) {
    await pb.collection(C.vendors).create({
      tenantId,
      code: "DEMO-VENDOR",
      name: "데모 거래처",
      businessType: "INDIVIDUAL",
      workplaceCapital: 0,
      accumulatedReserve: 0,
      active: true,
      memo: null,
    });
  }

  const year = 2026;
  const events = Object.values(PAYMENT_EVENT);
  for (let level = 1; level <= 5; level++) {
    for (const eventKey of events) {
      const base = level * 100_000;
      const f = `tenantId="${esc(tenantId)}" && year=${year} && level=${level} && eventKey="${esc(eventKey)}"`;
      const ex = await firstByFilter(C.levelPaymentRules, f);
      if (ex?.id) {
        await pb.collection(C.levelPaymentRules).update(String(ex.id), { amount: base });
      } else {
        await pb.collection(C.levelPaymentRules).create({ tenantId, year, level, eventKey, amount: base });
      }
    }
  }

  for (let level = 1; level <= 5; level++) {
    const f = `tenantId="${esc(tenantId)}" && year=${year} && level=${level}`;
    const ex = await firstByFilter(C.levelTargets, f);
    if (ex?.id) {
      /* ok */
    } else {
      await pb.collection(C.levelTargets).create({
        tenantId,
        year,
        level,
        targetAmount: 5_000_000,
      });
    }
  }

  const empFilter = `tenantId="${esc(tenantId)}" && employeeCode="1"`;
  let empRec = await firstByFilter(C.employees, empFilter);
  if (empRec?.id) {
    /* sample exists */
  } else {
    empRec = (await pb.collection(C.employees).create({
      tenantId,
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
      flagRepReturn: false,
      flagSpouseReceipt: false,
      flagWorkerNet: false,
    })) as Record<string, unknown>;
  }
  const empId = String(empRec.id);

  const items = [
    "INFANT_SCHOLARSHIP",
    "PRESCHOOL_SCHOLARSHIP",
    "TEEN_SCHOLARSHIP",
    "PARENT_SUPPORT",
    "HEALTH_INSURANCE",
    "HOUSING_INTEREST",
  ] as const;
  for (const itemKey of items) {
    const f = `tenantId="${esc(tenantId)}" && year=${year} && itemKey="${esc(itemKey)}"`;
    const ex = await firstByFilter(C.quarterlyRates, f);
    const body = {
      tenantId,
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
    };
    if (ex?.id) {
      await pb.collection(C.quarterlyRates).update(String(ex.id), body);
    } else {
      await pb.collection(C.quarterlyRates).create(body);
    }
  }

  const qf = `employeeId="${esc(empId)}" && year=${year} && itemKey="PRESCHOOL_SCHOLARSHIP"`;
  const qx = await firstByFilter(C.quarterlyEmployeeConfigs, qf);
  if (qx?.id) {
    await pb.collection(C.quarterlyEmployeeConfigs).update(String(qx.id), {
      paymentMonth: 3,
      paymentMonths: [3],
      amount: 250_000,
    });
  } else {
    await pb.collection(C.quarterlyEmployeeConfigs).create({
      employeeId: empId,
      year,
      itemKey: "PRESCHOOL_SCHOLARSHIP",
      paymentMonth: 3,
      paymentMonths: [3],
      amount: 250_000,
    });
  }

  console.log(
    "PB 시드 완료: admin@sabok.local / senior@sabok.local / junior@sabok.local 비밀번호 sabok123! · 업체 코드 demo",
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
