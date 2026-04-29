/**
 * 엔씨컨설팅 샘플로 운영상황 보고서 자동 산출 검증.
 * 접수증 vs 자동값 비교(천원 단위).
 */
import * as fs from "node:fs";
import pdfParse from "pdf-parse";
import {
  aggregateJournalForOperatingReport,
  parsePdfJournalText,
  toThousand,
} from "../src/lib/domain/journal-ingest";
import { computeOperatingReportView } from "../src/lib/domain/operating-report";

async function main() {
  const journalPath = "/Volumes/경청/★정책경리/2025사복 연말보고/엔씨컨설팅/엔씨 분개장.pdf";
  const text = (await pdfParse(fs.readFileSync(journalPath))).text;
  const j = parsePdfJournalText(text);
  const agg = aggregateJournalForOperatingReport({
    entries: j.entries,
    tenant: { name: "(주)엔씨컨설팅" },
    employees: [],
  });

  /** 엔씨 접수증 기준값(천원) */
  const expected = {
    "⑫ 직전 기본재산": 1621,
    "⑬ 사업주 출연": 321000,
    "⑲ 소계": 0, // 자동 계산되므로 이번엔 검증 생략
    "⑳ 당해 기본재산": 1622,
    "㉙ 기금운용 수익금": 12,
    "㉚ 출연금 80% 범위": 256800,
    "㉛ 자본금 50% 초과액": 0,
    "㉜ 직전 기본재산 20% 범위": 64200,
    "㉟ 합계": 321012,
    "◯57 주택구입": 0,
    "◯59 생활안정자금": 137001, // 분개장 기준 (접수증은 104,849으로 수기 재배분)
    "◯60 장학금": 60001,
    "◯62 체육문화": 8000,
    "◯64 근로자의날": 9501,
    "◯66 그밖의복지비": 104850,
    "◯67 소계": 319352,
    "◯68 운영비": 82,
    "◯69 잔액": 1578, // = ⑳ - ⑫ 정도
    "◯70 합계": 321012,
  };

  /** computeOperatingReportView 실행 (PB 데이터 없이 빈 기본값) */
  const view = computeOperatingReportView({
    tenant: {
      id: "x",
      tenantId: "x",
      name: "(주)엔씨컨설팅 사내근로복지기금",
      approvalNumber: "",
      incorporationDate: "2022-01-01",
      ceoName: "",
      industry: "",
      addressLine: "",
      phone: "",
      headOfficeCapital: 5000000, // 5,000천원
      accountingYearStartMonth: 1,
      clientEntityType: "CORPORATE",
    } as never,
    settings: {
      vendorWelfareApplied: true,
      vendorWelfareRatio: 80,
    } as never,
    year: 2025,
    inputs: {
      baseAsset: {
        prevYearEndTotal: 1621000, // 천원→원
        employerContributionOverride: null,
        nonEmployerContributionOverride: null,
        investReturnAndCarryover: 0,
        mergerIn: 0,
        splitOut: 0,
        currentYearEndTotalOverride: null,
      } as never,
      fundOperation: {
        deposit: 1622000,
        trust: 0,
        security: 0,
        ownStock: 0,
        reit: 0,
        etc: 0,
        loan: 0,
      } as never,
      fundSource: null,
      usage: null,
      biz: null,
      realEstate: [],
    },
    prevBaseAsset: null,
    prevFundSource: null,
    autos: {
      autoEmployerContribution: 0,
      autoNonEmployerContribution: 0,
      autoBaseAssetUsed: 0,
      autoEmployeeCount: 11,
      legalAllocByCode: new Map(),
      autoCeoName: null,
      autoOptionalRecipients: 0,
      journalAggregate: agg,
    },
  });

  console.log("=== 엔씨 회귀 검증 (단위: 천원) ===\n");
  const cmp = (label: string, expectedKey: keyof typeof expected, actual: number) => {
    const exp = expected[expectedKey];
    const ok = exp === actual;
    console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(30)} expected=${exp.toLocaleString("ko-KR").padStart(10)} actual=${actual.toLocaleString("ko-KR").padStart(10)}${ok ? "" : "  ← 차이"}`);
  };

  cmp("⑬ 사업주 출연", "⑬ 사업주 출연", toThousand(view.baseAsset.employerContribution));
  cmp("㉙ 기금운용 수익금", "㉙ 기금운용 수익금", toThousand(view.fundSource.operationIncome));
  cmp("㉚ 출연금 80% 범위", "㉚ 출연금 80% 범위", toThousand(view.fundSource.contribUsageAmount));
  cmp("㉛ 자본금 50% 초과액", "㉛ 자본금 50% 초과액", toThousand(view.fundSource.excessCapitalUsage));
  cmp("㉜ 직전 기본재산 20% 범위", "㉜ 직전 기본재산 20% 범위", toThousand(view.fundSource.prevBaseAssetUsageAmount));
  cmp("㉟ 합계", "㉟ 합계", toThousand(view.fundSource.total));

  for (const it of view.biz.items) {
    if (it.purposeAmount === 0) continue;
    const key = `◯${it.code} ${it.label.split(" ")[0]}` as keyof typeof expected;
    if (key in expected) {
      cmp(`◯${it.code} ${it.label}`, key, toThousand(it.purposeAmount));
    } else {
      console.log(`    (확인) ◯${it.code} ${it.label}: ${toThousand(it.purposeAmount).toLocaleString("ko-KR")}천원, ${it.purposeCount}명`);
    }
  }

  cmp("◯67 소계", "◯67 소계", toThousand(view.biz.subtotal));
  cmp("◯68 운영비", "◯68 운영비", toThousand(view.biz.operationCost));
  cmp("◯70 합계", "◯70 합계", toThousand(view.biz.total));

  console.log("\n=== 경고 ===");
  for (const w of view.warnings) {
    console.log(" -", w);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
