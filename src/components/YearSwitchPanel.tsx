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
      <div className="grid gap-3">
        <div>
          <label className="dash-field-label">새 기준 연도</label>
          <select
            name="year"
            className="input text-sm w-full"
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

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            name="copy"
            defaultChecked
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="font-semibold text-[var(--text)]">{currentYear}년 데이터 복사</span>
          </span>
        </label>
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
        className="btn btn-primary text-sm w-full disabled:opacity-50"
      >
        {pending ? "변경 중…" : selectedYear === currentYear ? "현재 연도와 같음" : `${selectedYear}년으로 변경`}
      </button>
    </form>
  );
}
