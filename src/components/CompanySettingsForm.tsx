"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveCompanySettingsAction, type SettingsState } from "@/app/actions/settings";
import { SALARY_INCLUSION_VARIANCE_MODES } from "@/lib/domain/salary-inclusion-display";
import type { SalaryInclusionVarianceMode } from "@/types/models";

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
  accrualCurrentMonthPayNext: boolean;
  varianceMode: SalaryInclusionVarianceMode;
  surveyShowRepReturn: boolean;
  surveyShowSpouseReceipt: boolean;
  surveyShowWorkerNet: boolean;
  /** 내장 정기 4종 귀속월 — undefined 면 기본값(2/5/8/11). */
  fixedEventMonths?: Partial<Record<"NEW_YEAR_FEB" | "FAMILY_MAY" | "CHUSEOK_AUG" | "YEAR_END_NOV", number>>;
  /** 분기 항목별 지급 월 — undefined/null 이면 기본값 [3,6,9,12]. */
  quarterlyPayMonths?: Partial<Record<QuarterlyItemKey, number[]>>;
};

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
  accrualCurrentMonthPayNext,
  varianceMode,
  surveyShowRepReturn,
  surveyShowSpouseReceipt,
  surveyShowWorkerNet,
  fixedEventMonths,
  quarterlyPayMonths,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<SettingsState, FormData>(saveCompanySettingsAction, null);

  useEffect(() => {
    if (state?.성공) {
      router.refresh();
    }
  }, [state?.성공, router]);

  return (
    <div className="space-y-3">
      {state?.오류 ? <p className="text-sm text-[var(--danger)]">{state.오류}</p> : null}
      {state?.성공 ? <p className="text-sm text-[var(--success)]">저장되었습니다.</p> : null}
      <form
        key={[
          foundingMonth,
          defaultPayDay,
          activeYear,
          accrualCurrentMonthPayNext,
          varianceMode,
          surveyShowRepReturn,
          surveyShowSpouseReceipt,
          surveyShowWorkerNet,
          fixedEventMonths?.NEW_YEAR_FEB ?? "",
          fixedEventMonths?.FAMILY_MAY ?? "",
          fixedEventMonths?.CHUSEOK_AUG ?? "",
          fixedEventMonths?.YEAR_END_NOV ?? "",
          JSON.stringify(quarterlyPayMonths ?? {}),
        ].join("|")}
        action={formAction}
        className="space-y-3"
      >
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
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="accrualCurrentMonthPayNext" defaultChecked={accrualCurrentMonthPayNext} />
        당월 귀속·차월 지급 (정기분 표시)
      </label>

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
          끄면 직원 목록·조사표 CSV·직원 상세(알아서 금액 자동 옆 체크)에서 해당 열·입력이 숨겨집니다.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" name="surveyShowRepReturn" defaultChecked={surveyShowRepReturn} />
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

        <button type="submit" className="btn btn-primary">
          저장
        </button>
      </form>
    </div>
  );
}
