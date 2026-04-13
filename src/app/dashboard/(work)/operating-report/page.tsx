"use client";

import { useMemo, useState } from "react";

export default function OperatingReportPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 10; y -= 1) list.push(y);
    return list;
  }, [currentYear]);

  return (
    <div className="space-y-8">
      <div>
        <p className="page-eyebrow">보고</p>
        <h1 className="page-hero-title mt-2 neu-title-gradient">운영상황 보고</h1>
        <p className="page-hero-sub text-sm sm:text-base">임시 화면입니다. 연도만 선택할 수 있습니다.</p>
      </div>
      <div className="surface-prominent max-w-md p-6">
        <label htmlFor="operating-report-year" className="block text-sm font-medium text-[var(--muted)]">
          연도
        </label>
        <select
          id="operating-report-year"
          className="input mt-2 w-full"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <p className="mt-4 text-sm text-[var(--muted)]">선택된 연도: {year}년</p>
      </div>
    </div>
  );
}
