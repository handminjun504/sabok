/**
 * 운영상황 보고서(별지 제15호서식) 정합성 검증 + 스펙 JSON 직렬화.
 *
 * 스펙 정의 7개 검증:
 *  1. ㉟ === ⑬ + ⑮ + ㉙
 *  2. ㉘ === ⑳
 *  3. ㊱+㊲+㊴+㊵ <= ⑨ + ⑩
 *  4. 사용현황 매트릭스의 1인당 금액 = 금액 ÷ 인원
 *  5. ⑬+⑮ 가 자본금×2보다 작으면 ㉛ 산식 한도 0
 *  6. ㊳+㊶ <= ㉚, (㊷+...+㊽ 합) <= ㉜  (사용현황 ≤ 한도)
 *  7. ⑫·⑨ 비율 ≥ 200만원 AND 협력업체 사용 시에만 ㉜ 적용 가능
 *
 * 모든 비교는 **원 단위**로 수행하며, 결과/리포트는 **천원 단위**로 변환.
 */

import type {
  CompanySettings,
  JournalAggregate,
  JournalMappingTarget,
  RealEstateHolding,
  SpecOperatingReportJson,
  Tenant,
} from "@/types/models";
import { describeMappingTarget, toThousand } from "./journal-ingest";
import type { OperatingReportView } from "./operating-report";

export type ValidationCheck = {
  /** 항목 식별자(스펙 표기 유지) */
  id:
    | "FUND_SOURCE_TOTAL"
    | "FUND_OP_VS_BASE_ASSET"
    | "VENDOR_HEADCOUNT"
    | "USAGE_PER_HEAD"
    | "EXCESS_CAPITAL_LIMIT"
    | "USAGE_LIMITS"
    | "PREV_BASE_ASSET_APPLICABLE";
  label: string;
  expected: number;
  actual: number;
  /** 두 값이 일치(또는 조건 만족)하면 OK */
  ok: boolean;
  /** 부가 설명(왜 실패했는지) */
  detail?: string;
};

export type ValidationResult = {
  overall: "PASS" | "FAIL";
  checks: ValidationCheck[];
};

const APPROX_EQ_TOLERANCE = 1; // 원

function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) <= APPROX_EQ_TOLERANCE;
}

/**
 * 7개 정합성 검증.
 * @param view computeOperatingReportView 결과(원 단위)
 * @param tenant 자본금/구분 입력
 * @param settings 협력업체 사용 여부
 */
export function validateOperatingReport(args: {
  view: OperatingReportView;
  tenant: Tenant | null;
  settings: CompanySettings | null;
}): ValidationResult {
  const { view, tenant, settings } = args;
  const checks: ValidationCheck[] = [];

  /** 1. ㉟ = ⑬ + ⑮ + ㉙ */
  {
    const expected = view.baseAsset.employerContribution + view.baseAsset.nonEmployerContribution + view.fundSource.operationIncome;
    const actual = view.fundSource.total;
    checks.push({
      id: "FUND_SOURCE_TOTAL",
      label: "㉟ 합계 = ⑬ + ⑮ + ㉙",
      expected,
      actual,
      ok: approxEq(expected, actual),
      detail: approxEq(expected, actual)
        ? undefined
        : `재원 합계가 출연금+기금운용수익금과 차이(${(actual - expected).toLocaleString("ko-KR")}원)`,
    });
  }

  /** 2. ㉘ = ⑳ */
  {
    const expected = view.baseAsset.currentYearEndTotal;
    const actual = view.fundOperation.total;
    checks.push({
      id: "FUND_OP_VS_BASE_ASSET",
      label: "㉘ 운용방법 합계 = ⑳ 당해 기본재산",
      expected,
      actual,
      ok: approxEq(expected, actual),
      detail: approxEq(expected, actual)
        ? undefined
        : `운용방법 합계가 당해 기본재산과 일치하지 않음 (차이 ${(actual - expected).toLocaleString("ko-KR")}원)`,
    });
  }

  /** 3. ㊱+㊲+㊴+㊵ ≤ ⑨ + ⑩ — 협력업체 인원 합계가 전체 근로자 수 이하 */
  {
    const u80h = view.usage.u80.recipientCount;
    const u90h = view.usage.u90.recipientCount;
    /** ㊱+㊴ = 협력업체 사용 인원, ㊲+㊵ = 우리쪽 인원 등 단순화하여 모두 합산 */
    const sum = u80h + u90h;
    const cap = view.basic.employeeCount + (view.basic.vendorEmployeeCount ?? 0);
    checks.push({
      id: "VENDOR_HEADCOUNT",
      label: "㉚ 사용현황 인원 ≤ ⑨ + ⑩",
      expected: cap,
      actual: sum,
      ok: sum <= cap,
      detail: sum <= cap ? undefined : `사용현황 인원(${sum}명)이 전체 근로자 수(${cap}명)를 초과`,
    });
  }

  /** 4. 1인당 금액 정합 (㉚/㉜ 매트릭스의 amount/recipientCount 가 perHead 와 일치) */
  {
    const cells = [view.usage.u80, view.usage.u90, view.usage.u20, view.usage.u25, view.usage.u30];
    let ok = true;
    let detail = "";
    for (const c of cells) {
      if (c.recipientCount > 0) {
        const ph = Math.floor(c.amount / c.recipientCount);
        if (Math.abs(ph - c.perHead) > 1) {
          ok = false;
          detail = `1인당 금액 계산 오류: amount=${c.amount}, count=${c.recipientCount}, perHead=${c.perHead}`;
          break;
        }
      }
    }
    checks.push({
      id: "USAGE_PER_HEAD",
      label: "사용현황 1인당 금액 = 금액 ÷ 인원",
      expected: 0,
      actual: ok ? 0 : 1,
      ok,
      detail: ok ? undefined : detail,
    });
  }

  /** 5. ⑬+⑮ < 자본금×2 → ㉛ 산식 한도 0 */
  {
    const capital = view.basic.headOfficeCapital;
    const contrib = view.baseAsset.employerContribution + view.baseAsset.nonEmployerContribution;
    const limit = Math.max(0, view.baseAsset.currentYearEndTotal - Math.floor(capital * 0.5));
    if (capital > 0 && contrib < capital * 2) {
      const ok = view.fundSource.excessCapitalUsage <= limit + APPROX_EQ_TOLERANCE;
      checks.push({
        id: "EXCESS_CAPITAL_LIMIT",
        label: "㉛ 자본금 50% 초과액 산식 한도 준수",
        expected: limit,
        actual: view.fundSource.excessCapitalUsage,
        ok,
        detail: ok ? undefined : `㉛이 한도(${limit.toLocaleString("ko-KR")}원)를 초과`,
      });
    } else {
      checks.push({
        id: "EXCESS_CAPITAL_LIMIT",
        label: "㉛ 자본금 50% 초과액 산식 한도 준수",
        expected: limit,
        actual: view.fundSource.excessCapitalUsage,
        ok: true,
      });
    }
  }

  /** 6. ㊳ + ㊶ ≤ ㉚, ㊷~㊽ ≤ ㉜ — 사용액 ≤ 한도 */
  {
    const usage80Plus90 = view.usage.u80.vendorWelfareAmount + view.usage.u90.vendorWelfareAmount;
    const usage20Plus = view.usage.u20.vendorWelfareAmount + view.usage.u25.vendorWelfareAmount + view.usage.u30.vendorWelfareAmount;
    const cap1 = view.fundSource.contribUsageAmount;
    const cap2 = view.fundSource.prevBaseAssetUsageAmount;
    const ok = usage80Plus90 <= cap1 + APPROX_EQ_TOLERANCE && usage20Plus <= cap2 + APPROX_EQ_TOLERANCE;
    checks.push({
      id: "USAGE_LIMITS",
      label: "협력업체 복리후생 사용액 ≤ ㉚/㉜ 한도",
      expected: cap1 + cap2,
      actual: usage80Plus90 + usage20Plus,
      ok,
      detail: ok
        ? undefined
        : `사용액(${(usage80Plus90 + usage20Plus).toLocaleString("ko-KR")}원)이 한도(${(cap1 + cap2).toLocaleString("ko-KR")}원)를 초과`,
    });
  }

  /** 7. ㉜ 적용 요건: 직전 기본재산÷⑨ ≥ 200만원 AND 협력업체 사용 */
  {
    const prevTotal = view.baseAsset.prevYearEndTotal;
    const empCount = view.basic.employeeCount;
    const perCapita = empCount > 0 ? prevTotal / empCount : 0;
    const applied = settings?.vendorWelfareApplied ?? false;
    const required = view.fundSource.prevBaseAssetUsageAmount > 0;
    const eligible = perCapita >= 2_000_000 && applied;
    const ok = !required || eligible;
    checks.push({
      id: "PREV_BASE_ASSET_APPLICABLE",
      label: "㉜ 적용 요건(⑫÷⑨ ≥ 200만원 AND 협력업체 적용)",
      expected: 1,
      actual: ok ? 1 : 0,
      ok,
      detail: ok
        ? undefined
        : `㉜ 사용액(${view.fundSource.prevBaseAssetUsageAmount.toLocaleString("ko-KR")}원) > 0 이지만 적용 요건 미충족 ` +
          `(⑫÷⑨ = ${empCount > 0 ? Math.round(perCapita).toLocaleString("ko-KR") : "—"}원, 협력업체 적용=${applied ? "있음" : "없음"})`,
    });
  }

  // tenant 는 현재 검증에서 직접 사용하지 않으나, 향후 자본금 한도 등 재산 외 검증에서 사용
  void tenant;

  const overall: "PASS" | "FAIL" = checks.every((c) => c.ok) ? "PASS" : "FAIL";
  return { overall, checks };
}

/**
 * 스펙 JSON 직렬화. 모든 금액은 **천원** 단위.
 */
export function serializeToSpecJson(args: {
  view: OperatingReportView;
  tenant: Tenant | null;
  settings: CompanySettings | null;
  realEstate: RealEstateHolding[];
  validation: ValidationResult;
  journal?: JournalAggregate | null;
}): SpecOperatingReportJson {
  const { view, tenant, settings, realEstate, validation, journal } = args;

  const t = (n: number) => toThousand(n);

  const labelByCode: Record<number, string> = {
    57: "주택구입·임차자금",
    58: "우리사주",
    59: "생활안정자금",
    60: "장학금",
    61: "재난구호금",
    62: "체육·문화활동",
    63: "모성보호",
    64: "근로자의날",
    65: "근로복지시설",
    66: "그 밖의 복지비",
  };

  /** 사업실적 항목별 객체 생성 */
  const bizMap = new Map<number, { 금액: number; 수혜자수: number }>();
  for (const it of view.biz.items) {
    bizMap.set(it.code, { 금액: t(it.purposeAmount), 수혜자수: it.purposeCount });
  }

  /** ⑲ 소계 = 자동 계산값. computeOperatingReportView 의 baseAsset.subtotal 을 사용 */
  const baseAssetSubtotal =
    view.baseAsset.employerContribution +
    view.baseAsset.investReturnAndCarryover +
    view.baseAsset.nonEmployerContribution +
    view.baseAsset.mergerIn -
    view.baseAsset.baseAssetUsed -
    view.baseAsset.splitOut;

  const ratioContribLabel = `${view.fundSource.contribUsageRatio}%` as "50%" | "80%" | "90%";
  const ratioPrevLabel =
    view.fundSource.prevBaseAssetUsageAmount > 0
      ? (`${view.fundSource.prevBaseAssetUsageRatio}%` as "20%" | "25%" | "30%")
      : null;

  /** 협력업체 사용 현황 — settings 기반 ratio 에 따라 해당 객체만 채움 */
  const vendorBlock: SpecOperatingReportJson["협력업체사용현황"] = {
    적용여부: settings?.vendorWelfareApplied ?? false,
    출연금80범위: null,
    출연금90범위: null,
    기본재산20범위: null,
    기본재산25범위: null,
    기본재산30범위: null,
  };
  if (settings?.vendorWelfareApplied) {
    if (view.fundSource.contribUsageRatio === 80) {
      vendorBlock.출연금80범위 = {
        "㊱출연금": t(view.fundSource.contribUsageAmount),
        "㊲복지혜택협력업체수": view.basic.vendorEmployeeCount,
        "㊳복리후생사용금액": t(view.usage.u80.vendorWelfareAmount),
      };
    } else if (view.fundSource.contribUsageRatio === 90) {
      vendorBlock.출연금90범위 = {
        "㊴출연금": t(view.fundSource.contribUsageAmount),
        "㊵복지혜택협력업체수": view.basic.vendorEmployeeCount,
        "㊶복리후생사용금액": t(view.usage.u90.vendorWelfareAmount),
      };
    }
    if (view.fundSource.prevBaseAssetUsageRatio === 20 && view.fundSource.prevBaseAssetUsageAmount > 0) {
      vendorBlock.기본재산20범위 = {};
    } else if (view.fundSource.prevBaseAssetUsageRatio === 25) {
      vendorBlock.기본재산25범위 = {};
    } else if (view.fundSource.prevBaseAssetUsageRatio === 30) {
      vendorBlock.기본재산30범위 = {};
    }
  }

  /** 매핑로그 (분개장이 있을 때만) */
  const mappingLog = (journal?.mappingLog ?? [])
    .filter((m) => m.target.kind !== "CASH_FLOW")
    .map((m) => ({
      원계정명: m.account,
      매핑항목: describeMappingTarget(m.target as JournalMappingTarget),
      금액: t(m.amount),
    }));

  return {
    기금법인: {
      "①기금법인명": tenant?.name ?? "",
      "②인가번호": tenant?.approvalNumber ?? "",
      "⑨소속근로자수": view.basic.employeeCount,
      "⑩협력업체근로자수": view.basic.vendorEmployeeCount,
      "⑪납입자본금": t(view.basic.headOfficeCapital),
    },
    기본재산현황: {
      "⑫직전기본재산": t(view.baseAsset.prevYearEndTotal),
      "⑬사업주출연": t(view.baseAsset.employerContribution),
      "⑭수익금이월금전입": t(view.baseAsset.investReturnAndCarryover),
      "⑮사업주외의자출연": t(view.baseAsset.nonEmployerContribution),
      "⑯기금법인합병": t(view.baseAsset.mergerIn),
      "⑰기본재산사용": t(view.baseAsset.baseAssetUsed),
      "⑱기금법인분할등": t(view.baseAsset.splitOut),
      "⑲소계": t(baseAssetSubtotal),
      "⑳해당회계연도기본재산": t(view.baseAsset.currentYearEndTotal),
    },
    기금운용관리: {
      "㉑금융회사예입예탁": t(view.fundOperation.deposit),
      "㉒투자신탁수익증권": t(view.fundOperation.trust),
      "㉓유가증권매입": t(view.fundOperation.security),
      "㉔자사주유상증자": t(view.fundOperation.ownStock),
      "㉕부동산투자회사주식": t(view.fundOperation.reit),
      "㉖기타": t(view.fundOperation.etc),
      "㉗근로자대부": t(view.fundOperation.loan),
      "㉘합계": t(view.fundOperation.total),
    },
    기금사업재원: {
      "㉙기금운용수익금": t(view.fundSource.operationIncome),
      "㉚출연금범위": t(view.fundSource.contribUsageAmount),
      "㉚적용비율": ratioContribLabel,
      "㉛자본금50초과액": t(view.fundSource.excessCapitalUsage),
      "㉜직전기본재산범위": t(view.fundSource.prevBaseAssetUsageAmount),
      "㉜적용비율": ratioPrevLabel,
      "㉝공동근로복지기금": t(view.fundSource.jointFundSupport),
      "㉞이월금등": t(view.fundSource.carryover),
      "㉟합계": t(view.fundSource.total),
    },
    협력업체사용현황: vendorBlock,
    사업실적: {
      "◯57주택구입임차자금": bizMap.get(57) ?? { 금액: 0, 수혜자수: 0 },
      "◯58우리사주": bizMap.get(58) ?? { 금액: 0, 수혜자수: 0 },
      "◯59생활안정자금": bizMap.get(59) ?? { 금액: 0, 수혜자수: 0 },
      "◯60장학금": bizMap.get(60) ?? { 금액: 0, 수혜자수: 0 },
      "◯61재난구호금": bizMap.get(61) ?? { 금액: 0, 수혜자수: 0 },
      "◯62체육문화활동": bizMap.get(62) ?? { 금액: 0, 수혜자수: 0 },
      "◯63모성보호": bizMap.get(63) ?? { 금액: 0, 수혜자수: 0 },
      "◯64근로자의날": bizMap.get(64) ?? { 금액: 0, 수혜자수: 0 },
      "◯65근로복지시설": bizMap.get(65) ?? { 금액: 0, 수혜자수: 0 },
      "◯66그밖의복지비": bizMap.get(66) ?? { 금액: 0, 수혜자수: 0 },
      "◯67소계": {
        금액: t(view.biz.subtotal),
        수혜자수: view.biz.items.reduce((s, it) => s + it.purposeCount, 0),
      },
      "◯68기금운영비": t(view.biz.operationCost),
      "◯69잔액": t(view.biz.balance),
      "◯70합계": t(view.biz.total),
    },
    선택적복지비: {
      "◯71금액": t(view.biz.optionalAmount),
      "◯72수혜자수": view.biz.optionalRecipients,
    },
    부동산현황: realEstate
      .slice()
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      .map((r) => ({
        번호: r.seq,
        명칭: r.name ?? "",
        금액: t(Number(r.amount ?? 0)),
        취득일: r.acquiredAt ?? null,
      })),
    정합성검증: {
      결과: validation.overall,
      검증항목: validation.checks.map((c) => ({
        항목: c.label,
        기대값: t(c.expected),
        실제값: t(c.actual),
        결과: c.ok ? "OK" : "NG",
      })),
    },
    매핑로그: mappingLog,
    경고및확인필요사항: [...view.warnings, ...(journal?.warnings ?? [])],
  };

  /** labelByCode 사용 (현재는 직접 키 매핑하므로 placeholder, 향후 동적 키 생성 시 사용) */
  void labelByCode;
}
