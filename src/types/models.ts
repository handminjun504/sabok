/** PocketBase `sabok_*` 컬렉션과 정합되는 앱 도메인 타입 (숫자 필드는 number). */

import type { VendorBusinessType } from "@/lib/domain/vendor-reserve";
import type {
  AnnouncementMode,
  TenantClientEntityType,
  TenantOperationMode,
} from "@/lib/domain/tenant-profile";

/** 급여포함신고·스케줄에서 상한 대비 초과/미달 표시 방식 — PB `salaryInclusionVarianceMode` */
export type SalaryInclusionVarianceMode = "BOTH" | "OVER_ONLY" | "UNDER_ONLY";

export type Employee = {
  id: string;
  tenantId: string;
  employeeCode: string;
  name: string;
  position: string;
  baseSalary: number;
  adjustedSalary: number;
  welfareAllocation: number;
  /**
   * 전기(이전 회계 기간) 사복으로 “더 받은” 금액(원).
   * 이번 기 사복지급분 상한에서 자동 차감되어 급여포함신고·실효 상한 계산에 즉시 반영된다.
   * PB `priorOverpaidWelfareWon` 없으면 null(차감 없음).
   */
  priorOverpaidWelfareWon: number | null;
  incentiveAmount: number | null;
  discretionaryAmount: number | null;
  optionalWelfareAmount: number | null;
  monthlyPayAmount: number | null;
  quarterlyPayAmount: number | null;
  birthMonth: number | null;
  hireMonth: number | null;
  resignMonth: number | null;
  /** 퇴사 연도(선택). 활성 연도가 resignYear 이후면 그 해는 비활성. resignYear 와 같은 해에는 resignMonth 이후 월만 비활성. */
  resignYear: number | null;
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
  /**
   * 사내근로복지기금 미대상 표시 — true 면 사복 계산·운영 보고·안내문에서 행 자체가 빠진다.
   * 단 직원 명부와 ‘월별 발생 인센’ 그리드에는 그대로 보이며 인센 기록(`incentiveAccrualAmount`) 만 가능.
   * PB `flagWelfareIneligible` 컬럼이 없으면 `false` 로 매핑.
   */
  flagWelfareIneligible: boolean;
  /**
   * 퇴사월에 사복(사내근로복지기금) 지급을 그대로 진행할지.
   * - `true`  → 퇴사월 까지 활성(=그 달 정기·분기 사복 표시).
   * - `false` → 퇴사월 직전 달까지 활성(=퇴사월 자체가 비활성, 사복 0 원).
   * 기본 `false` — 사용자 의도에 따라 “체크해야 그 달 표시” 가 안전한 기본.
   * `resignMonth` / `resignYear` 가 비어 있으면 의미 없음(전체 연도 활성). PB 컬럼 누락 시 false 로 매핑.
   */
  flagPayWelfareOnResignMonth: boolean;
  /** 급여포함신고·스케줄 상한 초과/미달 열 표시. null 이면 전사 `CompanySettings.salaryInclusionVarianceMode` */
  salaryInclusionVarianceMode: SalaryInclusionVarianceMode | null;
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
  /** 0 = 전체 공통(fallback), 1~5 = 레벨별 요율 */
  level: number;
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
  /**
   * 연중 재분배(중도 변경) 시 해당 월 **사복 지급 총액**을 이 값으로 강제.
   * null 이면 정기·분기 규칙으로 계산된 합계를 그대로 사용.
   * 이미 지급된 월은 기존 규칙 스냅샷을, 변경 이후 월은 새 규칙 결과를 보관한다.
   */
  welfareOverrideAmount: number | null;
  /**
   * 연중 재분배 시 해당 월 **조정급여 월액** 오버라이드.
   * null 이면 연봉을 `floor(연봉/12)`·마지막 활성 월 잔차로 분할한 월액을 사용.
   * 사복 감소분을 잔여 월 조정급여에 분배해 baseSalary 불변을 유지하는 데 사용.
   */
  adjustedSalaryOverrideAmount: number | null;
  /**
   * 그 달 한해 이 직원의 레벨을 다른 값으로 간주.
   * null 이면 `Employee.level` 사용. 레벨 낮추기 중도 변경 시 이전 월을 스냅샷한다.
   */
  levelOverride: number | null;
  /**
   * 해당 월 이 직원에 한해 **이벤트별** 금액을 개별 override.
   *
   * - Key: `eventKey` (NEW_YEAR_FEB, FAMILY_MAY, quarterly itemKey, custom eventKey 등)
   * - Value: 원 단위 정수. 0 도 "0원으로 확정" 이므로 유효.
   * - 우선순위: `eventAmountOverrides[eventKey]` > Level5Override > LevelPaymentRule.
   * - 월 총액 `welfareOverrideAmount` 와 병행 가능 — 그 경우 `welfareOverrideAmount` 가 최종 총액을 덮어쓴다.
   * - null / 빈 객체 이면 override 없음 → 기존 규칙 그대로 해석.
   */
  eventAmountOverrides: Readonly<Record<string, number>> | null;
};

/**
 * 업체(테넌트) 단위 “해당 월 지급이 모두 끝났는가” 확인 플래그.
 * 직원별이 아니라 **연·월** 단위 — 한 번의 체크로 그 달 전체를 ‘지급완료’로 표시한다.
 * 금액 계산에는 영향 없으며, 월별 스케줄 표의 시각적 진행도와 ‘완료된 달 회수 보기’ 같은 후속 기능 토대.
 */
export type MonthlyPaymentStatus = {
  id: string;
  tenantId: string;
  year: number;
  month: number;
  paidConfirmed: boolean;
};

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
  /** 급여포함신고·스케줄의 상한 대비 초과/미달 열 표시. PB 필드 없으면 BOTH */
  salaryInclusionVarianceMode: SalaryInclusionVarianceMode;
  /** 조사표·직원 목록·CSV·직원 폼에 대표반환 표시. PB 필드 없으면 false */
  surveyShowRepReturn: boolean;
  /**
   * 대표반환 월별 금액 일정. 키: 직원 ID → 값: { "월(1~12 문자열 키)": 원 금액 }.
   * 없는 월은 0원으로 처리. `surveyShowRepReturn`이 true 일 때만 의미가 있음.
   */
  repReturnSchedule: Record<string, Partial<Record<string, number>>> | null;
  surveyShowSpouseReceipt: boolean;
  surveyShowWorkerNet: boolean;
  /** PB JSON. 없으면 null */
  paymentEventDefs: PaymentEventDefsByYear | null;
  /** 추가 적립(출연) 진행 메모 — PB `reserveProgressNote` 없으면 null */
  reserveProgressNote: string | null;
  /**
   * 내장 정기 지급 4종(NEW_YEAR_FEB / FAMILY_MAY / CHUSEOK_AUG / YEAR_END_NOV)의
   * 귀속(=지급) 월 업체별 오버라이드. 없으면 코드 기본값(2/5/8/11) 사용.
   * 키는 PaymentEventKey 의 4개 중 하나, 값은 1~12.
   */
  fixedEventMonths: Partial<Record<string, number>> | null;
  /**
   * 분기 지원 항목별 지급 월 설정. 키는 QuarterlyItemKey, 값은 1~12 의 정수 배열.
   * 없으면 코드 기본값 [3,6,9,12] 사용.
   */
  quarterlyPayMonths: Partial<Record<string, number[]>> | null;
  /**
   * 운영상황 보고 — 협력업체 복리후생 사용 여부(㊱~◯54 적용 판정).
   * true/false 로 명시되지 않으면 null(미확정) → 기본 "없음"으로 처리.
   * PB `vendorWelfareApplied` 필드. 없으면 null.
   */
  vendorWelfareApplied: boolean | null;
  /**
   * 운영상황 보고 — 협력업체 복리후생 사용 비율(80/90/20/25/30 중 하나).
   * `vendorWelfareApplied === true` 일 때만 의미가 있으며, ㉚/㉜ 자동 비율 판정·사용현황 매트릭스의 기본 사용액 계산에 사용.
   * PB `vendorWelfareRatio` 필드. 없으면 null.
   */
  vendorWelfareRatio: 80 | 90 | 20 | 25 | 30 | null;
  /**
   * 월별 발생 인센 자동 변환 비율(세후 비율, %). 1~100 정수.
   * - 사용자가 셀에 적은 "세전" 금액에 자동으로 곱해 "세후" 금액으로 저장한다.
   *   예: 80 → 1,000,000 입력 시 800,000 저장.
   * - 100 또는 null 이면 변환 비활성(입력값 그대로 저장).
   * - 0 / 음수 / 범위 초과는 매퍼에서 null 로 정리.
   * PB `incentiveNetRatioPercent` 필드. 없으면 null.
   */
  incentiveNetRatioPercent: number | null;
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
  /**
   * PB `accumulatedReserveTotalWon` (원) — 운영자가 직접 입력하는 「누적 추가 적립금」.
   * 거래처(출연처) 기능이 비활성화된 환경에서 자본금 50% 한도 진행도 산정에 사용한다.
   * 거래처가 등록되어 있으면 거래처 합산이 우선이고 이 값은 폴백.
   */
  accumulatedReserveTotalWon: number | null;
  /** 안내 멘트 기본 모드 — PB `announcementMode` 없으면 "SINGLE" */
  announcementMode: AnnouncementMode;
  /** 묶음 안내 기본 시작 월(1~12) — 없으면 null (UI 기본 1) */
  announcementBatchFromMonth: number | null;
  /** 묶음 안내 기본 끝 월(1~12) — 없으면 null (UI 기본 3) */
  announcementBatchToMonth: number | null;
  /** 운영상황 보고 ⑦ 대표자(수동 지정). 비어있으면 position==="대표이사" 직원으로 자동 유추 */
  ceoName: string | null;
  /** 운영상황 보고 ⑧ 업종 — 통계청 한국표준산업분류 대분류 코드 (A~U) */
  industry: string | null;
  /** 운영상황 보고 ④ 전화번호 */
  phone: string | null;
  /** 운영상황 보고 ⑤ 소재지 */
  addressLine: string | null;
  /** 운영상황 보고 ③ 설립등기일 — "YYYY-MM-DD" */
  incorporationDate: string | null;
  /** 운영상황 보고 ⑥ 회계연도 시작 월(1~12). 비어있으면 1로 간주 */
  accountingYearStartMonth: number | null;
};

/**
 * 운영상황 보고서 양식 ⑫~⑳. 저장 단위는 `(tenantId, year)` 단 한 건.
 * 각 override 필드는 null일 때 자동 유추값을 사용하도록 컴포넌트·도메인이 구성된다.
 */
export type BaseAssetAnnual = {
  id: string;
  tenantId: string;
  year: number;
  /** ⑫ 직전 회계연도 말 기본재산 총액 — null 이면 전년도 레코드에서 자동 링크 */
  prevYearEndTotal: number | null;
  /** ⑬ 사업주 출연 — null 이면 vendor_contributions에서 자동 집계 */
  employerContributionOverride: number | null;
  /** ⑭ 수익금·이월금 전입 — 수동 */
  investReturnAndCarryover: number | null;
  /** ⑮ 사업주 외의 자 출연 — null 이면 vendor_contributions 나머지 자동 */
  nonEmployerContributionOverride: number | null;
  /** ⑯ 기금법인 합병 */
  mergerIn: number | null;
  /** ⑱ 기금법인 분할 등 */
  splitOut: number | null;
  /** ⑳ 해당 회계연도 말 기본재산 총액 — null 이면 ⑫ + ⑲ 자동 */
  currentYearEndTotalOverride: number | null;
};

/** 운영상황 보고서 양식 ㉑~㉗ (운용방법) */
export type FundOperationAnnual = {
  id: string;
  tenantId: string;
  year: number;
  /** ㉑ 금융회사 예입·예탁 */
  deposit: number | null;
  /** ㉒ 투자신탁 수익증권 매입 */
  trust: number | null;
  /** ㉓ 유가증권 매입 */
  security: number | null;
  /** ㉔ 보유 자사주 유상증자 참여 */
  ownStock: number | null;
  /** ㉕ (부동산)투자회사 주식 매입 */
  reit: number | null;
  /** ㉖ 기타 */
  etc: number | null;
  /** ㉗ 근로자 대부(누계) */
  loan: number | null;
};

/** 운영상황 보고서 양식 ㉙~㉟ (기금사업 재원) */
export type FundSourceAnnual = {
  id: string;
  tenantId: string;
  year: number;
  /** ㉙ 해당 회계연도 기금운용 수익금 */
  operationIncome: number | null;
  /** ㉚ 비율: 50 | 80 | 90 */
  contribUsageRatio: 50 | 80 | 90 | null;
  /** ㉚ 실제 결의금액 — null 이면 (⑬+⑮) × ratio 자동 */
  contribUsageAmount: number | null;
  /** ㉛ 기본재산 × 자본금 100분의 50 초과액 — null 이면 자동 */
  excessCapitalUsage: number | null;
  /** ㉜ 비율: 20 | 25 | 30 */
  prevBaseAssetUsageRatio: 20 | 25 | 30 | null;
  /** ㉜ 결의금액 — null 이면 ⑫ × ratio 자동 */
  prevBaseAssetUsageAmount: number | null;
  /** ㉝ 공동근로복지기금 지원액 및 그 50% */
  jointFundSupport: number | null;
  /** ㉞ 이월금 — null 이면 전년도 ◯69 자동 */
  carryover: number | null;
};

/** 운영상황 보고서 양식 ㊱~◯56 (사용현황 매트릭스) */
export type ContribUsageAnnual = {
  id: string;
  tenantId: string;
  year: number;
  /** ㊲ 100분의 80 범위 복지혜택을 받은 협력업체근로자 수 */
  u80RecipientCount: number | null;
  /** ㊳ 100분의 80 범위 협력업체근로자 복리후생 증진 사용액 */
  u80VendorWelfareAmount: number | null;
  /** ㊵ 100분의 90 범위 수혜자 수 */
  u90RecipientCount: number | null;
  /** ㊶ 100분의 90 범위 협력업체근로자 복리후생 증진 사용액 */
  u90VendorWelfareAmount: number | null;
  /** ㊷ 20% 범위 사용한 기본재산 총액 */
  u20BaseAssetUsed: number | null;
  /** ㊸ 20% 범위 협력업체근로자 복리후생 증진 사용액 */
  u20VendorWelfareAmount: number | null;
  /** ㊹ 20% 범위 복지혜택을 받은 협력업체근로자 수 */
  u20RecipientCount: number | null;
  /** ㊼ 25% */
  u25BaseAssetUsed: number | null;
  u25VendorWelfareAmount: number | null;
  u25RecipientCount: number | null;
  /** ◯52~◯54 30% */
  u30BaseAssetUsed: number | null;
  u30VendorWelfareAmount: number | null;
  u30RecipientCount: number | null;
};

/**
 * 사업실적(◯57~◯72) 중 저장이 필요한 override·수혜자 수·운영비만 모은 구조.
 * 금액의 기본값은 `allocateYearlyWelfareToLegalCategories` 로 자동 채움.
 */
export type BizResultItem = {
  /** 목적사업 금액 override — null 이면 자동 배분값 사용 */
  purposeAmountOverride: number | null;
  /** 목적사업 수혜자 수 */
  purposeCount: number | null;
  /** 대부사업 금액 */
  loanAmount: number | null;
  /** 대부사업 수혜자 수 */
  loanCount: number | null;
};

export type BizResultAnnual = {
  id: string;
  tenantId: string;
  year: number;
  /** 복지사업비 57~66 구분별 저장 맵 */
  bizItems: Record<string, BizResultItem>;
  /** ◯68 기금 운영비 */
  operationCost: number | null;
  /** ◯71 선택적 복지비 금액 override — null 이면 자동(법정코드 71) */
  optionalAmountOverride: number | null;
  /** ◯72 선택적 복지비 수혜자 수 override — null 이면 월별 노트 자동 추정 */
  optionalRecipientsOverride: number | null;
};

export type RealEstateHolding = {
  id: string;
  tenantId: string;
  year: number;
  seq: number;
  name: string | null;
  amount: number | null;
  /** YYYY-MM-DD */
  acquiredAt: string | null;
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

/**
 * 업로드된 분개장에서 추출한 한 건의 전표.
 * - `date`: `YYYY-MM-DD` 또는 부분 형식(월/일만 있으면 파서가 연도 보정)
 * - `account`: 원문 계정과목 그대로(공백 정리는 파서 책임)
 * - `side`: 차변/대변
 * - `amount`: 원 단위 정수 (천원 변환은 집계 단계에서)
 * - `party`: 거래처명(직원/외부 구분 판정 입력)
 * - `memo`: 부가 메모(없으면 null)
 * - `sourceLine`: 원 파일의 원본 라인 번호/식별자(디버깅용, 없으면 null)
 */
export type JournalEntry = {
  date: string | null;
  entryNo: string | null;
  account: string;
  side: "DEBIT" | "CREDIT";
  amount: number;
  party: string | null;
  memo: string | null;
  sourceLine: number | null;
};

/**
 * 계정명 → 양식 칸(법정코드) 매핑 결과.
 * - `code`: 57~66, 68 중 하나 또는 "contribution"(⑬), "interestIncome"(㉙), null(미매핑).
 * - `confident`: 키워드 매핑에서 결정됐으면 true, 규칙이 모호해 사용자 확인이 필요하면 false.
 * - `reason`: 매핑 근거(키워드 또는 "미매핑").
 */
export type JournalMappingTarget =
  | { kind: "BIZ"; code: 57 | 58 | 59 | 60 | 61 | 62 | 63 | 64 | 65 | 66 }
  | { kind: "OPERATION_COST" } // ◯68
  | { kind: "EMPLOYER_CONTRIBUTION" } // ⑬
  | { kind: "INTEREST_INCOME" } // ㉙
  | { kind: "CASH_FLOW" } // 보통예금 등, 집계 제외
  | { kind: "UNMAPPED" };

export type JournalMappingLogItem = {
  account: string;
  target: JournalMappingTarget;
  amount: number;
  confident: boolean;
  reason: string;
};

/**
 * 분개장을 스펙 양식에 맞게 집계한 결과(원 단위).
 * `computeOperatingReportView` 에 `journalAggregate` 로 주입되면 자동 기본값을 덮는다.
 */
export type JournalAggregate = {
  /** 입력 파일 정보(디버깅·UI 표시용) */
  source: {
    files: Array<{ name: string; kind: "JOURNAL_PDF" | "JOURNAL_XLSX" | "TRIAL_BALANCE_PDF" | "BALANCE_XLSX" | "UNKNOWN"; entryCount: number }>;
    totalDebit: number;
    totalCredit: number;
    balanceOk: boolean;
  };
  /** ⑬ 사업주 출연(고유목적사업준비금전입수입 등) */
  employerContribution: number;
  /** ㉙ 기금운용 수익금(이자수익 등) */
  interestIncome: number;
  /** ◯68 기금 운영비(수수료·세금과공과·통신비 등) */
  operationCost: number;
  /** 양식 코드별(57~66) 목적사업 금액 합 */
  purposeByCode: Record<number, number>;
  /** 양식 코드별(57~66) 수혜자 수(외부 거래처 제외, 직원 unique) */
  recipientsByCode: Record<number, number>;
  /** 매핑 로그 (원계정명별 집계) */
  mappingLog: JournalMappingLogItem[];
  /** 집계 경고(미매핑·외부거래처 혼입·차대 불일치 등) */
  warnings: string[];
  /** 수혜자 집계에 포함된 직원 이름 목록(디버깅·UI) */
  uniqueRecipientNames: string[];
  /** 전체 목적사업 합(57~66) */
  totalPurpose: number;
  /** 분개장 커버 기간(YYYY-MM-DD) */
  periodFrom: string | null;
  periodTo: string | null;
};

/**
 * 스펙 문서의 JSON 출력 포맷(별지 제15호서식 운영상황 보고 JSON).
 * 단위는 "천원"(입력단 원 단위 → toThousand 반올림).
 */
export type SpecOperatingReportJson = {
  기금법인: {
    "①기금법인명": string;
    "②인가번호": string;
    "⑨소속근로자수": number;
    "⑩협력업체근로자수": number | null;
    "⑪납입자본금": number;
  };
  기본재산현황: {
    "⑫직전기본재산": number;
    "⑬사업주출연": number;
    "⑭수익금이월금전입": number;
    "⑮사업주외의자출연": number;
    "⑯기금법인합병": number;
    "⑰기본재산사용": number;
    "⑱기금법인분할등": number;
    "⑲소계": number;
    "⑳해당회계연도기본재산": number;
  };
  기금운용관리: {
    "㉑금융회사예입예탁": number;
    "㉒투자신탁수익증권": number;
    "㉓유가증권매입": number;
    "㉔자사주유상증자": number;
    "㉕부동산투자회사주식": number;
    "㉖기타": number;
    "㉗근로자대부": number;
    "㉘합계": number;
  };
  기금사업재원: {
    "㉙기금운용수익금": number;
    "㉚출연금범위": number;
    "㉚적용비율": "50%" | "80%" | "90%";
    "㉛자본금50초과액": number;
    "㉜직전기본재산범위": number;
    "㉜적용비율": "20%" | "25%" | "30%" | null;
    "㉝공동근로복지기금": number;
    "㉞이월금등": number;
    "㉟합계": number;
  };
  협력업체사용현황: {
    적용여부: boolean;
    출연금80범위: { "㊱출연금": number | null; "㊲복지혜택협력업체수": number | null; "㊳복리후생사용금액": number | null } | null;
    출연금90범위: { "㊴출연금": number | null; "㊵복지혜택협력업체수": number | null; "㊶복리후생사용금액": number | null } | null;
    기본재산20범위: object | null;
    기본재산25범위: object | null;
    기본재산30범위: object | null;
  };
  사업실적: {
    "◯57주택구입임차자금": { 금액: number; 수혜자수: number };
    "◯58우리사주": { 금액: number; 수혜자수: number };
    "◯59생활안정자금": { 금액: number; 수혜자수: number };
    "◯60장학금": { 금액: number; 수혜자수: number };
    "◯61재난구호금": { 금액: number; 수혜자수: number };
    "◯62체육문화활동": { 금액: number; 수혜자수: number };
    "◯63모성보호": { 금액: number; 수혜자수: number };
    "◯64근로자의날": { 금액: number; 수혜자수: number };
    "◯65근로복지시설": { 금액: number; 수혜자수: number };
    "◯66그밖의복지비": { 금액: number; 수혜자수: number };
    "◯67소계": { 금액: number; 수혜자수: number };
    "◯68기금운영비": number;
    "◯69잔액": number;
    "◯70합계": number;
  };
  선택적복지비: { "◯71금액": number; "◯72수혜자수": number };
  부동산현황: Array<{ 번호: number; 명칭: string; 금액: number; 취득일: string | null }>;
  정합성검증: {
    결과: "PASS" | "FAIL";
    검증항목: Array<{ 항목: string; 기대값: number; 실제값: number; 결과: "OK" | "NG" }>;
  };
  매핑로그: Array<{ 원계정명: string; 매핑항목: string; 금액: number }>;
  경고및확인필요사항: string[];
};
