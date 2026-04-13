/**
 * 참고 시트 시나리오 대비 회귀: 도메인 숫자가 문서화된 기대값과 일치하는지 확인.
 * 실행: npm run sheet:parity
 */
import assert from "node:assert/strict";
import type { Employee, MonthlyEmployeeNote } from "../src/types/models";
import {
  computeIncentiveWelfareSalaryInclusionYtd,
  resolveSalaryInclusionCap,
} from "../src/lib/domain/schedule";
import { computeTenantOperatingSummary } from "../src/lib/domain/sheet-aggregate";

function minimalEmployee(over: Partial<Employee> = {}): Employee {
  return {
    id: "e1",
    tenantId: "t1",
    employeeCode: "1",
    name: "테스트",
    position: "사원",
    baseSalary: 0,
    adjustedSalary: 0,
    welfareAllocation: 0,
    incentiveAmount: null,
    discretionaryAmount: null,
    optionalWelfareAmount: null,
    monthlyPayAmount: null,
    quarterlyPayAmount: null,
    birthMonth: null,
    hireMonth: null,
    resignMonth: null,
    weddingMonth: null,
    childrenInfant: 0,
    childrenPreschool: 0,
    childrenTeen: 0,
    parentsCount: 0,
    parentsInLawCount: 0,
    insurancePremium: 0,
    loanInterest: 0,
    payDay: null,
    level: 3,
    flagAutoAmount: false,
    flagRepReturn: false,
    flagSpouseReceipt: false,
    flagWorkerNet: false,
    ...over,
  };
}

// 시트 시나리오: 1월 발생 307,000 + 2월 발생 203,100, 2월 사복(인센) 500,000 → 차액 10,100
const incNotes: Pick<
  MonthlyEmployeeNote,
  "year" | "month" | "incentiveAccrualAmount" | "incentiveWelfarePaymentAmount"
>[] = [
  { year: 2026, month: 1, incentiveAccrualAmount: 307_000, incentiveWelfarePaymentAmount: null },
  { year: 2026, month: 2, incentiveAccrualAmount: 203_100, incentiveWelfarePaymentAmount: 500_000 },
];
const incYtd = computeIncentiveWelfareSalaryInclusionYtd(incNotes, 2026, 2);
assert.equal(incYtd.accrualYtd, 510_100);
assert.equal(incYtd.welfarePaymentYtd, 500_000);
assert.equal(incYtd.excessForSalary, 10_100);

const cap1 = resolveSalaryInclusionCap(minimalEmployee({ incentiveAmount: 10_000_000, welfareAllocation: 3_000_000 }));
assert.equal(cap1.source, "incentive");
assert.equal(cap1.cap, 10_000_000);

const cap2 = resolveSalaryInclusionCap(minimalEmployee({ incentiveAmount: null, welfareAllocation: 3_000_000 }));
assert.equal(cap2.source, "welfare");
assert.equal(cap2.cap, 3_000_000);

const emptySummary = computeTenantOperatingSummary([], 2026, 1, false, [], [], [], [], []);
assert.equal(emptySummary.employeeCount, 0);
assert.equal(emptySummary.totalYearlyWelfare, 0);
assert.equal(emptySummary.byLevel.length, 5);

const one = minimalEmployee({ level: 2 });
const oneSummary = computeTenantOperatingSummary([one], 2026, 1, false, [], [], [], [], []);
assert.equal(oneSummary.employeeCount, 1);
assert.equal(oneSummary.byLevel[0].level, 1);
assert.equal(oneSummary.byLevel[0].count, 0);
assert.equal(oneSummary.byLevel[1].level, 2);
assert.equal(oneSummary.byLevel[1].count, 1);

console.log("sheet-parity: OK");
