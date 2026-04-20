/**
 * 급여포함신고 — 사복지급분/예상 인센 상한 vs 실적, COMBINED 모드 듀얼 블록 등.
 *
 * `schedule.ts` 의 “월별 분해·연간 합” 코어 로직과 분리해, 두 영역이 서로 다른 이유로 변경되어도
 * 영향이 격리되도록 한다. (참고: 둘은 입출력이 단방향 — 코어가 만든 실적 값을 여기서 상한과 비교한다.)
 */
import type { Employee, MonthlyEmployeeNote } from "@/types/models";
import type { TenantOperationMode } from "./tenant-profile";

function toNum(v: number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

/**
 * 실효 사복지급분(원).
 *  = max(0, welfareAllocation − priorOverpaidWelfareWon)
 *
 * 전기에 사복으로 더 받아간 금액(`priorOverpaidWelfareWon`)이 있으면 이번 기 사복지급분 한도에서
 * 자동으로 차감해 “이번 기에 더 줄 수 있는 한도”를 만든다. 한도가 음수가 되는 일은 0 으로 클램프.
 */
export function effectiveWelfareAllocationWon(
  employee: Pick<Employee, "welfareAllocation" | "priorOverpaidWelfareWon">,
): number {
  const base = Math.max(0, Math.round(toNum(employee.welfareAllocation)));
  const priorRaw = employee.priorOverpaidWelfareWon != null ? toNum(employee.priorOverpaidWelfareWon) : 0;
  const prior = Math.max(0, Math.round(priorRaw));
  return Math.max(0, base - prior);
}

/** 사복지급분(welfareAllocation) 상한 대비 초과·급여포함신고용 미달 */
export function computeWelfareCapVsActual(
  welfareAllocation: number,
  actualYearly: number,
): {
  cap: number;
  actual: number;
  overage: number;
  underForSalaryReport: number;
  hasCap: boolean;
} {
  const cap = welfareAllocation;
  const actual = actualYearly;
  const hasCap = cap > 0;
  const overage = Math.max(0, Math.round(actual - cap));
  const underForSalaryReport = hasCap ? Math.max(0, Math.round(cap - actual)) : 0;
  return { cap, actual, overage, underForSalaryReport, hasCap };
}

export type SalaryInclusionCapSource = "incentive" | "welfare" | "none";

/**
 * 급여포함신고 상한: 대표가 말해 준 **예상 인센**(직원 `incentiveAmount`)이 있으면 그 금액을 연간 상한으로 쓰고,
 * 없으면 **사복지급분**(`welfareAllocation`)을 쓴다.
 * 사복지급분 모드에서는 **전기 더 받은 금액(`priorOverpaidWelfareWon`)을 자동으로 차감해** 이번 기 실효 한도를 만든다.
 * 실제 기금 지급이 상한을 넘으면 **초과분은 급여(과세) 쪽에 포함해 신고**하는 흐름을 전제로 한다.
 */
export function resolveSalaryInclusionCap(
  employee: Pick<Employee, "welfareAllocation" | "incentiveAmount" | "priorOverpaidWelfareWon">,
): {
  cap: number;
  hasCap: boolean;
  source: SalaryInclusionCapSource;
} {
  const inc = employee.incentiveAmount != null ? toNum(employee.incentiveAmount) : 0;
  if (inc > 0) {
    return { cap: Math.round(inc), hasCap: true, source: "incentive" };
  }
  const w = effectiveWelfareAllocationWon(employee);
  if (w > 0) {
    return { cap: w, hasCap: true, source: "welfare" };
  }
  return { cap: 0, hasCap: false, source: "none" };
}

export function salaryInclusionCapLabel(source: SalaryInclusionCapSource): string {
  switch (source) {
    case "incentive":
      return "예상 인센";
    case "welfare":
      return "사복지급분";
    default:
      return "—";
  }
}

export type MonthlyNoteIncentiveFields = Pick<
  MonthlyEmployeeNote,
  "year" | "month" | "incentiveAccrualAmount" | "incentiveWelfarePaymentAmount"
>;

/** 지급월 1~N월: 월별 노트의 발생 인센 누적 */
export function sumIncentiveAccrualYtd(
  notes: MonthlyNoteIncentiveFields[],
  year: number,
  lastPaidMonthInclusive: number,
): number {
  const m = Math.min(12, Math.max(0, lastPaidMonthInclusive));
  return notes
    .filter((n) => n.year === year && n.month >= 1 && n.month <= m)
    .reduce((s, n) => s + (n.incentiveAccrualAmount != null ? toNum(n.incentiveAccrualAmount) : 0), 0);
}

/** 지급월 1~N월: 인센을 사복으로 지급하기로 한 금액 누적 */
export function sumIncentiveWelfarePaymentYtd(
  notes: MonthlyNoteIncentiveFields[],
  year: number,
  lastPaidMonthInclusive: number,
): number {
  const m = Math.min(12, Math.max(0, lastPaidMonthInclusive));
  return notes
    .filter((n) => n.year === year && n.month >= 1 && n.month <= m)
    .reduce((s, n) => s + (n.incentiveWelfarePaymentAmount != null ? toNum(n.incentiveWelfarePaymentAmount) : 0), 0);
}

/**
 * 인센을 사복으로 받기로 한 경우: 누적 발생 인센이 누적 사복(인센) 지급액을 넘으면
 * 그 차액은 급여(과세)에 포함해 신고하는 흐름.
 * 예) 1월 발생 307,000 + 2월 발생 203,100 = 510,100, 2월 사복(인센) 지급 500,000 → 차액 10,100.
 */
export function computeIncentiveWelfareSalaryInclusionYtd(
  notes: MonthlyNoteIncentiveFields[],
  year: number,
  lastPaidMonthInclusive: number,
): {
  accrualYtd: number;
  welfarePaymentYtd: number;
  excessForSalary: number;
} {
  const through = Math.min(12, Math.max(1, lastPaidMonthInclusive));
  const accrualYtd = Math.round(sumIncentiveAccrualYtd(notes, year, through));
  const welfarePaymentYtd = Math.round(sumIncentiveWelfarePaymentYtd(notes, year, through));
  const excessForSalary = Math.max(0, accrualYtd - welfarePaymentYtd);
  return { accrualYtd, welfarePaymentYtd, excessForSalary };
}

/** resolveSalaryInclusionCap + 실적 금액으로 초과·미달(급여포함신고) */
export function computeSalaryInclusionVsActual(
  employee: Pick<Employee, "welfareAllocation" | "incentiveAmount" | "priorOverpaidWelfareWon">,
  actualWelfare: number,
): ReturnType<typeof computeWelfareCapVsActual> & { capSource: SalaryInclusionCapSource } {
  const { cap, hasCap, source } = resolveSalaryInclusionCap(employee);
  if (!hasCap) {
    return {
      cap: 0,
      actual: actualWelfare,
      overage: 0,
      underForSalaryReport: 0,
      hasCap: false,
      capSource: source,
    };
  }
  const v = computeWelfareCapVsActual(cap, actualWelfare);
  return { ...v, capSource: source };
}

/** 지급월 1~N: 월별 노트의 인센→사복 지급액 합 */
export function sumIncentiveWelfarePaymentThroughMonth(
  notes: Pick<MonthlyEmployeeNote, "year" | "month" | "incentiveWelfarePaymentAmount">[],
  year: number,
  lastPaidMonthInclusive: number,
): number {
  const m = Math.min(12, Math.max(0, lastPaidMonthInclusive));
  return Math.round(
    notes
      .filter((n) => n.year === year && n.month >= 1 && n.month <= m)
      .reduce((s, n) => s + (n.incentiveWelfarePaymentAmount != null ? toNum(n.incentiveWelfarePaymentAmount) : 0), 0),
  );
}

/** 스케줄 카드·급여포함신고용 — 블록 단위 상한/실적/초과 */
export type SalaryInclusionCapBlock = {
  key: "welfare" | "incentive" | "single";
  title: string;
  /** 실적 의미(예: 연간 기금 vs 인센 사복 합) */
  actualLabel: string;
  cap: number;
  actual: number;
  overage: number;
  underForSalaryReport: number;
  hasCap: boolean;
};

/**
 * 업체 `COMBINED`(급여낮추기+인센) 이고 사복지급분·예상 인센이 모두 있으면:
 * - 사복지급분 상한 vs **연간(또는 누적) 기금 실적**
 * - 예상 인센 상한 vs **월별 노트「사복으로 지급할 인센」누적 합**
 * 그 외 운영 방식은 기존 `computeSalaryInclusionVsActual` 한 블록.
 */
export function computeSalaryInclusionCapBlocks(
  employee: Employee,
  yearlyWelfareActual: number,
  notes: Pick<MonthlyEmployeeNote, "year" | "month" | "incentiveWelfarePaymentAmount">[],
  year: number,
  operationMode: TenantOperationMode,
  lastPaidMonthInclusive: number = 12,
): SalaryInclusionCapBlock[] {
  /** 사복 상한은 “실효(전기 차감 후)” 사용 — 인센 상한은 별도 정책이라 그대로 둠 */
  const wAlloc = effectiveWelfareAllocationWon(employee);
  const incCap = employee.incentiveAmount != null ? Math.round(toNum(employee.incentiveAmount)) : 0;
  const incentivePaid = sumIncentiveWelfarePaymentThroughMonth(notes, year, lastPaidMonthInclusive);

  if (operationMode === "COMBINED" && wAlloc > 0 && incCap > 0) {
    const wv = computeWelfareCapVsActual(wAlloc, yearlyWelfareActual);
    const iv = computeWelfareCapVsActual(incCap, incentivePaid);
    return [
      {
        key: "welfare",
        title: "사복지급분 상한",
        actualLabel: lastPaidMonthInclusive >= 12 ? "연간 기금 실적" : `기금 실적(~${lastPaidMonthInclusive}월)`,
        cap: wv.cap,
        actual: wv.actual,
        overage: wv.overage,
        underForSalaryReport: wv.underForSalaryReport,
        hasCap: wv.hasCap,
      },
      {
        key: "incentive",
        title: "예상 인센 상한",
        actualLabel:
          lastPaidMonthInclusive >= 12
            ? "인센 사복 지급(월 노트) 합"
            : `인센 사복 지급 합(~${lastPaidMonthInclusive}월)`,
        cap: iv.cap,
        actual: iv.actual,
        overage: iv.overage,
        underForSalaryReport: iv.underForSalaryReport,
        hasCap: iv.hasCap,
      },
    ];
  }

  const { source: capSource } = resolveSalaryInclusionCap(employee);
  const legacyActual = capSource === "incentive" ? incentivePaid : yearlyWelfareActual;
  const legacy = computeSalaryInclusionVsActual(employee, legacyActual);
  const singleTitle =
    legacy.capSource === "incentive"
      ? "예상 인센 상한"
      : legacy.capSource === "welfare"
        ? "사복지급분 상한"
        : "상한";
  const singleActualLabel =
    legacy.capSource === "incentive"
      ? lastPaidMonthInclusive >= 12
        ? "인센 사복 지급(월 노트) 합"
        : `인센 사복 지급 합(~${lastPaidMonthInclusive}월)`
      : lastPaidMonthInclusive >= 12
        ? "연간 기금 실적"
        : `기금 실적(~${lastPaidMonthInclusive}월)`;
  return [
    {
      key: "single",
      title: singleTitle,
      actualLabel: singleActualLabel,
      cap: legacy.cap,
      actual: legacy.actual,
      overage: legacy.overage,
      underForSalaryReport: legacy.underForSalaryReport,
      hasCap: legacy.hasCap,
    },
  ];
}
