/**
 * 참고 시트 시나리오 대비 회귀: 도메인 숫자가 문서화된 기대값과 일치하는지 확인.
 * 실행: npm run sheet:parity
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sheetEmployeeExportHeaders } from "../src/lib/csv-import";
import type { CompanySettings, Employee, LevelPaymentRule, MonthlyEmployeeNote, QuarterlyEmployeeConfig } from "../src/types/models";
import {
  buildMonthlyBreakdown,
  computeIncentiveWelfareSalaryInclusionYtd,
  resolveSalaryInclusionCap,
  suggestLevelByExpectedRegular,
  welfareByScheduleDisplayMonth,
  yearlyWelfareTotal,
} from "../src/lib/domain/schedule";
import { computeTenantOperatingSummary } from "../src/lib/domain/sheet-aggregate";
import {
  aggregateWelfareSpendBySource,
  allocateYearlyWelfareToLegalCategories,
} from "../src/lib/domain/operating-welfare-legal-categories";

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
    hireYear: null,
    resignMonth: null,
    resignYear: null,
    weddingMonth: null,
    childrenInfant: 0,
    childrenPreschool: 0,
    childrenTeen: 0,
    parentsCount: 0,
    parentsInLawCount: 0,
    insurancePremium: 0,
    loanInterest: 0,
    monthlyRentAmount: null,
    payDay: null,
    level: 3,
    expectedYearlyWelfare: null,
    flagAutoAmount: false,
    flagRepReturn: false,
    flagSpouseReceipt: false,
    flagWorkerNet: false,
    salaryInclusionVarianceMode: null,
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

// 월별 스케줄 표: 정기=귀속월·분기=지급월 분리 시 열 합 = 연간 스케줄 합(+노트)
const febRule: LevelPaymentRule = {
  id: "r1",
  tenantId: "t1",
  year: 2026,
  level: 3,
  eventKey: "NEW_YEAR_FEB",
  amount: 50_000,
};
const empGrid = minimalEmployee({ level: 3 });
const qRow: QuarterlyEmployeeConfig = {
  id: "q1",
  employeeId: "e1",
  year: 2026,
  itemKey: "INFANT_SCHOLARSHIP",
  paymentMonths: [6],
  amount: 30_000,
};
const brGrid = buildMonthlyBreakdown(empGrid, 2026, 1, [febRule], [], [qRow], true, []);
const noteMap = new Map<number, number>([[4, 7_000]]);
const grid = welfareByScheduleDisplayMonth(brGrid, noteMap);
let sumCols = 0;
for (let m = 1; m <= 12; m++) sumCols += grid.get(m) ?? 0;
assert.equal(sumCols, yearlyWelfareTotal(brGrid) + 7_000);
assert.equal(grid.get(2), 50_000, "2월 귀속 정기는 2월 열");
assert.equal(grid.get(6), 30_000, "분기는 지급월 6열");
assert.equal(grid.get(4), 7_000, "노트는 지급월 열");

const totalsSuggest = { 1: 100_000, 2: 250_000, 3: 400_000, 4: 550_000, 5: 700_000 };
assert.equal(suggestLevelByExpectedRegular(260_000, totalsSuggest), 2);
assert.equal(suggestLevelByExpectedRegular(null, totalsSuggest), null);

const spend0 = aggregateWelfareSpendBySource([], 2026, 1, false, [], [], [], [], []);
const legal0 = allocateYearlyWelfareToLegalCategories(spend0, 0);
assert.equal([...legal0.values()].reduce((a, b) => a + b, 0), 0);

// 커밋된 직원정보 스냅샷: 시트 3행 헤더가 앱 CSV 보내기(조사표 플래그 전부 ON, 레벨·예상 인센 제외)와 동일
const __dir = path.dirname(fileURLToPath(import.meta.url));
const snapPath = path.join(__dir, "../docs/sheet-snapshots/gid-0.csv");
if (fs.existsSync(snapPath)) {
  const surveyAllOn: CompanySettings = {
    id: "",
    tenantId: "",
    foundingMonth: 1,
    defaultPayDay: 25,
    activeYear: 2026,
    accrualCurrentMonthPayNext: false,
    salaryInclusionVarianceMode: "BOTH",
    surveyShowRepReturn: true,
    surveyShowSpouseReceipt: true,
    surveyShowWorkerNet: true,
    paymentEventDefs: null,
    reserveProgressNote: null,
  };
  const lines = fs.readFileSync(snapPath, "utf8").split(/\r?\n/).filter((l) => l.length > 0);
  const headerRow = lines[2]?.split(",").map((c) => c.trim()) ?? [];
  const expectedCore = sheetEmployeeExportHeaders(surveyAllOn).slice(0, -2);
  assert.deepEqual(
    headerRow,
    [...expectedCore],
    "docs/sheet-snapshots/gid-0.csv 3행 헤더가 sheetEmployeeExportHeaders(조사표 전부 ON, 레벨·예상 인센 제외)와 일치해야 함"
  );
}

console.log("sheet-parity: OK");
