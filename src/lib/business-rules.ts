/**
 * 사내근로복지기금 운영 규칙 상수 (Phase 0). 사업장·기금: fund-site-model, 안내 문구: welfare-payment-principles.
 */

export const RBAC_MATRIX = {
  /** 후임: 직원 입력·조회, 스케줄 조회 */
  JUNIOR: {
    routes: ["/직원", "/월별스케줄", "/분기지원", "/"],
    canEditEmployees: true,
    canEditLevelRules: false,
    canEditCompanySettings: false,
    canManageUsers: false,
    canExport: true,
    canTriggerGlSync: false,
  },
  /** 선임: 레벨·전사 설정·분기 템플릿·목표액 */
  SENIOR: {
    routes: ["*"],
    canEditEmployees: true,
    canEditLevelRules: true,
    canEditCompanySettings: true,
    canManageUsers: false,
    canExport: true,
    canTriggerGlSync: true,
  },
  /** 관리자: 사용자·감사·GL 등 전부 */
  ADMIN: {
    routes: ["*"],
    canEditEmployees: true,
    canEditLevelRules: true,
    canEditCompanySettings: true,
    canManageUsers: true,
    canExport: true,
    canTriggerGlSync: true,
  },
} as const;

export type RoleKey = keyof typeof RBAC_MATRIX;

/** 플래그 4종 동시 선택 시 표시 우선순위(요약·보고서 정렬용). 상호 배타가 아닐 수 있음. */
export const FLAG_DISPLAY_ORDER = [
  "알아서금액",
  "대표반환",
  "배우자수령",
  "근로자실질수령",
] as const;

/** 목표액: 레벨별 연간 합계와 월 스케줄 집계를 대조 */
export const TARGET_AMOUNT_GRANULARITY = "연간+월별분해" as const;

/** 정기 지급 이벤트 키 — 레벨별 금액 매트릭스 행 */
export const PAYMENT_EVENT = {
  NEW_YEAR_FEB: "NEW_YEAR_FEB",
  FAMILY_MAY: "FAMILY_MAY",
  CHUSEOK_AUG: "CHUSEOK_AUG",
  YEAR_END_NOV: "YEAR_END_NOV",
  HIRE_MONTH: "HIRE_MONTH",
  FOUNDING_MONTH: "FOUNDING_MONTH",
  BIRTH_MONTH: "BIRTH_MONTH",
  WEDDING_MONTH: "WEDDING_MONTH",
} as const;

export type PaymentEventKey = (typeof PAYMENT_EVENT)[keyof typeof PAYMENT_EVENT];

export const PAYMENT_EVENT_LABELS: Record<PaymentEventKey, string> = {
  NEW_YEAR_FEB: "2월 연초·신년",
  FAMILY_MAY: "5월 근로자의 날·가정의 달",
  CHUSEOK_AUG: "8월 추석",
  YEAR_END_NOV: "11월 연말",
  HIRE_MONTH: "입사축하(입사월)",
  FOUNDING_MONTH: "창립기념 월",
  BIRTH_MONTH: "생일 월",
  WEDDING_MONTH: "결혼기념 월",
};

/** 고정 월 이벤트 → 귀속 월 */
export const FIXED_EVENT_MONTH: Partial<Record<PaymentEventKey, number>> = {
  NEW_YEAR_FEB: 2,
  FAMILY_MAY: 5,
  CHUSEOK_AUG: 8,
  YEAR_END_NOV: 11,
};

export const QUARTERLY_ITEM = {
  INFANT_SCHOLARSHIP: "INFANT_SCHOLARSHIP",
  PRESCHOOL_SCHOLARSHIP: "PRESCHOOL_SCHOLARSHIP",
  TEEN_SCHOLARSHIP: "TEEN_SCHOLARSHIP",
  PARENT_SUPPORT: "PARENT_SUPPORT",
  HEALTH_INSURANCE: "HEALTH_INSURANCE",
  HOUSING_INTEREST: "HOUSING_INTEREST",
} as const;

export type QuarterlyItemKey = (typeof QUARTERLY_ITEM)[keyof typeof QUARTERLY_ITEM];

export const QUARTERLY_ITEM_LABELS: Record<QuarterlyItemKey, string> = {
  INFANT_SCHOLARSHIP: "영유아 자녀 장학금",
  PRESCHOOL_SCHOLARSHIP: "미취학 자녀 장학금",
  TEEN_SCHOLARSHIP: "청소년 자녀 장학금",
  PARENT_SUPPORT: "부모 봉양 지원금",
  HEALTH_INSURANCE: "건강보험 지원금",
  HOUSING_INTEREST: "주택이자 지원금",
};

/** 분기 주기(개월). 지급 월은 직원/항목별로 선택 가능 */
export const QUARTERLY_INTERVAL_MONTHS = 3;
