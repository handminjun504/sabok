import type {
  AuditLogRow,
  CompanySettings,
  CustomPaymentEventDef,
  Employee,
  GlSyncJobRow,
  Level5Override,
  LevelPaymentRule,
  LevelTarget,
  MonthlyEmployeeNote,
  PaymentEventDefsByYear,
  QuarterlyEmployeeConfig,
  QuarterlyRate,
  SalaryInclusionVarianceMode,
  Tenant,
  UserRow,
  UserTenantLink,
  UserWithTenants,
  Vendor,
  VendorContribution,
} from "@/types/models";
import type { VendorBusinessType } from "@/lib/domain/vendor-reserve";
import {
  parseTenantClientEntityType,
  parseTenantOperationMode,
  type TenantClientEntityType,
  type TenantOperationMode,
} from "@/lib/domain/tenant-profile";
import type { Role } from "@/lib/role";
import { parseRole } from "@/lib/role";
import { ClientResponseError } from "pocketbase";
import { getAdminPb } from "./admin-client";
import { logPbClientError, pocketBaseRecordErrorMessage } from "./client-error-log";
import { C } from "./collections";
import { esc } from "./filter-esc";
import {
  mapCompanySettings,
  mapEmployee,
  mapLevel5Override,
  mapLevelRule,
  mapLevelTarget,
  mapMonthlyNote,
  mapQuarterlyCfg,
  mapQuarterlyRate,
} from "./mappers";

function asRecord(r: unknown): Record<string, unknown> {
  return r && typeof r === "object" ? (r as Record<string, unknown>) : {};
}

async function firstByFilter(collection: string, filter: string): Promise<Record<string, unknown> | null> {
  try {
    const pb = await getAdminPb();
    const { items } = await pb.collection(collection).getList(1, 1, { filter });
    return items[0] ? asRecord(items[0]) : null;
  } catch (e) {
    console.error("[pb] firstByFilter", collection, e);
    return null;
  }
}

/** filter 일치 레코드 배치 삭제 (종속 데이터 정리) */
async function deleteAllByFilter(collection: string, filter: string): Promise<void> {
  const pb = await getAdminPb();
  for (;;) {
    const { items } = await pb.collection(collection).getList(1, 500, { filter });
    if (!items.length) break;
    for (const item of items) {
      await pb.collection(collection).delete(item.id);
    }
  }
}

function parseBusinessType(v: unknown): VendorBusinessType {
  return String(v) === "CORPORATE" ? "CORPORATE" : "INDIVIDUAL";
}

function mapVendorRow(r: Record<string, unknown>): Vendor {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    businessType: parseBusinessType(r.businessType),
    workplaceCapital: Number(r.workplaceCapital ?? 0) || 0,
    accumulatedReserve: Number(r.accumulatedReserve ?? 0) || 0,
    active: Boolean(r.active ?? true),
    memo: r.memo == null || r.memo === "" ? null : String(r.memo),
  };
}

function mapVendorContributionRow(r: Record<string, unknown>): VendorContribution {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    vendorId: String(r.vendorId),
    contributionAmount: Number(r.contributionAmount ?? 0) || 0,
    additionalReserved: Number(r.additionalReserved ?? 0) || 0,
    reserveAfter: Number(r.reserveAfter ?? 0) || 0,
    note: r.note == null || r.note === "" ? null : String(r.note),
    occurredAt: r.occurredAt == null || r.occurredAt === "" ? null : String(r.occurredAt),
    created: new Date(String(r.created ?? Date.now())),
  };
}

/** PB 필드명이 camelCase가 아닐 때(Admin에서 snake_case·한글 등) 대비 */
function tenantTextField(r: Record<string, unknown>, primary: string, ...aliases: string[]): string | null {
  for (const k of [primary, ...aliases]) {
    const v = r[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/** PB에 숫자 필드가 clientEntityType 슬롯에 잘못 들어가면 법인이 개인으로 보이는 문제 방지 */
function tenantClientEntityFromPb(r: Record<string, unknown>): TenantClientEntityType {
  const tryKeys = ["clientEntityType", "client_entity_type", "적립구분"] as const;
  for (const k of tryKeys) {
    const v = r[k];
    if (v == null || v === "") continue;
    if (typeof v === "number") continue;
    const s = String(v).trim();
    if (!s) continue;
    if (/^\d+([.,]\d+)?$/.test(s)) continue;
    return parseTenantClientEntityType(v);
  }
  return parseTenantClientEntityType(r.clientEntityType);
}

function tenantFromPbRecord(r: Record<string, unknown>): Tenant {
  const cap = Number(r.headOfficeCapital);
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    active: Boolean(r.active ?? true),
    memo: r.memo == null || r.memo === "" ? null : String(r.memo),
    clientEntityType: tenantClientEntityFromPb(r),
    operationMode: parseTenantOperationMode(r.operationMode),
    approvalNumber: tenantTextField(r, "approvalNumber", "approval_number", "인가번호"),
    businessRegNo: tenantTextField(
      r,
      "businessRegNo",
      "business_reg_no",
      "businessRegNumber",
      "사업자등록번호",
    ),
    headOfficeCapital: Number.isFinite(cap) ? cap : null,
  };
}

/** --- Tenants --- */
export async function tenantGetById(id: string): Promise<Tenant | null> {
  try {
    const pb = await getAdminPb();
    const r = asRecord(await pb.collection(C.tenants).getOne(id));
    return tenantFromPbRecord(r);
  } catch (e) {
    console.error("[pb] tenantGetById", id, e);
    return null;
  }
}

export async function tenantFindFirstActive(id: string): Promise<Tenant | null> {
  const r = await firstByFilter(C.tenants, `id="${esc(id)}" && active=true`);
  if (!r || !r.id) return null;
  return tenantFromPbRecord(r);
}

export async function tenantFindByCode(code: string): Promise<Tenant | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const r = await firstByFilter(C.tenants, `code="${esc(trimmed)}"`);
  if (!r || !r.id) return null;
  return tenantFromPbRecord(r);
}

export async function tenantListActiveByCodeAsc(): Promise<Tenant[]> {
  try {
    const pb = await getAdminPb();
    const rows = await pb.collection(C.tenants).getFullList({ filter: `active=true`, sort: "code" });
    return rows.map((x) => tenantFromPbRecord(asRecord(x)));
  } catch (e) {
    console.error("[pb] tenantListActiveByCodeAsc", e);
    return [];
  }
}

export type TenantWithCounts = Tenant & { _count: { employees: number } };

export async function tenantListAllByCodeAscWithCounts(): Promise<TenantWithCounts[]> {
  try {
    const pb = await getAdminPb();
    const rows = await pb.collection(C.tenants).getFullList({ sort: "code" });
    const out: TenantWithCounts[] = [];
    for (const x of rows) {
      const r = asRecord(x);
      const tid = String(r.id);
      const ec = await pb.collection(C.employees).getList(1, 1, { filter: `tenantId="${esc(tid)}"` });
      out.push({
        ...tenantFromPbRecord(r),
        _count: { employees: ec.totalItems },
      });
    }
    return out;
  } catch (e) {
    console.error("[pb] tenantListAllByCodeAscWithCounts", e);
    return [];
  }
}

export async function tenantCreate(data: {
  code: string;
  name: string;
  active: boolean;
  clientEntityType: TenantClientEntityType;
  operationMode: TenantOperationMode;
  memo?: string | null;
  approvalNumber?: string | null;
  businessRegNo?: string | null;
  headOfficeCapital?: number | null;
}): Promise<Tenant> {
  const pb = await getAdminPb();

  /** PB에 컬럼이 없으면 알 수 없는 필드로 400이 나므로, 값이 있을 때만 키를 넣는다. */
  const base: Record<string, unknown> = {
    code: data.code,
    name: data.name,
    active: data.active,
    clientEntityType: data.clientEntityType,
    operationMode: data.operationMode,
    memo: data.memo ?? null,
  };

  const optional: Record<string, unknown> = {};
  const ap = data.approvalNumber != null ? String(data.approvalNumber).trim() : "";
  if (ap) optional.approvalNumber = ap;
  const br = data.businessRegNo != null ? String(data.businessRegNo).trim() : "";
  if (br) optional.businessRegNo = br;
  if (data.headOfficeCapital != null && Number.isFinite(data.headOfficeCapital)) {
    optional.headOfficeCapital = data.headOfficeCapital;
  }

  const withOptional = { ...base, ...optional };

  try {
    const created = asRecord(await pb.collection(C.tenants).create(withOptional));
    return tenantFromPbRecord(created);
  } catch (e) {
    if (Object.keys(optional).length === 0) {
      logPbClientError("tenantCreate", e);
      throw e;
    }
    try {
      const created = asRecord(await pb.collection(C.tenants).create(base));
      logPbClientError("tenantCreate (first attempt failed; retried without optional fields)", e);
      console.warn(
        "[pb] tenantCreate: 인가번호·사업자번호·본사자본금은 저장되지 않았습니다. sabok_tenants에 해당 필드를 추가한 뒤 다시 등록하세요.",
      );
      return tenantFromPbRecord(created);
    } catch (e2) {
      logPbClientError("tenantCreate", e2);
      throw e2;
    }
  }
}

export async function tenantUpdateActive(id: string, active: boolean): Promise<void> {
  const pb = await getAdminPb();
  await pb.collection(C.tenants).update(id, { active });
}

export async function tenantUpdateProfile(
  id: string,
  data: {
    name: string;
    memo: string | null;
    clientEntityType: TenantClientEntityType;
    operationMode: TenantOperationMode;
    approvalNumber: string | null;
    businessRegNo: string | null;
    headOfficeCapital: number | null;
  }
): Promise<Tenant> {
  const pb = await getAdminPb();
  const r = asRecord(
    await pb.collection(C.tenants).update(id, {
      name: data.name.trim(),
      memo: data.memo ?? null,
      clientEntityType: data.clientEntityType,
      operationMode: data.operationMode,
      approvalNumber: data.approvalNumber,
      businessRegNo: data.businessRegNo,
      headOfficeCapital: data.headOfficeCapital,
    })
  );
  return tenantFromPbRecord(r);
}

/** --- Users --- */
export async function userFindByEmail(email: string): Promise<UserRow | null> {
  const r = await firstByFilter(C.users, `email="${esc(email)}"`);
  if (!r || !r.id) return null;
  return {
    id: String(r.id),
    email: String(r.email),
    passwordHash: String(r.passwordHash),
    name: String(r.name),
    role: String(r.role),
    isPlatformAdmin: Boolean(r.isPlatformAdmin),
    accessAllTenants: Boolean(r.accessAllTenants),
  };
}

export async function userLoadWithTenantsByEmail(email: string): Promise<UserWithTenants | null> {
  const u = await userFindByEmail(email);
  if (!u) return null;
  const userTenants: UserTenantLink[] = [];
  try {
    const pb = await getAdminPb();
    const links = await pb.collection(C.userTenants).getFullList({
      filter: `userId="${esc(u.id)}"`,
      sort: "tenantId",
    });
    for (const row of links) {
      const lr = asRecord(row);
      const tid = String(lr.tenantId);
      const t = await tenantGetById(tid);
      if (!t) continue;
      if (!t.active) continue;
      userTenants.push({
        id: String(lr.id),
        userId: String(lr.userId),
        tenantId: tid,
        role: String(lr.role),
        tenant: t,
      });
    }
    userTenants.sort((a, b) => a.tenant.code.localeCompare(b.tenant.code));
  } catch (e) {
    console.error("[pb] userLoadWithTenantsByEmail links", e);
  }
  return { ...u, userTenants };
}

/** --- User tenants --- */
export async function userTenantFind(userId: string, tenantId: string): Promise<{ id: string; role: Role } | null> {
  const r = await firstByFilter(C.userTenants, `userId="${esc(userId)}" && tenantId="${esc(tenantId)}"`);
  if (!r || !r.id) return null;
  return { id: String(r.id), role: parseRole(String(r.role)) };
}

export async function userTenantListWithTenantsForUser(userId: string): Promise<UserTenantLink[]> {
  try {
    const pb = await getAdminPb();
    const links = await pb.collection(C.userTenants).getFullList({
      filter: `userId="${esc(userId)}"`,
      sort: "tenantId",
    });
    const out: UserTenantLink[] = [];
    for (const row of links) {
      const lr = asRecord(row);
      const t = await tenantGetById(String(lr.tenantId));
      if (!t) continue;
      if (!t.active) continue;
      out.push({
        id: String(lr.id),
        userId: String(lr.userId),
        tenantId: String(lr.tenantId),
        role: String(lr.role),
        tenant: t,
      });
    }
    out.sort((a, b) => a.tenant.code.localeCompare(b.tenant.code));
    return out;
  } catch (e) {
    console.error("[pb] userTenantListWithTenantsForUser", userId, e);
    return [];
  }
}

/** --- Company settings --- */
export async function companySettingsByTenant(tenantId: string): Promise<CompanySettings | null> {
  const r = await firstByFilter(C.companySettings, `tenantId="${esc(tenantId)}"`);
  return r ? mapCompanySettings(r) : null;
}

/** 적립금 탭 메모만 갱신(PB에 `reserveProgressNote` text 필드 필요). */
export async function companySettingsUpdateReserveProgressNote(
  tenantId: string,
  reserveProgressNote: string | null
): Promise<void> {
  const existing = await companySettingsByTenant(tenantId);
  if (!existing?.id) throw new Error("전사 설정(company settings)이 없습니다.");
  const pb = await getAdminPb();
  const trimmed = reserveProgressNote?.trim() ?? "";
  await pb.collection(C.companySettings).update(existing.id, {
    reserveProgressNote: trimmed === "" ? null : trimmed,
  });
}

function companySettingsAccrualNonemptyIssue(detailLower: string): boolean {
  return (
    detailLower.includes("accrualcurrentmonthpaynext") &&
    (detailLower.includes("blank") ||
      detailLower.includes("missing required") ||
      detailLower.includes("nonempty") ||
      detailLower.includes("cannot be blank"))
  );
}

export async function companySettingsCreateForTenant(tenantId: string): Promise<void> {
  const pb = await getAdminPb();
  const activeYear = new Date().getFullYear();
  const payload = (accrualCurrentMonthPayNext: boolean) => ({
    tenantId,
    foundingMonth: 1,
    defaultPayDay: 25,
    activeYear,
    accrualCurrentMonthPayNext,
    paymentEventDefs: {} as Record<string, unknown>,
  });

  try {
    await pb.collection(C.companySettings).create(payload(false));
    return;
  } catch (e) {
    if (!(e instanceof ClientResponseError)) {
      logPbClientError("companySettingsCreateForTenant", e);
      throw e;
    }
    const detail = pocketBaseRecordErrorMessage(e);
    const detailLower = detail.toLowerCase();
    if (!companySettingsAccrualNonemptyIssue(detailLower)) {
      logPbClientError("companySettingsCreateForTenant", e);
      throw e;
    }
    try {
      await pb.collection(C.companySettings).create(payload(true));
      console.warn(
        "[pb] companySettingsCreateForTenant: accrualCurrentMonthPayNext=false 가 PocketBase Nonempty 등으로 거절되어 true 로 생성했습니다. " +
          "Admin에서 해당 bool 필드의 Nonempty를 끄면 false 로도 저장할 수 있습니다. 필요하면 전사 설정에서 귀속·지급 옵션을 바꾸세요.",
      );
    } catch (e2) {
      logPbClientError("companySettingsCreateForTenant (retry with accrual=true)", e2);
      throw e2;
    }
  }
}

export async function companySettingsUpsert(
  tenantId: string,
  data: {
    foundingMonth: number;
    defaultPayDay: number;
    activeYear: number;
    accrualCurrentMonthPayNext: boolean;
    salaryInclusionVarianceMode: SalaryInclusionVarianceMode;
    surveyShowRepReturn: boolean;
    surveyShowSpouseReceipt: boolean;
    surveyShowWorkerNet: boolean;
  }
): Promise<void> {
  const existing = await companySettingsByTenant(tenantId);
  const pb = await getAdminPb();
  if (existing) {
    try {
      await pb.collection(C.companySettings).update(existing.id, data);
    } catch (e) {
      if (!(e instanceof ClientResponseError)) throw e;
      const detailLower = pocketBaseRecordErrorMessage(e).toLowerCase();
      if (companySettingsAccrualNonemptyIssue(detailLower)) {
        throw new Error(
          "accrualCurrentMonthPayNext=false 가 PocketBase에서 거절되었습니다(보통 bool 필드에 Nonempty·required 조합). " +
            "PocketBase Admin에서 해당 필드의 Nonempty를 끄거나, 서버에서 `npm run pb:fix-company-settings-schema` 를 실행한 뒤 다시 저장하세요. " +
            "(surveyShow* 등 다른 bool도 동일할 수 있습니다.)",
        );
      }
      throw e;
    }
    return;
  }

  try {
    await pb.collection(C.companySettings).create({ tenantId, ...data, paymentEventDefs: {} });
  } catch (e) {
    if (!(e instanceof ClientResponseError)) {
      logPbClientError("companySettingsUpsert(create)", e);
      throw e;
    }
    const detailLower = pocketBaseRecordErrorMessage(e).toLowerCase();
    if (!companySettingsAccrualNonemptyIssue(detailLower)) {
      logPbClientError("companySettingsUpsert(create)", e);
      throw e;
    }
    try {
      await pb.collection(C.companySettings).create({
        tenantId,
        ...data,
        accrualCurrentMonthPayNext: true,
        paymentEventDefs: {},
      });
      console.warn(
        "[pb] companySettingsUpsert(create): accrualCurrentMonthPayNext=false 가 Nonempty 등으로 거절되어 true 로 생성했습니다. " +
          "`npm run pb:fix-company-settings-schema` 로 스키마를 고치면 false 로도 저장할 수 있습니다.",
      );
    } catch (e2) {
      logPbClientError("companySettingsUpsert(create, retry accrual=true)", e2);
      throw e2;
    }
  }
}

function clonePaymentEventDefs(src: PaymentEventDefsByYear | null): PaymentEventDefsByYear {
  if (!src) return {};
  const out: PaymentEventDefsByYear = {};
  for (const [k, v] of Object.entries(src)) {
    out[k] = v.map((d) => ({ ...d }));
  }
  return out;
}

/** 추가 정기 지급 행사 등록. 반환: 생성된 eventKey */
export async function paymentEventDefAppend(
  tenantId: string,
  year: number,
  def: Omit<CustomPaymentEventDef, "eventKey"> & { eventKey?: string }
): Promise<string> {
  const existing = await companySettingsByTenant(tenantId);
  if (!existing?.id) throw new Error("company settings missing");
  const pb = await getAdminPb();
  const eventKey = def.eventKey?.trim() || `EXT_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const yk = String(year);
  const next = clonePaymentEventDefs(existing.paymentEventDefs);
  const list = [...(next[yk] ?? [])];
  if (list.some((d) => d.eventKey === eventKey)) throw new Error("duplicate eventKey");
  list.push({ eventKey, label: def.label, accrualMonth: def.accrualMonth });
  next[yk] = list;
  await pb.collection(C.companySettings).update(existing.id, { paymentEventDefs: next });
  return eventKey;
}

export async function paymentEventDefRemove(tenantId: string, year: number, eventKey: string): Promise<void> {
  const existing = await companySettingsByTenant(tenantId);
  if (!existing?.id) return;
  const pb = await getAdminPb();
  const yk = String(year);
  const next = clonePaymentEventDefs(existing.paymentEventDefs);
  const list = (next[yk] ?? []).filter((d) => d.eventKey !== eventKey);
  if (list.length) next[yk] = list;
  else delete next[yk];
  await pb.collection(C.companySettings).update(existing.id, {
    paymentEventDefs: Object.keys(next).length ? next : {},
  });
}

export async function levelPaymentRuleDeleteByTenantYearEventKey(
  tenantId: string,
  year: number,
  eventKey: string
): Promise<void> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.levelPaymentRules).getFullList({
    filter: `tenantId="${esc(tenantId)}" && year=${year} && eventKey="${esc(eventKey)}"`,
  });
  for (const r of rows) {
    await pb.collection(C.levelPaymentRules).delete(r.id);
  }
}

export async function level5OverrideDeleteByTenantYearEventKey(
  tenantId: string,
  year: number,
  eventKey: string
): Promise<void> {
  const emps = await employeeListByTenantCodeAsc(tenantId);
  if (emps.length === 0) return;
  const idSet = new Set(emps.map((e) => e.id));
  const pb = await getAdminPb();
  const rows = await pb.collection(C.level5Overrides).getFullList({
    filter: `year=${year} && eventKey="${esc(eventKey)}"`,
  });
  for (const r of rows) {
    const eid = String((r as { employeeId?: string }).employeeId ?? "");
    if (idSet.has(eid)) await pb.collection(C.level5Overrides).delete(r.id);
  }
}

/** --- Employees --- */
export async function employeeCountByTenant(tenantId: string): Promise<number> {
  try {
    const pb = await getAdminPb();
    const r = await pb.collection(C.employees).getList(1, 1, { filter: `tenantId="${esc(tenantId)}"` });
    return r.totalItems;
  } catch (e) {
    console.error("[pb] employeeCountByTenant", tenantId, e);
    return 0;
  }
}

export async function employeeListByTenantCodeAsc(tenantId: string): Promise<Employee[]> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.employees).getFullList({
    filter: `tenantId="${esc(tenantId)}"`,
    sort: "employeeCode",
  });
  return rows.map((x) => mapEmployee(asRecord(x)));
}

/**
 * 신규 직원용 숫자 코드: 기존 코드 중 순수 숫자만 보고 max+1 (0 포함해 max 계산, 다음 번호 부여).
 * 대표이사 전용 0번은 호출 전에 별도 처리.
 */
export async function employeeNextAutoCodeForTenant(tenantId: string): Promise<string> {
  const list = await employeeListByTenantCodeAsc(tenantId);
  let max = 0;
  for (const e of list) {
    const c = e.employeeCode.trim();
    if (/^\d+$/.test(c)) {
      const n = parseInt(c, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return String(max + 1);
}

export async function employeeFindFirst(id: string, tenantId: string): Promise<Employee | null> {
  const r = await firstByFilter(C.employees, `id="${esc(id)}" && tenantId="${esc(tenantId)}"`);
  return r ? mapEmployee(r) : null;
}

export async function employeeCreate(data: Record<string, unknown>): Promise<Employee> {
  const pb = await getAdminPb();
  const created = asRecord(await pb.collection(C.employees).create(data));
  return mapEmployee(created);
}

export async function employeeUpdate(id: string, data: Record<string, unknown>): Promise<void> {
  const pb = await getAdminPb();
  await pb.collection(C.employees).update(id, data);
}

export async function employeeDelete(id: string): Promise<void> {
  const pb = await getAdminPb();
  await deleteAllByFilter(C.level5Overrides, `employeeId="${esc(id)}"`);
  await deleteAllByFilter(C.quarterlyEmployeeConfigs, `employeeId="${esc(id)}"`);
  await deleteAllByFilter(C.monthlyEmployeeNotes, `employeeId="${esc(id)}"`);
  await pb.collection(C.employees).delete(id);
}

/** 거래처·종속 데이터 전부 삭제. 플랫폼 관리자 전용. */
export async function tenantDeleteCascade(tenantId: string): Promise<void> {
  const pb = await getAdminPb();
  const empRows = await pb.collection(C.employees).getFullList({
    filter: `tenantId="${esc(tenantId)}"`,
  });
  for (const row of empRows) {
    await employeeDelete(String(asRecord(row).id));
  }
  await deleteAllByFilter(C.vendorContributions, `tenantId="${esc(tenantId)}"`);
  await deleteAllByFilter(C.vendors, `tenantId="${esc(tenantId)}"`);
  await deleteAllByFilter(C.levelPaymentRules, `tenantId="${esc(tenantId)}"`);
  await deleteAllByFilter(C.levelTargets, `tenantId="${esc(tenantId)}"`);
  await deleteAllByFilter(C.quarterlyRates, `tenantId="${esc(tenantId)}"`);
  await deleteAllByFilter(C.companySettings, `tenantId="${esc(tenantId)}"`);
  await deleteAllByFilter(C.userTenants, `tenantId="${esc(tenantId)}"`);
  await deleteAllByFilter(C.auditLogs, `tenantId="${esc(tenantId)}"`);
  await deleteAllByFilter(C.glSyncJobs, `tenantId="${esc(tenantId)}"`);
  await pb.collection(C.tenants).delete(tenantId);
}

export async function employeeUpsertByTenantCode(
  tenantId: string,
  employeeCode: string,
  createPayload: Record<string, unknown>,
  updatePayload: Record<string, unknown>
): Promise<void> {
  const r = await firstByFilter(C.employees, `tenantId="${esc(tenantId)}" && employeeCode="${esc(employeeCode)}"`);
  const pb = await getAdminPb();
  if (r?.id) {
    await pb.collection(C.employees).update(String(r.id), updatePayload);
  } else {
    await pb.collection(C.employees).create({ ...createPayload, tenantId, employeeCode });
  }
}

/** --- Level payment rules --- */
export async function levelPaymentRuleList(tenantId: string, year: number): Promise<LevelPaymentRule[]> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.levelPaymentRules).getFullList({
    filter: `tenantId="${esc(tenantId)}" && year=${year}`,
  });
  return rows.map((x) => mapLevelRule(asRecord(x)));
}

export async function levelPaymentRuleUpsert(data: {
  tenantId: string;
  year: number;
  level: number;
  eventKey: string;
  amount: number;
}): Promise<void> {
  const f = `tenantId="${esc(data.tenantId)}" && year=${data.year} && level=${data.level} && eventKey="${esc(data.eventKey)}"`;
  const pb = await getAdminPb();
  /** `firstByFilter`는 오류 시 null을 반환해 upsert가 잘못된 create를 시도할 수 있음 → 조회 실패는 그대로 전파 */
  const { items } = await pb.collection(C.levelPaymentRules).getList(1, 1, { filter: f });
  const hit = items[0];
  if (hit) {
    await pb.collection(C.levelPaymentRules).update(String(hit.id), { amount: data.amount });
  } else {
    await pb.collection(C.levelPaymentRules).create(data);
  }
}

/** --- Level targets --- */
export async function levelTargetList(tenantId: string, year: number): Promise<LevelTarget[]> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.levelTargets).getFullList({
    filter: `tenantId="${esc(tenantId)}" && year=${year}`,
  });
  return rows.map((x) => mapLevelTarget(asRecord(x)));
}

export async function levelTargetUpsert(data: {
  tenantId: string;
  year: number;
  level: number;
  targetAmount: number;
}): Promise<void> {
  const f = `tenantId="${esc(data.tenantId)}" && year=${data.year} && level=${data.level}`;
  const existing = await firstByFilter(C.levelTargets, f);
  const pb = await getAdminPb();
  if (existing?.id) {
    await pb.collection(C.levelTargets).update(String(existing.id), { targetAmount: data.targetAmount });
  } else {
    await pb.collection(C.levelTargets).create(data);
  }
}

/** --- Level 5 overrides --- */
export async function level5OverrideListByEmployeeYear(employeeId: string, year: number): Promise<Level5Override[]> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.level5Overrides).getFullList({
    filter: `employeeId="${esc(employeeId)}" && year=${year}`,
  });
  return rows.map((x) => mapLevel5Override(asRecord(x)));
}

export async function level5OverrideListByEmployeeIdsYear(
  employeeIds: string[],
  year: number
): Promise<Level5Override[]> {
  if (employeeIds.length === 0) return [];
  const pb = await getAdminPb();
  const empFilter = employeeIds.map((id) => `employeeId="${esc(id)}"`).join(" || ");
  const rows = await pb.collection(C.level5Overrides).getFullList({
    filter: `year=${year} && (${empFilter})`,
  });
  return rows.map((x) => mapLevel5Override(asRecord(x)));
}

export async function level5OverrideUpsert(data: {
  employeeId: string;
  year: number;
  eventKey: string;
  amount: number;
}): Promise<void> {
  const f = `employeeId="${esc(data.employeeId)}" && year=${data.year} && eventKey="${esc(data.eventKey)}"`;
  const existing = await firstByFilter(C.level5Overrides, f);
  const pb = await getAdminPb();
  if (existing?.id) {
    await pb.collection(C.level5Overrides).update(String(existing.id), { amount: data.amount });
  } else {
    await pb.collection(C.level5Overrides).create(data);
  }
}

export async function level5OverrideDelete(employeeId: string, year: number, eventKey: string): Promise<void> {
  const r = await firstByFilter(
    C.level5Overrides,
    `employeeId="${esc(employeeId)}" && year=${year} && eventKey="${esc(eventKey)}"`
  );
  if (!r?.id) return;
  const pb = await getAdminPb();
  await pb.collection(C.level5Overrides).delete(String(r.id));
}

/** --- Quarterly rates --- */
export async function quarterlyRateList(tenantId: string, year: number): Promise<QuarterlyRate[]> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.quarterlyRates).getFullList({
    filter: `tenantId="${esc(tenantId)}" && year=${year}`,
  });
  return rows.map((x) => mapQuarterlyRate(asRecord(x)));
}

export async function quarterlyRateUpsert(
  body: Record<string, unknown> & { tenantId: string; year: number; itemKey: string }
): Promise<void> {
  const f = `tenantId="${esc(body.tenantId)}" && year=${body.year} && itemKey="${esc(body.itemKey)}"`;
  const existing = await firstByFilter(C.quarterlyRates, f);
  const pb = await getAdminPb();
  const { tenantId: _tid, year: _yr, itemKey: _ik, ...rest } = body;
  void _tid;
  void _yr;
  void _ik;
  if (existing?.id) {
    await pb.collection(C.quarterlyRates).update(String(existing.id), rest);
  } else {
    await pb.collection(C.quarterlyRates).create(body);
  }
}

/** --- Quarterly employee config --- */
export async function quarterlyEmployeeConfigListByTenantYear(
  tenantId: string,
  year: number,
  employeeIds: string[]
): Promise<QuarterlyEmployeeConfig[]> {
  if (employeeIds.length === 0) return [];
  const pb = await getAdminPb();
  const empFilter = employeeIds.map((id) => `employeeId="${esc(id)}"`).join(" || ");
  const rows = await pb.collection(C.quarterlyEmployeeConfigs).getFullList({
    filter: `year=${year} && (${empFilter})`,
  });
  return rows.map((x) => mapQuarterlyCfg(asRecord(x))).filter((c) => employeeIds.includes(c.employeeId));
}

export async function quarterlyEmployeeConfigUpsert(data: {
  employeeId: string;
  year: number;
  itemKey: string;
  paymentMonths: number[];
  amount: number;
}): Promise<void> {
  const months = [...new Set(data.paymentMonths.map((m) => Math.round(Number(m))))]
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b);
  if (months.length === 0) {
    throw new Error("quarterlyEmployeeConfigUpsert: paymentMonths 비어 있음");
  }
  const f = `employeeId="${esc(data.employeeId)}" && year=${data.year} && itemKey="${esc(data.itemKey)}"`;
  const existing = await firstByFilter(C.quarterlyEmployeeConfigs, f);
  const pb = await getAdminPb();
  const body = {
    paymentMonth: months[0],
    paymentMonths: months,
    amount: data.amount,
  };
  if (existing?.id) {
    await pb.collection(C.quarterlyEmployeeConfigs).update(String(existing.id), body);
  } else {
    await pb.collection(C.quarterlyEmployeeConfigs).create({
      employeeId: data.employeeId,
      year: data.year,
      itemKey: data.itemKey,
      ...body,
    });
  }
}

/** --- Monthly employee notes --- */
export async function monthlyNoteListByTenantYear(
  tenantId: string,
  year: number,
  employeeIds: string[]
): Promise<MonthlyEmployeeNote[]> {
  if (employeeIds.length === 0) return [];
  const pb = await getAdminPb();
  const empFilter = employeeIds.map((id) => `employeeId="${esc(id)}"`).join(" || ");
  const rows = await pb.collection(C.monthlyEmployeeNotes).getFullList({
    filter: `year=${year} && (${empFilter})`,
  });
  const set = new Set(employeeIds);
  return rows.map((x) => mapMonthlyNote(asRecord(x))).filter((n) => set.has(n.employeeId));
}

/** 한 직원·연도의 월별 노트 전부 (1~12월 중 기록된 달만 있을 수 있음) */
export async function monthlyNoteListByEmployeeYear(
  employeeId: string,
  year: number
): Promise<MonthlyEmployeeNote[]> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.monthlyEmployeeNotes).getFullList({
    filter: `employeeId="${esc(employeeId)}" && year=${year}`,
  });
  return rows.map((x) => mapMonthlyNote(asRecord(x)));
}

export async function monthlyNoteUpsert(data: {
  employeeId: string;
  year: number;
  month: number;
  optionalWelfareText: string | null;
  optionalExtraAmount: number | null;
  incentiveAccrualAmount: number | null;
  incentiveWelfarePaymentAmount: number | null;
}): Promise<void> {
  const f = `employeeId="${esc(data.employeeId)}" && year=${data.year} && month=${data.month}`;
  const existing = await firstByFilter(C.monthlyEmployeeNotes, f);
  const pb = await getAdminPb();
  if (existing?.id) {
    await pb.collection(C.monthlyEmployeeNotes).update(String(existing.id), {
      optionalWelfareText: data.optionalWelfareText,
      optionalExtraAmount: data.optionalExtraAmount,
      incentiveAccrualAmount: data.incentiveAccrualAmount,
      incentiveWelfarePaymentAmount: data.incentiveWelfarePaymentAmount,
    });
  } else {
    await pb.collection(C.monthlyEmployeeNotes).create(data);
  }
}

/** --- Audit --- */
export async function auditLogCreate(input: {
  userId?: string | null;
  tenantId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: unknown;
}): Promise<void> {
  const pb = await getAdminPb();
  await pb.collection(C.auditLogs).create({
    userId: input.userId ?? null,
    tenantId: input.tenantId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    payload: input.payload === undefined ? null : input.payload,
  });
}

export async function auditLogListRecent(limit: number): Promise<AuditLogRow[]> {
  try {
    const pb = await getAdminPb();
    const rows = await pb.collection(C.auditLogs).getList(1, limit, { sort: "-created" });
    const out: AuditLogRow[] = [];
    for (const x of rows.items) {
      const r = asRecord(x);
      const tid = r.tenantId == null || r.tenantId === "" ? null : String(r.tenantId);
      let tenant: { code: string; name: string } | null = null;
      if (tid) {
        const t = await tenantGetById(tid);
        if (t) tenant = { code: t.code, name: t.name };
      }
      const created = r.created != null ? new Date(String(r.created)) : new Date();
      out.push({
        id: String(r.id),
        tenantId: tid,
        userId: r.userId == null || r.userId === "" ? null : String(r.userId),
        action: String(r.action),
        entity: String(r.entity),
        entityId: r.entityId == null || r.entityId === "" ? null : String(r.entityId),
        payload: r.payload,
        createdAt: created,
        tenant,
      });
    }
    return out;
  } catch (e) {
    logPbClientError("auditLogListRecent", e);
    return [];
  }
}

/** --- GL sync jobs --- */
export async function glSyncJobCreate(data: { tenantId: string; status: string; payload: unknown }): Promise<{ id: string }> {
  const pb = await getAdminPb();
  const created = asRecord(await pb.collection(C.glSyncJobs).create(data));
  return { id: String(created.id) };
}

export async function glSyncJobListByTenant(tenantId: string, limit: number): Promise<GlSyncJobRow[]> {
  try {
    const pb = await getAdminPb();
    const rows = await pb.collection(C.glSyncJobs).getList(1, limit, {
      filter: `tenantId="${esc(tenantId)}"`,
      sort: "-created",
    });
    return rows.items.map((x) => {
      const r = asRecord(x);
      return {
        id: String(r.id),
        tenantId: String(r.tenantId),
        status: String(r.status),
        payload: r.payload,
        error: r.error == null ? null : String(r.error),
        createdAt: new Date(String(r.created)),
        updatedAt: new Date(String(r.updated)),
      };
    });
  } catch (e) {
    logPbClientError("glSyncJobListByTenant", e);
    return [];
  }
}

/** --- Vendors --- */
export async function vendorListByTenant(tenantId: string): Promise<Vendor[]> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.vendors).getFullList({
    filter: `tenantId="${esc(tenantId)}"`,
    sort: "code",
  });
  return rows.map((x) => mapVendorRow(asRecord(x)));
}

export async function vendorFindFirst(id: string, tenantId: string): Promise<Vendor | null> {
  const r = await firstByFilter(C.vendors, `id="${esc(id)}" && tenantId="${esc(tenantId)}"`);
  return r ? mapVendorRow(r) : null;
}

export async function vendorFindByTenantCode(tenantId: string, code: string): Promise<Vendor | null> {
  const r = await firstByFilter(C.vendors, `tenantId="${esc(tenantId)}" && code="${esc(code)}"`);
  return r ? mapVendorRow(r) : null;
}

export async function vendorCreate(body: {
  tenantId: string;
  code: string;
  name: string;
  businessType: VendorBusinessType;
  workplaceCapital: number;
  memo?: string | null;
}): Promise<Vendor> {
  const pb = await getAdminPb();
  const created = asRecord(
    await pb.collection(C.vendors).create({
      tenantId: body.tenantId,
      code: body.code,
      name: body.name,
      businessType: body.businessType,
      workplaceCapital: body.workplaceCapital,
      accumulatedReserve: 0,
      active: true,
      memo: body.memo ?? null,
    })
  );
  return mapVendorRow(created);
}

export async function vendorUpdate(
  id: string,
  body: Partial<Pick<Vendor, "name" | "businessType" | "workplaceCapital" | "active" | "memo">>
): Promise<void> {
  const pb = await getAdminPb();
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.businessType !== undefined) patch.businessType = body.businessType;
  if (body.workplaceCapital !== undefined) patch.workplaceCapital = body.workplaceCapital;
  if (body.active !== undefined) patch.active = body.active;
  if (body.memo !== undefined) patch.memo = body.memo;
  await pb.collection(C.vendors).update(id, patch);
}

export async function vendorContributionListByVendor(vendorId: string, limit: number): Promise<VendorContribution[]> {
  const pb = await getAdminPb();
  const rows = await pb.collection(C.vendorContributions).getList(1, limit, {
    filter: `vendorId="${esc(vendorId)}"`,
    sort: "-created",
  });
  return rows.items.map((x) => mapVendorContributionRow(asRecord(x)));
}

export async function vendorAppendContribution(input: {
  tenantId: string;
  vendorId: string;
  contributionAmount: number;
  note?: string | null;
  occurredAt?: string | null;
}): Promise<{ contribution: VendorContribution; vendor: Vendor }> {
  const pb = await getAdminPb();
  const vRow = await firstByFilter(C.vendors, `id="${esc(input.vendorId)}" && tenantId="${esc(input.tenantId)}"`);
  if (!vRow?.id) {
    throw new Error("거래처를 찾을 수 없습니다.");
  }
  const vendor = mapVendorRow(vRow);
  const tenant = await tenantGetById(input.tenantId);
  const businessType: VendorBusinessType =
    tenant == null ? vendor.businessType : tenant.clientEntityType === "CORPORATE" ? "CORPORATE" : "INDIVIDUAL";
  const workplaceCapitalForCap =
    businessType === "CORPORATE"
      ? tenant?.headOfficeCapital != null && Number.isFinite(tenant.headOfficeCapital)
        ? Math.max(0, tenant.headOfficeCapital)
        : Math.max(0, vendor.workplaceCapital)
      : 0;

  const { computeAdditionalReserve } = await import("@/lib/domain/vendor-reserve");
  const calc = computeAdditionalReserve({
    businessType,
    contributionAmount: input.contributionAmount,
    workplaceCapital: workplaceCapitalForCap,
    accumulatedReserve: vendor.accumulatedReserve,
  });

  const reserveAfter = calc.newAccumulatedReserve;
  const created = asRecord(
    await pb.collection(C.vendorContributions).create({
      tenantId: input.tenantId,
      vendorId: input.vendorId,
      contributionAmount: input.contributionAmount,
      additionalReserved: calc.effectiveAdditional,
      reserveAfter,
      note: input.note ?? null,
      occurredAt: input.occurredAt ?? null,
    })
  );

  await pb.collection(C.vendors).update(input.vendorId, { accumulatedReserve: reserveAfter });

  return {
    contribution: mapVendorContributionRow(created),
    vendor: { ...vendor, accumulatedReserve: reserveAfter },
  };
}
