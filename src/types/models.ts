/** PocketBase `sabok_*` 컬렉션과 정합되는 앱 도메인 타입 (숫자 필드는 number). */

import type { VendorBusinessType } from "@/lib/domain/vendor-reserve";
import type { TenantClientEntityType, TenantOperationMode } from "@/lib/domain/tenant-profile";

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
  resignMonth: number | null;
  weddingMonth: number | null;
  childrenInfant: number;
  childrenPreschool: number;
  childrenTeen: number;
  parentsCount: number;
  parentsInLawCount: number;
  insurancePremium: number;
  loanInterest: number;
  /** 월세 등 월 단위 주거 비용(발생액). 분기 템플릿 월세 항목·한도와 min */
  monthlyRentAmount: number | null;
  payDay: number | null;
  level: number;
  /** 연간 지급 예정액(원, 선택) — 스케줄 화면에서 레벨 추천·정렬용. PB `expectedYearlyWelfare` */
  expectedYearlyWelfare: number | null;
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
  /** 지급이 반영되는 달(1~12), 정렬·중복 제거됨 */
  paymentMonths: number[];
  amount: number;
};

export type MonthlyEmployeeNote = {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  optionalWelfareText: string | null;
  optionalExtraAmount: number | null;
  /** 해당 월 발생(귀속) 인센 금액 — 인센을 사복으로 지급하는 경우 급여 포함 차액 계산에 사용 */
  incentiveAccrualAmount: number | null;
  /** 그 달 사복으로 지급하기로 한 인센 금액(인센→사복 환류) */
  incentiveWelfarePaymentAmount: number | null;
};

/** 급여포함신고·스케줄에서 상한 대비 초과/미달 표시 방식 — PB `salaryInclusionVarianceMode` */
export type SalaryInclusionVarianceMode = "BOTH" | "OVER_ONLY" | "UNDER_ONLY";

/** 연도 문자열 키(예: "2026") → 추가 정기 지급 행사(귀속 월 지정) */
export type CustomPaymentEventDef = {
  eventKey: string;
  label: string;
  accrualMonth: number;
};

export type PaymentEventDefsByYear = Record<string, CustomPaymentEventDef[]>;

export type CompanySettings = {
  id: string;
  tenantId: string;
  foundingMonth: number;
  defaultPayDay: number;
  activeYear: number;
  accrualCurrentMonthPayNext: boolean;
  /** 급여포함신고·스케줄의 상한 대비 초과/미달 열 표시. PB 필드 없으면 BOTH */
  salaryInclusionVarianceMode: SalaryInclusionVarianceMode;
  /** 조사표·직원 목록·CSV·직원 폼에 대표반환 표시. PB 필드 없으면 false */
  surveyShowRepReturn: boolean;
  surveyShowSpouseReceipt: boolean;
  surveyShowWorkerNet: boolean;
  /** PB JSON. 없으면 null */
  paymentEventDefs: PaymentEventDefsByYear | null;
};

export type Tenant = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  memo?: string | null;
  /** 개인·법인 적립 구분(SABOK 거래처 최초 등록 시) — PB `clientEntityType` */
  clientEntityType: TenantClientEntityType;
  /** 사내근로복지기금 운용 방식 — PB `operationMode` (급여낮추기·인센티브 지급 등) */
  operationMode: TenantOperationMode;
  /** PB `approvalNumber` — 없으면 null */
  approvalNumber: string | null;
  /** PB `businessRegNo` — 없으면 null */
  businessRegNo: string | null;
  /** PB `headOfficeCapital` (원) — 없으면 null */
  headOfficeCapital: number | null;
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
