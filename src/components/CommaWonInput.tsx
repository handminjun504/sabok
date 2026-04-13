"use client";

import { useState } from "react";

function formatWonInput(n: number): string {
  return n.toLocaleString("ko-KR");
}

function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, "");
}

export type CommaWonInputProps = {
  name: string;
  id?: string;
  defaultValue?: number | null;
  className?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
};

/** 원 단위 숫자 입력 — 입력 시 콤마 자동 삽입. 제출 값은 `1,234,567` 형태이며 서버에서 콤마 제거 후 파싱하면 됩니다. */
export function CommaWonInput({
  name,
  id,
  defaultValue,
  className = "input w-full",
  required,
  placeholder,
  disabled,
  readOnly,
}: CommaWonInputProps) {
  const init =
    defaultValue != null && Number.isFinite(Number(defaultValue))
      ? formatWonInput(Math.round(Number(defaultValue)))
      : "";
  const [val, setVal] = useState(init);

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      value={val}
      onChange={(e) => {
        if (readOnly || disabled) return;
        const d = digitsOnly(e.target.value);
        if (!d) {
          setVal("");
          return;
        }
        setVal(formatWonInput(Number(d)));
      }}
    />
  );
}
