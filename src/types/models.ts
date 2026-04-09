/** PocketBase `sabok_*` 컬렉션과 정합되는 앱 도메인 타입 (숫자 필드는 number). */

import type { VendorBusinessType } from "@/lib/domain/vendor-reserve";

export type Employee = {
  id: string;
  tenantId: string;
  employeeCode: string;
  name: string;
  position: string;
  baseSalary: number;
  adjustedSalary: number;
  welfareAllocation: number;
  incentiveAmount: number | null;
  discretionaryAmount: number | null;
  optionalWelfareAmount: number | null;
  monthlyPayAmount: number | null;
  quarterlyPayAmount: number | null;
  birthMonth: number | null;
  hireMonth: number | null;
  weddingMonth: number | null;
  childrenInfant: number;
  childrenPreschool: number;
  childrenTeen: number;
  parentsCount: number;
  parentsInLawCount: number;
  insurancePremium: number;
  loanInterest: number;
  payDay: number | null;
  level: number;
  flagAutoAmount: boolean;
  flagRepReturn: boolean;
  flagSpouseReceipt: boolean;
  flagWorkerNet: boolean;
};

export type LevelPaymentRule = {
  id: string;
  tenantId: string;
  year: number;
  level: number;
  eventKey: string;
  amount: number;
};

export type Level5Override = {
  id: string;
  employeeId: string;
  year: number;
  eventKey: string;
  amount: number;
};

export type LevelTarget = {
  id: string;
  tenantId: string;
  year: number;
  level: number;
  targetAmount: number;
};

export type QuarterlyRate = {
  id: string;
  tenantId: string;
  year: number;
  itemKey: string;
  amountPerInfant: number | null;
  amountPerPreschool: number | null;
  amountPerTeen: number | null;
  amountPerParent: number | null;
  amountPerInLaw: number | null;
  flatAmount: number | null;
  percentInsurance: number | null;
  percentLoanInterest: number | null;
};

export type QuarterlyEmployeeConfig = {
  id: string;
  employeeId: string;
  year: number;
  itemKey: string;
  paymentMonth: number;
  amount: number;
};

export type MonthlyEmployeeNote = {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  optionalWelfareText: string | null;
  optionalExtraAmount: number | null;
};

export type CompanySettings = {
  id: string;
  tenantId: string;
  foundingMonth: number;
  defaultPayDay: number;
  activeYear: number;
  accrualCurrentMonthPayNext: boolean;
};

export type Tenant = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  memo?: string | null;
};

export type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  isPlatformAdmin: boolean;
  /** PB에 필드가 없으면 false */
  accessAllTenants: boolean;
};

export type UserTenantLink = {
  id: string;
  userId: string;
  tenantId: string;
  role: string;
  tenant: Tenant;
};

export type UserWithTenants = UserRow & {
  userTenants: UserTenantLink[];
};

export type AuditLogRow = {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: unknown;
  createdAt: Date;
  tenant: { code: string; name: string } | null;
};

export type GlSyncJobRow = {
  id: string;
  tenantId: string;
  status: string;
  payload: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Vendor = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  businessType: VendorBusinessType;
  workplaceCapital: number;
  accumulatedReserve: number;
  active: boolean;
  memo: string | null;
};

export type VendorContribution = {
  id: string;
  tenantId: string;
  vendorId: string;
  contributionAmount: number;
  additionalReserved: number;
  reserveAfter: number;
  note: string | null;
  occurredAt: string | null;
  created: Date;
};
