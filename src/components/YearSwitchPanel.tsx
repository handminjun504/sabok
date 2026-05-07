"use client";

import { useActionState, useState } from "react";
import { changeActiveYearAction, type ChangeYearResult } from "@/app/actions/changeYear";

export function YearSwitchPanel({
  currentYear,
  canEdit,
}: {
  currentYear: number;
  canEdit: boolean;
}) {
  const [result, formAction, pending] = useActionState<ChangeYearResult | null, FormData>(
    changeActiveYearAction,
    null,
  );
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const years: number[] = [];
  const cy = new Date().getFullYear();
  for (let y = cy + 1; y >= cy - 4; y--) years.push(y);

  if (!canEdit) return null;

  return (
    <form action={formAction} className="surface dash-panel-pad space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--text)]">기준 연도 변경</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          현재 기준 연도: <strong className="text-[var(--text)]">{currentYear}년</strong>.
          새 연도를 선택하면 스케줄·지급 규칙·운영 보고 전체가 해당 연도 기준으로 바뀝니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="dash-field-label">새 기준 연도</label>
          <select
            name="year"
            className="input text-sm"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="copy"
              defaultChecked
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="font-semibold text-[var(--text)]">이전 연도({currentYear}년) 데이터 복사</span>
              <span className="ml-1 text-[var(--muted)]">— 레벨 규칙·목표액·분기 요율·분기 대상자</span>
            </span>
          </label>
          <p className="ml-6 text-[0.7rem] leading-snug text-[var(--muted)]">
            체크 해제 시 새 연도를 빈 상태로 시작합니다. 직원 정보는 연도와 무관하게 유지됩니다.
          </p>
        </div>
      </div>

      {result?.ok === false && (
        <p className="text-sm text-[var(--danger)]">{result.오류}</p>
      )}
      {result?.ok === true && (
        <p className="text-sm text-[var(--success)]">
          {result.year}년으로 변경되었습니다.
          {result.copied ? " 이전 연도 데이터가 복사되었습니다." : ""}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || selectedYear === currentYear}
        className="btn btn-primary text-sm disabled:opacity-50"
      >
        {pending ? "변경 중…" : `${selectedYear}년으로 변경`}
      </button>
      {selectedYear === currentYear && (
        <p className="text-xs text-[var(--muted)]">현재 연도와 같습니다.</p>
      )}
    </form>
  );
}
