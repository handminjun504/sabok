/**
 * 연중 사복·급여 중도 재분배 (Mid-year Rebalance) 도메인 로직.
 *
 * 핵심 불변:
 *   `adjustedSalary × 12 + 연간 사복 지급합 = baseSalary × 12`
 *
 * 이미 지급된 월(`< effectiveMonth`)은 기존 규칙 스냅샷을 `MonthlyEmployeeNote.welfareOverrideAmount`
 * 로 고정하고, 이후 월은 새 규칙/금액을 같은 필드에 덮어써 이후 규칙 변경에도 흔들리지 않게 한다.
 * 사복 변동분 Δ = (Σbefore − Σafter) 은 잔여 월(effectiveMonth~퇴사월 또는 12월)에 균등 가산해
 * `adjustedSalaryOverrideAmount` 로 저장한다. 정수 나누기 잔차는 12월에 합산.
 */

import type {
  Employee,
  Level5Override,
  LevelPaymentRule,
  MonthlyEmployeeNote,
  QuarterlyEmployeeConfig,
} from "@/types/models";
import type { PaymentEventKey } from "@/lib/business-rules";
import {
  buildMonthlyBreakdown,
  employeeStatusForYear,
  monthlyOverrideMapFromNotes,
  yearlyWelfareTotal,
  type CustomPaymentScheduleDef,
} from "./schedule";

/** 1~12월 중 실효 시작 월 (effectiveMonth=1 이면 전 연도 재계산, 스냅샷 없음). */
export type EffectiveMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 변경 유형 3종 */
export type MidYearChangeKind = "LEVEL_RULE" | "EMPLOYEE_LEVEL" | "EMPLOYEE_AMOUNT";

/** L1: 레벨 규칙 전체 수정 */
export type LevelRuleChangeInput = {
  kind: "LEVEL_RULE";
  level: number;
  /** eventKey → 새 금액 */
  newAmountsByEventKey: Readonly<Record<string, number>>;
};

/** L2: 특정 직원 레벨 변경 */
export type EmployeeLevelChangeInput = {
  kind: "EMPLOYEE_LEVEL";
  employeeId: string;
  newLevel: number;
};

/** L3: 특정 직원 금액 수정. L5 직원이면 `Level5Override` 로, 그 외는 월별 노트 welfareOverrideAmount 로 반영 */
export type EmployeeAmountChangeInput = {
  kind: "EMPLOYEE_AMOUNT";
  employeeId: string;
  /**
   * eventKey → 새 금액(연간 "한 번" 지급되는 값).
   * 이 값은 이후 규칙·오버라이드로도 사용되고, 재분배 스냅샷 계산의 "after" 값으로도 쓰인다.
   */
  newAmountsByEventKey: Readonly<Record<string, number>>;
};

export type MidYearChangeRequest = {
  effectiveMonth: EffectiveMonth;
} & (LevelRuleChangeInput | EmployeeLevelChangeInput | EmployeeAmountChangeInput);

/** 계획 계산에 필요한 컨텍스트. 서버 액션이 DB 에서 조립해 넘긴다. */
export type MidYearRebalanceContext = {
  tenantId: string;
  year: number;
  foundingMonth: number;
  accrualCurrentMonthPayNext: boolean;
  customPaymentEvents: CustomPaymentScheduleDef[];
  fixedEventMonthsOverride: Partial<Record<PaymentEventKey, number>>;
  employees: Employee[];
  rules: LevelPaymentRule[];
  overrides: Level5Override[];
  quarterly: QuarterlyEmployeeConfig[];
  notes: MonthlyEmployeeNote[];
  request: MidYearChangeRequest;
};

/** 한 직원에 대해 계산된 재분배 결과 */
export type EmployeeRebalanceResult = {
  employeeId: string;
  employeeCode: string;
  name: string;
  currentLevel: number;
  /** L2 시 새 레벨, 그 외는 null */
  newLevel: number | null;
  /** baseSalary (연봉, 원). 0 이면 급여 자동 보정 불가 */
  baseSalaryAnnual: number;
  /** 오버라이드 적용 전 연봉 기반 월 급여 */
  baseMonthlySalary: number;
  /** 잔여 월수 (effectiveMonth ~ 직원 활성 끝 월 포함). 0 이면 급여 보정 스킵 */
  remainingMonths: number;
  /** 1~12월 기존 규칙 기준 월사복 */
  welfareBeforeByMonth: Record<number, number>;
  /** 1~12월 새 규칙 기준 월사복 (m < effectiveMonth 는 before 와 동일: 스냅샷 고정) */
  welfareAfterByMonth: Record<number, number>;
  /** Σbefore − Σafter (감소면 양수). 조정급여 가산량 */
  deltaAnnualWelfare: number;
  /** Δ / N 의 몫(원 단위 정수) */
  addPerMonth: number;
  /** 12월 잔차(원) */
  remainderAtDecember: number;
  /** 4~11월 조정급여 월액 (baseMonthly + addPerMonth) */
  adjustedMonthlyAddedSalary: number;
  /** 12월 조정급여 월액 (baseMonthly + addPerMonth + remainderAtDecember) */
  adjustedDecemberSalary: number;
  /** 경고 메시지 모음 (엣지케이스 안내용) */
  warnings: string[];
  /** DB 에 기록할 월별 노트 쓰기(위 값들을 저장용으로 풀어 놓음) */
  noteWrites: ReadonlyArray<{
    month: number;
    welfareOverrideAmount?: number | null;
    adjustedSalaryOverrideAmount?: number | null;
    levelOverride?: number | null;
  }>;
};

/** 전체 재분배 계획 */
export type MidYearRebalancePlan = {
  request: MidYearChangeRequest;
  year: number;
  affectedEmployees: EmployeeRebalanceResult[];
  /** 규칙·오버라이드·직원 레벨 쓰기 */
  ruleWrites: ReadonlyArray<{ level: number; eventKey: string; amount: number }>;
  level5Writes: ReadonlyArray<{ employeeId: string; eventKey: string; amount: number }>;
  employeeLevelUpdates: ReadonlyArray<{ employeeId: string; newLevel: number }>;
  /** 계획 수준 경고(대상 없음, effectiveMonth=1 등) */
  warnings: string[];
};

function toNum(v: number | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampLevel(lv: number): number {
  const n = Math.round(Number(lv));
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

function employeeLevelNorm(employee: Pick<Employee, "level">): number {
  return clampLevel(Number(employee.level));
}

/**
 * 한 직원의 활성 월 범위(연도 기준). `resignYear=year` 이고 `resignMonth=m` 이면 m 까지만 포함.
 * 퇴사자/신규입사자는 여기서 잘린다.
 */
export function employeeActiveMonthsForYear(
  employee: Pick<Employee, "resignYear" | "resignMonth" | "hireMonth">,
  year: number,
): number[] {
  const status = employeeStatusForYear(employee, year);
  if (status.kind === "AFTER_RESIGN") return [];
  const from = status.kind === "ACTIVE_PARTIAL" ? status.range.fromMonth : 1;
  const to = status.kind === "ACTIVE_PARTIAL" ? status.range.toMonth : 12;
  const out: number[] = [];
  for (let m = from; m <= to; m++) out.push(m);
  return out;
}

/**
 * 월별 사복 지급액 합산(1~12월). `buildMonthlyBreakdown` 결과를 받아 귀속월 기준으로 합산.
 * - regular 은 accrualMonth 에 귀속
 * - quarterly 는 paidMonth 에 귀속되지만 편의상 여기서도 row.totalWelfareMonth 를 accrualMonth 로 합산해 둔다
 *   (중도 재분배는 "연간 사복 지급 합" 의 Δ 만 필요하므로 월별 분포 자체는 내부 세부 사항으로 노출만 함).
 */
function monthlyWelfareTotals(
  employee: Employee,
  year: number,
  ctx: MidYearRebalanceContext,
  rulesOverride: LevelPaymentRule[],
  overridesOverride: Level5Override[],
  notesOverride?: ReadonlyArray<MonthlyEmployeeNote>,
  /** 해당 직원의 레벨을 강제(레벨 변경 시뮬레이션용). 지정하지 않으면 employee.level 사용 */
  forcedLevel?: number | null,
): Record<number, number> {
  const empForBuild: Employee = forcedLevel != null ? { ...employee, level: forcedLevel } : employee;
  const notesForMap = notesOverride ?? ctx.notes.filter((n) => n.employeeId === employee.id);
  const overrideMap = monthlyOverrideMapFromNotes(notesForMap, year);
  const br = buildMonthlyBreakdown(
    empForBuild,
    year,
    ctx.foundingMonth,
    rulesOverride,
    overridesOverride.filter((o) => o.employeeId === employee.id),
    ctx.quarterly.filter((q) => q.employeeId === employee.id),
    ctx.accrualCurrentMonthPayNext,
    ctx.customPaymentEvents,
    ctx.fixedEventMonthsOverride,
    overrideMap,
  );
  const out: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) out[m] = 0;
  for (const row of br) {
    out[row.accrualMonth] = (out[row.accrualMonth] ?? 0) + row.totalWelfareMonth;
  }
  return out;
}

function sumRecord(r: Record<number, number>): number {
  let s = 0;
  for (const m in r) s += r[m] ?? 0;
  return s;
}

/** 직원 목록 중 요청(request) 에 영향받는 직원만 필터링 */
function affectedEmployeesOf(ctx: MidYearRebalanceContext): Employee[] {
  const { request, employees, year } = ctx;
  const active = employees.filter((e) => employeeStatusForYear(e, year).kind !== "AFTER_RESIGN");
  switch (request.kind) {
    case "LEVEL_RULE":
      return active.filter((e) => employeeLevelNorm(e) === clampLevel(request.level));
    case "EMPLOYEE_LEVEL":
    case "EMPLOYEE_AMOUNT": {
      const emp = active.find((e) => e.id === request.employeeId);
      return emp ? [emp] : [];
    }
  }
}

/**
 * 요청 종류·대상 직원에 대한 "after" 규칙 테이블 생성.
 * LevelPaymentRule 배열/Level5Override 배열을 그대로 반환 (원본은 변경하지 않음).
 */
function buildAfterRulesForEmployee(
  ctx: MidYearRebalanceContext,
  employee: Employee,
): { rules: LevelPaymentRule[]; overrides: Level5Override[]; forcedLevel: number | null } {
  const { request, year, tenantId } = ctx;
  const currentRules = ctx.rules;
  const currentOverrides = ctx.overrides;

  if (request.kind === "LEVEL_RULE") {
    const lv = clampLevel(request.level);
    const newRules: LevelPaymentRule[] = currentRules.map((r) => {
      if (r.year !== year || r.level !== lv) return r;
      const override = request.newAmountsByEventKey[r.eventKey];
      if (override != null && Number.isFinite(override)) {
        return { ...r, amount: Math.max(0, Math.round(Number(override))) };
      }
      return r;
    });
    /** 새 이벤트(기존에 규칙 없는 eventKey) 를 추가 */
    for (const [eventKey, amount] of Object.entries(request.newAmountsByEventKey)) {
      const exists = newRules.some((r) => r.year === year && r.level === lv && r.eventKey === eventKey);
      if (!exists) {
        newRules.push({
          id: `__virtual_${tenantId}_${year}_${lv}_${eventKey}`,
          tenantId,
          year,
          level: lv,
          eventKey,
          amount: Math.max(0, Math.round(Number(amount))),
        });
      }
    }
    return { rules: newRules, overrides: currentOverrides, forcedLevel: null };
  }

  if (request.kind === "EMPLOYEE_LEVEL") {
    const newLv = clampLevel(request.newLevel);
    return { rules: currentRules, overrides: currentOverrides, forcedLevel: newLv };
  }

  /** EMPLOYEE_AMOUNT */
  const empLevel = employeeLevelNorm(employee);
  if (empLevel === 5) {
    const merged: Level5Override[] = currentOverrides
      .filter((o) => !(o.employeeId === employee.id && o.year === year))
      .concat(
        Object.entries(request.newAmountsByEventKey).map(([eventKey, amount]) => ({
          id: `__virtual_l5_${employee.id}_${year}_${eventKey}`,
          employeeId: employee.id,
          year,
          eventKey,
          amount: Math.max(0, Math.round(Number(amount))),
        })),
      );
    return { rules: currentRules, overrides: merged, forcedLevel: null };
  }

  /**
   * L5 가 아닌 직원의 금액 변경은 LevelPaymentRule 도 Level5Override 도 건드리지 않고,
   * 아래 `planMidYearRebalance` 에서 직접 월별 welfareOverrideAmount 로 저장한다.
   * buildAfterRulesForEmployee 단계에서는 시뮬레이션을 위해 L5 처럼 override 로 가짜 치환한다.
   */
  const fakeOverrides: Level5Override[] = currentOverrides.concat(
    Object.entries(request.newAmountsByEventKey).map(([eventKey, amount]) => ({
      id: `__virtual_amt_${employee.id}_${year}_${eventKey}`,
      employeeId: employee.id,
      year,
      eventKey,
      amount: Math.max(0, Math.round(Number(amount))),
    })),
  );
  /**
   * `resolveEventAmount` 는 level === 5 일 때만 Level5Override 를 찾는다. 비-L5 직원에게 override 를
   * 적용하려면 forcedLevel=5 로 레벨을 일시적으로 5 로 간주해야 한다.
   */
  return { rules: currentRules, overrides: fakeOverrides, forcedLevel: 5 };
}

/**
 * 계획 계산. DB 에 쓰지 않는다(순수 함수).
 */
export function planMidYearRebalance(ctx: MidYearRebalanceContext): MidYearRebalancePlan {
  const warnings: string[] = [];
  const { request, year } = ctx;
  const effectiveMonth = Math.min(12, Math.max(1, Math.round(request.effectiveMonth))) as EffectiveMonth;
  if (effectiveMonth === 1) {
    warnings.push("effectiveMonth=1 입니다. 재분배가 아닌 단순 규칙 교체로 동작합니다.");
  }

  const targets = affectedEmployeesOf(ctx);
  if (targets.length === 0) {
    warnings.push("영향받는 직원이 없습니다.");
  }

  const results: EmployeeRebalanceResult[] = [];
  /** L3 비-L5 직원의 월별 welfareOverrideAmount 쓰기는 EmployeeRebalanceResult.noteWrites 에 포함 */
  const ruleWrites: { level: number; eventKey: string; amount: number }[] = [];
  const level5Writes: { employeeId: string; eventKey: string; amount: number }[] = [];
  const employeeLevelUpdates: { employeeId: string; newLevel: number }[] = [];

  if (request.kind === "LEVEL_RULE") {
    for (const [eventKey, amount] of Object.entries(request.newAmountsByEventKey)) {
      ruleWrites.push({
        level: clampLevel(request.level),
        eventKey,
        amount: Math.max(0, Math.round(Number(amount))),
      });
    }
  }
  if (request.kind === "EMPLOYEE_LEVEL") {
    employeeLevelUpdates.push({
      employeeId: request.employeeId,
      newLevel: clampLevel(request.newLevel),
    });
  }
  if (request.kind === "EMPLOYEE_AMOUNT") {
    const emp = targets[0];
    if (emp && employeeLevelNorm(emp) === 5) {
      for (const [eventKey, amount] of Object.entries(request.newAmountsByEventKey)) {
        level5Writes.push({
          employeeId: emp.id,
          eventKey,
          amount: Math.max(0, Math.round(Number(amount))),
        });
      }
    }
  }

  for (const emp of targets) {
    const empWarnings: string[] = [];
    const activeMonths = employeeActiveMonthsForYear(emp, year);
    if (activeMonths.length === 0) {
      empWarnings.push("해당 연도 활성 기간이 없어 건너뜁니다.");
      results.push(skeletonResult(emp, empWarnings));
      continue;
    }

    /** Level5Override ↔ 일반 레벨 전환 시 안내 — 기존 override 가 새 레벨에서 무시됨을 명시 */
    if (request.kind === "EMPLOYEE_LEVEL") {
      const curLevel = employeeLevelNorm(emp);
      const nextLevel = clampLevel(request.newLevel);
      const hasL5Override = ctx.overrides.some((o) => o.employeeId === emp.id && o.year === year);
      if (curLevel === 5 && nextLevel !== 5 && hasL5Override) {
        empWarnings.push(
          "레벨 5→다른 레벨 변경: 기존 Level5Override 는 무시됩니다 (DB 에는 남지만 적용되지 않음).",
        );
      }
      if (curLevel !== 5 && nextLevel === 5) {
        empWarnings.push(
          "레벨→5 변경: Level5Override 가 없으면 공통 규칙 금액이 사용됩니다. 직원 상세에서 개별 금액을 설정하세요.",
        );
      }
    }

    /** 이 연도에 기존 월별 노트 오버라이드가 있으면 "2차 변경" 안내 */
    const hasExistingNoteOverride = ctx.notes.some(
      (n) =>
        n.employeeId === emp.id &&
        n.year === year &&
        (n.welfareOverrideAmount != null ||
          n.adjustedSalaryOverrideAmount != null ||
          n.levelOverride != null),
    );
    if (hasExistingNoteOverride) {
      empWarnings.push(
        "이 직원에 이미 중도 재분배 기록이 있습니다 — 기존값을 '전' 스냅샷으로 간주해 재계산합니다 (2차 변경).",
      );
    }
    const maxActiveMonth = activeMonths[activeMonths.length - 1];
    const minActiveMonth = activeMonths[0];

    /** "before" = 현재 DB 상태(기존 규칙 + 기존 오버라이드 + 기존 월별 노트 오버라이드). */
    const beforeByMonth = monthlyWelfareTotals(
      emp,
      year,
      ctx,
      ctx.rules,
      ctx.overrides,
      ctx.notes.filter((n) => n.employeeId === emp.id),
      null,
    );

    /** "after" = 새 규칙/오버라이드/레벨 반영. 기존 월별 노트의 welfareOverrideAmount 는 after 시뮬레이션에서는 무시
     *  (새 값을 기준으로 재계산해야 하므로).  단, levelOverride 는 유지 — 2차 변경에서 혼선 방지. */
    const { rules: afterRules, overrides: afterOverrides, forcedLevel } = buildAfterRulesForEmployee(ctx, emp);
    const afterNotes = ctx.notes
      .filter((n) => n.employeeId === emp.id)
      .map((n) => ({ ...n, welfareOverrideAmount: null }));
    const afterByMonth = monthlyWelfareTotals(
      emp,
      year,
      ctx,
      afterRules,
      afterOverrides,
      afterNotes,
      forcedLevel,
    );

    /** m < effectiveMonth 는 before 값을 고정 (스냅샷). m >= effectiveMonth 는 after 값. */
    const welfareBeforeByMonth: Record<number, number> = {};
    const welfareAfterByMonth: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      welfareBeforeByMonth[m] = activeMonths.includes(m) ? (beforeByMonth[m] ?? 0) : 0;
      if (!activeMonths.includes(m)) {
        welfareAfterByMonth[m] = 0;
      } else if (m < effectiveMonth) {
        welfareAfterByMonth[m] = beforeByMonth[m] ?? 0;
      } else {
        welfareAfterByMonth[m] = afterByMonth[m] ?? 0;
      }
    }

    const sumBefore = sumRecord(welfareBeforeByMonth);
    const sumAfter = sumRecord(welfareAfterByMonth);
    const delta = sumBefore - sumAfter;

    const baseSalaryAnnual = Math.max(0, Math.round(toNum(emp.baseSalary)));
    const baseMonthly = Math.round(baseSalaryAnnual / 12);
    const adjustedAnnualDb = Math.max(0, Math.round(toNum(emp.adjustedSalary)));

    /**
     * 재분배 가능한 잔여 월 = effectiveMonth ~ maxActiveMonth.
     * effectiveMonth 가 활성 범위보다 뒤면 잔여 0 (재분배 불가).
     */
    const remainingStart = Math.max(effectiveMonth, minActiveMonth);
    const remainingEnd = maxActiveMonth;
    const remainingMonths = Math.max(0, remainingEnd - remainingStart + 1);

    /** 엣지케이스 안내 — UI 에서 직원 행에 같이 노출된다. */
    if (minActiveMonth > 1) {
      empWarnings.push(
        `신규 입사(${minActiveMonth}월)로 ${minActiveMonth}월부터 잔여월(N=${remainingMonths}) 계산.`,
      );
    }
    if (maxActiveMonth < 12) {
      empWarnings.push(
        `연중 퇴사(${maxActiveMonth}월)로 ${maxActiveMonth}월에 최종 정산.`,
      );
    }
    if (effectiveMonth > maxActiveMonth) {
      empWarnings.push(
        `effectiveMonth(${effectiveMonth})가 직원 활성 범위(~${maxActiveMonth}월)보다 뒤라 재분배 적용이 없습니다.`,
      );
    }

    let addPerMonth = 0;
    let remainderAtDecember = 0;
    let adjustedMonthlyAddedSalary = 0;
    let adjustedDecemberSalary = 0;

    const adjustedBaseMonthly =
      adjustedAnnualDb > 0 ? Math.round(adjustedAnnualDb / 12) : baseMonthly;

    if (baseSalaryAnnual <= 0 || adjustedAnnualDb <= 0) {
      empWarnings.push(
        "baseSalary 또는 adjustedSalary 가 0 입니다. 급여 자동 보정은 건너뛰고 사복 금액만 반영됩니다.",
      );
    } else if (remainingMonths <= 0) {
      empWarnings.push("잔여 월이 없어 급여 자동 보정을 건너뜁니다.");
    } else {
      const sign = delta >= 0 ? 1 : -1;
      const absDelta = Math.abs(delta);
      const add = Math.floor(absDelta / remainingMonths);
      const rem = absDelta - add * remainingMonths;
      addPerMonth = sign * add;
      remainderAtDecember = sign * rem;
      adjustedMonthlyAddedSalary = adjustedBaseMonthly + addPerMonth;
      adjustedDecemberSalary = adjustedBaseMonthly + addPerMonth + remainderAtDecember;

      /** 연간 사복이 baseSalary 를 초과하면 조정급여가 음수가 될 수 있다 — 경고. */
      if (sumAfter > baseSalaryAnnual) {
        empWarnings.push(
          "변경 후 연간 사복 합계가 baseSalary 를 초과합니다. 급여 보전이 불가능할 수 있습니다.",
        );
      }
      if (adjustedMonthlyAddedSalary < 0 || adjustedDecemberSalary < 0) {
        empWarnings.push(
          "재분배 결과 조정급여 월액이 음수가 됩니다. baseSalary 를 초과하는 사복 변경은 재검토 필요.",
        );
      }
    }

    /**
     * noteWrites 구성:
     *  1) 기존 월별 welfareOverrideAmount 스냅샷 (effectiveMonth 이전 활성 월) ← before 값 고정
     *  2) effectiveMonth 이후 활성 월의 새 사복 값도 welfareOverrideAmount 로 저장 (비-L5 L3 또는
     *     재분배 일관성을 위해 L1·L2 도 동일하게 스냅샷 — 2차 변경 시 기존값 유지)
     *  3) effectiveMonth 이후 활성 월의 `adjustedSalaryOverrideAmount`
     *  4) L2 시 effectiveMonth 이전 활성 월의 `levelOverride` = 기존 레벨 (스냅샷)
     */
    const noteWrites: Array<{
      month: number;
      welfareOverrideAmount?: number | null;
      adjustedSalaryOverrideAmount?: number | null;
      levelOverride?: number | null;
    }> = [];
    const currentLevel = employeeLevelNorm(emp);
    const isLevelChange = request.kind === "EMPLOYEE_LEVEL";
    const isAmountChangeNonL5 =
      request.kind === "EMPLOYEE_AMOUNT" && currentLevel !== 5;

    for (const m of activeMonths) {
      const entry: {
        month: number;
        welfareOverrideAmount?: number | null;
        adjustedSalaryOverrideAmount?: number | null;
        levelOverride?: number | null;
      } = { month: m };
      const hasSnapshotValue =
        (m < effectiveMonth) || (m >= effectiveMonth && (isAmountChangeNonL5 || request.kind === "LEVEL_RULE"));
      if (hasSnapshotValue) {
        const value = m < effectiveMonth ? (welfareBeforeByMonth[m] ?? 0) : (welfareAfterByMonth[m] ?? 0);
        entry.welfareOverrideAmount = value;
      }
      if (m >= effectiveMonth && remainingMonths > 0 && baseSalaryAnnual > 0 && adjustedAnnualDb > 0) {
        const isLast = m === remainingEnd;
        entry.adjustedSalaryOverrideAmount = isLast ? adjustedDecemberSalary : adjustedMonthlyAddedSalary;
      }
      if (isLevelChange && m < effectiveMonth) {
        entry.levelOverride = currentLevel;
      }
      /** 빈 엔트리는 제외 */
      if (
        entry.welfareOverrideAmount !== undefined ||
        entry.adjustedSalaryOverrideAmount !== undefined ||
        entry.levelOverride !== undefined
      ) {
        noteWrites.push(entry);
      }
    }

    results.push({
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.name,
      currentLevel,
      newLevel: request.kind === "EMPLOYEE_LEVEL" ? clampLevel(request.newLevel) : null,
      baseSalaryAnnual,
      baseMonthlySalary: adjustedBaseMonthly,
      remainingMonths,
      welfareBeforeByMonth,
      welfareAfterByMonth,
      deltaAnnualWelfare: delta,
      addPerMonth,
      remainderAtDecember,
      adjustedMonthlyAddedSalary,
      adjustedDecemberSalary,
      warnings: empWarnings,
      noteWrites,
    });
  }

  return {
    request,
    year,
    affectedEmployees: results,
    ruleWrites,
    level5Writes,
    employeeLevelUpdates,
    warnings,
  };
}

function skeletonResult(emp: Employee, warnings: string[]): EmployeeRebalanceResult {
  const zero: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) zero[m] = 0;
  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode,
    name: emp.name,
    currentLevel: employeeLevelNorm(emp),
    newLevel: null,
    baseSalaryAnnual: Math.max(0, Math.round(toNum(emp.baseSalary))),
    baseMonthlySalary: 0,
    remainingMonths: 0,
    welfareBeforeByMonth: zero,
    welfareAfterByMonth: { ...zero },
    deltaAnnualWelfare: 0,
    addPerMonth: 0,
    remainderAtDecember: 0,
    adjustedMonthlyAddedSalary: 0,
    adjustedDecemberSalary: 0,
    warnings,
    noteWrites: [],
  };
}

/**
 * 한 직원의 특정 월 레벨 — 노트의 levelOverride 가 있으면 그 값, 없으면 현재 Employee.level.
 * 스케줄·안내 생성부 공용 유틸.
 */
export function resolveEffectiveLevelFor(
  employee: Pick<Employee, "level">,
  year: number,
  month: number,
  notes: ReadonlyArray<Pick<MonthlyEmployeeNote, "year" | "month" | "levelOverride">>,
): number {
  const note = notes.find(
    (n) => n.year === year && n.month === month && n.levelOverride != null,
  );
  if (note && note.levelOverride != null) return clampLevel(Number(note.levelOverride));
  return employeeLevelNorm(employee);
}

/**
 * 한 직원의 특정 월 사복 지급 총액 — 노트의 welfareOverrideAmount 가 있으면 그 값,
 * 없으면 전달된 breakdown 의 totalWelfareMonth.
 */
export function resolveEffectiveWelfareForMonth(
  totalWelfareMonthFromBreakdown: number,
  year: number,
  month: number,
  notes: ReadonlyArray<Pick<MonthlyEmployeeNote, "year" | "month" | "welfareOverrideAmount">>,
): number {
  const note = notes.find(
    (n) => n.year === year && n.month === month && n.welfareOverrideAmount != null,
  );
  if (note && note.welfareOverrideAmount != null) {
    return Math.max(0, Math.round(Number(note.welfareOverrideAmount)));
  }
  return Math.max(0, Math.round(Number(totalWelfareMonthFromBreakdown)));
}

/** 자주 쓰이는 수치 요약 — 검증 UI 에 노출 */
export function summarizePlan(plan: MidYearRebalancePlan): {
  employees: number;
  totalDelta: number;
  maxOverageSalaryWon: number;
} {
  let totalDelta = 0;
  let maxOverage = 0;
  for (const r of plan.affectedEmployees) {
    totalDelta += r.deltaAnnualWelfare;
    const afterAnnual =
      r.adjustedMonthlyAddedSalary * Math.max(0, r.remainingMonths - 1) + r.adjustedDecemberSalary;
    const overage = afterAnnual > r.baseSalaryAnnual && r.baseSalaryAnnual > 0
      ? afterAnnual - r.baseSalaryAnnual
      : 0;
    if (overage > maxOverage) maxOverage = overage;
  }
  return {
    employees: plan.affectedEmployees.length,
    totalDelta,
    maxOverageSalaryWon: maxOverage,
  };
}

/** 테스트·디버그용: 특정 plan 에서 직원 단위의 연간 조정급여 총합을 계산 */
export function sumAdjustedAnnualForPlan(plan: MidYearRebalancePlan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of plan.affectedEmployees) {
    if (r.remainingMonths === 0 || r.baseSalaryAnnual === 0) {
      out[r.employeeId] = Math.round(r.baseMonthlySalary * 12);
      continue;
    }
    out[r.employeeId] =
      r.baseMonthlySalary * (12 - r.remainingMonths) +
      r.adjustedMonthlyAddedSalary * Math.max(0, r.remainingMonths - 1) +
      r.adjustedDecemberSalary;
  }
  return out;
}

/** yearlyWelfareTotal 재-export (편의) */
export { yearlyWelfareTotal };
