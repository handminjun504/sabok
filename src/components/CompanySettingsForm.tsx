"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveCompanySettingsAction, type SettingsState } from "@/app/actions/settings";
import { SALARY_INCLUSION_VARIANCE_MODES } from "@/lib/domain/salary-inclusion-display";
import type { SalaryInclusionVarianceMode } from "@/types/models";

type Props = {
  foundingMonth: number;
  defaultPayDay: number;
  activeYear: number;
  accrualCurrentMonthPayNext: boolean;
  varianceMode: SalaryInclusionVarianceMode;
};

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
        key={[foundingMonth, defaultPayDay, activeYear, accrualCurrentMonthPayNext, varianceMode].join("|")}
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
        <button type="submit" className="btn btn-primary">
          저장
        </button>
      </form>
    </div>
  );
}
