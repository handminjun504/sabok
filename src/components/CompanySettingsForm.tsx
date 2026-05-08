"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCompanySettingsAction, type SettingsState } from "@/app/actions/settings";
import { SALARY_INCLUSION_VARIANCE_MODES } from "@/lib/domain/salary-inclusion-display";
import { defaultFeeRate } from "@/lib/domain/fee-billing";
import type { TenantClientEntityType } from "@/lib/domain/tenant-profile";
import type {
  FeeBillingMode,
  FeeRateBreakpoint,
  SalaryInclusionVarianceMode,
} from "@/types/models";

type QuarterlyItemKey = "INFANT_SCHOLARSHIP" | "PRESCHOOL_SCHOLARSHIP" | "TEEN_SCHOLARSHIP" | "PARENT_SUPPORT" | "HEALTH_INSURANCE" | "HOUSING_INTEREST" | "HOUSING_RENT";

const QUARTERLY_ITEM_LABELS_SHORT: Record<QuarterlyItemKey, string> = {
  INFANT_SCHOLARSHIP: "영유아 장학금",
  PRESCHOOL_SCHOLARSHIP: "미취학 장학금",
  TEEN_SCHOLARSHIP: "청소년 장학금",
  PARENT_SUPPORT: "부모 봉양",
  HEALTH_INSURANCE: "건강보험",
  HOUSING_INTEREST: "주택이자",
  HOUSING_RENT: "월세",
};

const ALL_QUARTERLY_KEYS: QuarterlyItemKey[] = ["INFANT_SCHOLARSHIP", "PRESCHOOL_SCHOLARSHIP", "TEEN_SCHOLARSHIP", "PARENT_SUPPORT", "HEALTH_INSURANCE", "HOUSING_INTEREST", "HOUSING_RENT"];
const MONTHS_1_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const DEFAULT_QUARTERLY_PAY_MONTHS: readonly number[] = [3, 6, 9, 12];

type Props = {
  foundingMonth: number;
  defaultPayDay: number;
  activeYear: number;
  varianceMode: SalaryInclusionVarianceMode;
  surveyShowRepReturn: boolean;
  surveyShowSpouseReceipt: boolean;
  surveyShowWorkerNet: boolean;
  /** 내장 정기 4종 귀속월 — undefined 면 기본값(2/5/8/11). */
  fixedEventMonths?: Partial<Record<"NEW_YEAR_FEB" | "FAMILY_MAY" | "CHUSEOK_AUG" | "YEAR_END_NOV", number>>;
  /** 분기 항목별 지급 월 — undefined/null 이면 기본값 [3,6,9,12]. */
  quarterlyPayMonths?: Partial<Record<QuarterlyItemKey, number[]>>;
  /** 월별 발생 인센 자동 변환 비율(세후 비율, %) — 1~100, null=비활성. */
  incentiveNetRatioPercent?: number | null;
  /** 거래처 구분 — 수수료 디폴트 요율(개인 10/법인 2) placeholder 안내에만 사용. */
  clientEntityType: TenantClientEntityType;
  /** 사복 운영 수수료 요율(%) — null 이면 거래처 디폴트로 폴백. 0.1~100. */
  feeRatePercent?: number | null;
  /** 수수료 청구 방식 — `EVEN_12` | `ON_PAY_MONTH`. */
  feeBillingMode?: FeeBillingMode;
  /**
   * 사복 금액 변동·요율 변경 시 적용할 「2월~12월부터 시작하는 변경점」.
   * 1월은 위쪽 `feeRatePercent` 가 곧 시작 요율이므로 별도 행을 만들지 않는다.
   * 비어 있으면 단일 요율로 동작.
   */
  feeRateBreakpoints?: FeeRateBreakpoint[] | null;
};

const BREAKPOINT_MONTH_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const FIXED_EVENT_FIELDS: { key: "NEW_YEAR_FEB" | "FAMILY_MAY" | "CHUSEOK_AUG" | "YEAR_END_NOV"; label: string; defaultMonth: number }[] = [
  { key: "NEW_YEAR_FEB", label: "연초·신년", defaultMonth: 2 },
  { key: "FAMILY_MAY", label: "가정의 달·근로자의 날", defaultMonth: 5 },
  { key: "CHUSEOK_AUG", label: "추석", defaultMonth: 8 },
  { key: "YEAR_END_NOV", label: "연말", defaultMonth: 11 },
];

/**
 * 저장 후 서버 데이터와 동기화: `defaultValue`는 리마운트 시에만 반영되므로
 * 부모가 넘기는 `key`(설정 스냅샷)로 리프레시 시 폼을 다시 붙인다.
 */
export function CompanySettingsForm({
  foundingMonth,
  defaultPayDay,
  activeYear,
  varianceMode,
  surveyShowRepReturn,
  surveyShowSpouseReceipt,
  surveyShowWorkerNet,
  fixedEventMonths,
  quarterlyPayMonths,
  incentiveNetRatioPercent = null,
  clientEntityType,
  feeRatePercent = null,
  feeBillingMode = "EVEN_12",
  feeRateBreakpoints = null,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<SettingsState, FormData>(saveCompanySettingsAction, null);

  /**
   * 「수수료 변경점」 — 1월은 별도 행 없이 위 `feeRatePercent` 입력란이 시작 요율 역할.
   * 여기서는 fromMonth ≥ 2 인 변경점만 가변 행으로 관리한다.
   * 빈 배열이면 「변경점 없음」(단일 요율 모드).
   */
  const initialExtraBreakpoints: FeeRateBreakpoint[] = (feeRateBreakpoints ?? [])
    .filter((b) => Number.isFinite(b?.fromMonth) && b.fromMonth >= 2 && b.fromMonth <= 12)
    .filter((b) => Number.isFinite(b?.ratePercent) && b.ratePercent > 0 && b.ratePercent <= 100)
    .sort((a, b) => a.fromMonth - b.fromMonth);
  const [extraBreakpoints, setExtraBreakpoints] = useState<FeeRateBreakpoint[]>(initialExtraBreakpoints);

  /** 폼 key 변경(저장 후 부모가 새 데이터를 내려줄 때) 시 변경점 행도 다시 동기화. */
  useEffect(() => {
    setExtraBreakpoints(initialExtraBreakpoints);
    /** initialExtraBreakpoints 는 매 렌더 새 객체라 의존성으로 두지 않고 stringify 비교. */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [JSON.stringify(feeRateBreakpoints ?? [])]);

  useEffect(() => {
    if (state?.성공) {
      router.refresh();
    }
  }, [state?.성공, router]);

  function handleAddBreakpoint() {
    /** 비어 있는 첫 후보 월(2~12 중 아직 안 쓰는 월)을 자동 선택. */
    const used = new Set(extraBreakpoints.map((b) => b.fromMonth));
    const next = BREAKPOINT_MONTH_OPTIONS.find((m) => !used.has(m));
    if (next == null) return;
    setExtraBreakpoints([
      ...extraBreakpoints,
      { fromMonth: next, ratePercent: feeRatePercent ?? defaultFeeRate(clientEntityType) },
    ]);
  }
  function handleChangeBreakpointMonth(idx: number, month: number) {
    setExtraBreakpoints(
      extraBreakpoints.map((b, i) => (i === idx ? { ...b, fromMonth: month } : b)),
    );
  }
  function handleChangeBreakpointRate(idx: number, rate: number) {
    setExtraBreakpoints(
      extraBreakpoints.map((b, i) => (i === idx ? { ...b, ratePercent: rate } : b)),
    );
  }
  function handleRemoveBreakpoint(idx: number) {
    setExtraBreakpoints(extraBreakpoints.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}
      <form
        key={[
          foundingMonth,
          defaultPayDay,
          activeYear,
          varianceMode,
          surveyShowRepReturn,
          surveyShowSpouseReceipt,
          surveyShowWorkerNet,
          fixedEventMonths?.NEW_YEAR_FEB ?? "",
          fixedEventMonths?.FAMILY_MAY ?? "",
          fixedEventMonths?.CHUSEOK_AUG ?? "",
          fixedEventMonths?.YEAR_END_NOV ?? "",
          JSON.stringify(quarterlyPayMonths ?? {}),
          incentiveNetRatioPercent ?? "",
          feeRatePercent ?? "",
          feeBillingMode,
          JSON.stringify(feeRateBreakpoints ?? []),
        ].join("|")}
        action={formAction}
        className="space-y-3"
      >
        {/**
         * 변경점 행은 가변 길이 — 폼 직렬화는 hidden input 한 묶음(`feeRateBreakpoint_${idx}_fromMonth/ratePercent`) 으로
         * 항상 현재 state 를 그대로 제출. 서버 액션은 동일한 prefix 만 모아 정규화 한다.
         */}
        {extraBreakpoints.map((b, idx) => (
          <div key={`bp-hidden-${idx}`} hidden>
            <input type="hidden" name={`feeRateBreakpoint_${idx}_fromMonth`} value={String(b.fromMonth)} />
            <input type="hidden" name={`feeRateBreakpoint_${idx}_ratePercent`} value={String(b.ratePercent)} />
          </div>
        ))}
      <div>
        <label className="dash-field-label">회사 창립월 (1~12)</label>
        <input
          name="foundingMonth"
          type="number"
          min={1}
          max={12}
          defaultValue={foundingMonth}
          className="input max-w-[8rem] text-xs"
        />
      </div>
      <div>
        <label className="dash-field-label">기본 급여일 (1~31)</label>
        <input
          name="defaultPayDay"
          type="number"
          min={1}
          max={31}
          defaultValue={defaultPayDay}
          className="input max-w-[8rem] text-xs"
        />
      </div>
      <div>
        <label className="dash-field-label">기준 연도</label>
        <input
          name="activeYear"
          type="number"
          defaultValue={activeYear}
          className="input max-w-[10rem] text-xs"
        />
      </div>
      <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]/50 p-3">
        <legend className="dash-field-label px-1">월별 발생 인센 — 세후 자동 변환 비율 (%)</legend>
        <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">
          월별 스케줄 → <strong className="text-[var(--text)]">월별 발생 인센</strong> 그리드에서 셀에 적은 금액을 자동으로
          이 비율만큼만 적용해 저장합니다. 예: <strong className="text-[var(--text)]">80</strong> 입력 시{" "}
          <strong className="text-[var(--text)]">1,000,000원 → 800,000원</strong>으로 저장. 비워 두거나 100 이면 변환 OFF.
          비율 변경은 <strong className="text-[var(--text)]">새 입력부터</strong> 적용되며, 이미 저장된 셀은 그대로 유지됩니다.
        </p>
        <div className="flex items-baseline gap-1">
          <input
            name="incentiveNetRatioPercent"
            type="number"
            min={1}
            max={100}
            step={1}
            placeholder="비활성"
            defaultValue={incentiveNetRatioPercent ?? ""}
            className="input w-[6rem] text-xs"
          />
          <span className="text-[0.7rem] text-[var(--muted)]">% (1~100, 비워 두면 변환 OFF)</span>
        </div>
      </fieldset>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]/50 p-3">
        <p className="dash-field-label mb-2">정기 지급 4종 — 귀속(=지급) 월</p>
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          업체별로 행사 월을 다르게 잡고 싶을 때 사용합니다. <strong className="text-[var(--text)]">비워 두면 기본값</strong>(2/5/8/11)이 적용됩니다.
          여기서 바꾼 월은 월별 스케줄·운영 보고·연간 합 모두에 즉시 반영됩니다.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FIXED_EVENT_FIELDS.map((f) => {
            const cur = fixedEventMonths?.[f.key];
            return (
              <div key={f.key} className="min-w-0">
                <label className="dash-field-label whitespace-nowrap text-[0.7rem]">{f.label}</label>
                <div className="flex items-baseline gap-1">
                  <input
                    name={`fixedEventMonth_${f.key}`}
                    type="number"
                    min={1}
                    max={12}
                    placeholder={`${f.defaultMonth}`}
                    defaultValue={cur ?? ""}
                    className="input w-[5rem] text-xs"
                  />
                  <span className="text-[0.7rem] text-[var(--muted)]">월</span>
                </div>
                <p className="mt-1 text-[0.65rem] text-[var(--muted)]">기본 {f.defaultMonth}월</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]/50 p-3">
        <p className="dash-field-label mb-2">조사표 표시 항목</p>
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          끄면 직원 목록·조사표 CSV·직원 상세에서 해당 열·입력이 숨겨집니다. 월별 금액 입력은{" "}
          <strong className="text-[var(--text)]">월별 스케줄 ▸ 「대표반환·배우자·알아서」 탭</strong>에서.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              name="surveyShowRepReturn"
              defaultChecked={surveyShowRepReturn}
            />
            <span className="text-[var(--text)]">대표반환</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" name="surveyShowSpouseReceipt" defaultChecked={surveyShowSpouseReceipt} />
            <span className="text-[var(--text)]">배우자수령</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" name="surveyShowWorkerNet" defaultChecked={surveyShowWorkerNet} />
            <span className="text-[var(--text)]">근로자 실질 수령</span>
          </label>
        </div>
      </div>

      <div>
        <span className="dash-field-label">급여포함신고·스케줄: 상한 대비 초과 / 미달 표시</span>
        <div className="mt-2 space-y-2">
          {SALARY_INCLUSION_VARIANCE_MODES.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3"
            >
              <input
                type="radio"
                name="salaryInclusionVarianceMode"
                value={opt.value}
                defaultChecked={varianceMode === opt.value}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="font-medium text-[var(--text)]">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]/50 p-3">
        <p className="dash-field-label mb-2">분기 지원 항목별 지급 월</p>
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          항목별로 어느 달에 지급할지 선택합니다. 빈 칸(미선택)이면 기본값{" "}
          <strong className="text-[var(--text)]">3·6·9·12월</strong>이 적용됩니다.
          여기서 설정한 달이 분기 지원금 대상자 체크 화면의 기본 지급 월로 사용됩니다.
        </p>
        <div className="space-y-3">
          {ALL_QUARTERLY_KEYS.map((key) => {
            const saved = quarterlyPayMonths?.[key];
            const selected = new Set(saved ?? DEFAULT_QUARTERLY_PAY_MONTHS);
            return (
              <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="w-28 shrink-0 text-xs font-semibold text-[var(--text)]">
                  {QUARTERLY_ITEM_LABELS_SHORT[key]}
                </span>
                <div className="flex flex-wrap gap-2">
                  {MONTHS_1_12.map((m) => (
                    <label
                      key={m}
                      className="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--text)]"
                    >
                      <input
                        type="checkbox"
                        name={`quarterlyPayMonth_${key}`}
                        value={String(m)}
                        defaultChecked={selected.has(m)}
                        className="size-3.5 rounded"
                      />
                      {m}월
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]/50 p-3">
        <p className="dash-field-label mb-2">사복 운영 수수료</p>
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          요율(%) 을 비우면 거래처 구분 디폴트(개인 10% / 법인 2%) 가 적용됩니다.
          청구 방식은 「매월 균등(연 수수료 ÷ 12)」 또는 「지급월 청구(그 달 사복 지급 base × 요율)」 중 선택.
          연중에 사복 금액이 바뀌어 청구액이 달라지면, 아래 「수수료 변경점」에 「N월부터 X%」을 추가해 구간별로 적용됩니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div>
            <label className="dash-field-label" htmlFor="feeRatePercent">수수료 요율 (%)</label>
            <input
              id="feeRatePercent"
              name="feeRatePercent"
              type="number"
              min={0}
              max={100}
              step={0.1}
              defaultValue={feeRatePercent ?? ""}
              placeholder={`디폴트 ${defaultFeeRate(clientEntityType)}`}
              className="input w-full text-sm tabular-nums"
            />
          </div>
          <div>
            <span className="dash-field-label">청구 방식</span>
            <div className="mt-1 space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-2.5">
                <input
                  type="radio"
                  name="feeBillingMode"
                  value="EVEN_12"
                  defaultChecked={feeBillingMode === "EVEN_12"}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="font-medium text-[var(--text)]">매월 균등 (연 수수료 ÷ 12)</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    연 base × 요율을 12 등분해 매월 동일 청구. 가장 일반적인 방식.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-2.5">
                <input
                  type="radio"
                  name="feeBillingMode"
                  value="ON_PAY_MONTH"
                  defaultChecked={feeBillingMode === "ON_PAY_MONTH"}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="font-medium text-[var(--text)]">지급월 청구 (그 달 base × 요율)</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    사복 지급액이 있는 달에만 그 달 base × 요율 만큼 청구. 무지급 월은 0 원.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* 수수료 변경점 — 사복 금액 / 요율 변경 시 N월부터 새 요율을 적용 */}
        <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text)]">수수료 변경점</p>
            <button
              type="button"
              className="btn btn-secondary px-2 py-1 text-[0.7rem]"
              onClick={handleAddBreakpoint}
              disabled={extraBreakpoints.length >= 11}
            >
              + 변경점 추가
            </button>
          </div>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--muted)]">
            「{1}월~」 은 위 「수수료 요율」 입력란이 자동으로 시작 요율로 사용됩니다. 여기에 추가하는 행은 그 이후
            구간(2월~12월 시작) 에 새 요율을 덮어쓰는 변경점입니다. EVEN_12 모드는 각 구간을 별도 균등 분배(rolling),
            ON_PAY_MONTH 모드는 그 달 요율로 청구합니다.
          </p>
          {extraBreakpoints.length === 0 ? (
            <p className="mt-2 text-[0.7rem] text-[var(--muted)]">— 변경점 없음. 1월 요율이 12개월 내내 적용됩니다.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {extraBreakpoints.map((b, idx) => {
                const usedByOthers = new Set(
                  extraBreakpoints.filter((_, i) => i !== idx).map((x) => x.fromMonth),
                );
                return (
                  <li key={`bp-${idx}`} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <select
                      className="input w-[6rem] text-xs"
                      value={b.fromMonth}
                      onChange={(e) => handleChangeBreakpointMonth(idx, Number(e.target.value))}
                    >
                      {BREAKPOINT_MONTH_OPTIONS.map((m) => (
                        <option key={m} value={m} disabled={m !== b.fromMonth && usedByOthers.has(m)}>
                          {m}월부터
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0.1}
                      max={100}
                      step={0.1}
                      value={b.ratePercent}
                      onChange={(e) => handleChangeBreakpointRate(idx, Number(e.target.value))}
                      className="input w-[6rem] text-xs tabular-nums"
                    />
                    <span className="text-[0.7rem] text-[var(--muted)]">%</span>
                    <button
                      type="button"
                      className="btn btn-secondary px-2 py-0.5 text-[0.7rem]"
                      onClick={() => handleRemoveBreakpoint(idx)}
                      aria-label={`${b.fromMonth}월부터 변경점 제거`}
                    >
                      삭제
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

        <button type="submit" className="btn btn-primary">
          저장
        </button>
      </form>
    </div>
  );
}
