"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function formatWonInput(n: number): string {
  return n.toLocaleString("ko-KR");
}

function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, "");
}

function numericFromWonString(v: string): number {
  const d = digitsOnly(v);
  if (!d) return 0;
  const n = Number(d);
  return Number.isFinite(n) ? Math.round(n) : 0;
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
  /** 입력이 잠시 멈춘 뒤(및 blur 시) 호출 — 자동 저장 등 */
  onCommitValue?: (value: number) => void;
  commitDebounceMs?: number;
};

/** 원 단위 숫자 입력 — 입력 시 콤마 자동 삽입. 제출 값은 `1,234,567` 형태이며 서버에서 콤마 제거 후 파싱하면 됩니다. */
export function CommaWonInput({
  name,
  id,
  defaultValue,
  className = "input w-full text-xs",
  required,
  placeholder,
  disabled,
  readOnly,
  onCommitValue,
  commitDebounceMs = 550,
}: CommaWonInputProps) {
  const init =
    defaultValue != null && Number.isFinite(Number(defaultValue))
      ? formatWonInput(Math.round(Number(defaultValue)))
      : "";
  const [val, setVal] = useState(init);
  const initialN =
    defaultValue != null && Number.isFinite(Number(defaultValue)) ? Math.round(Number(defaultValue)) : 0;
  const lastCommittedRef = useRef(initialN);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const flushCommit = useCallback(() => {
    if (!onCommitValue || readOnly || disabled) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const n = numericFromWonString(val);
    if (n === lastCommittedRef.current) return;
    lastCommittedRef.current = n;
    onCommitValue(n);
  }, [val, onCommitValue, readOnly, disabled]);

  useEffect(() => {
    /** 부모 RSC 리프레시 시 서버 defaultValue가 오지만, 입력 중이면 덮어쓰지 않음(포커스·입력 끊김 방지) */
    if (typeof document !== "undefined" && document.activeElement === inputRef.current) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const n =
      defaultValue != null && Number.isFinite(Number(defaultValue)) ? Math.round(Number(defaultValue)) : 0;
    lastCommittedRef.current = n;
    if (defaultValue == null || !Number.isFinite(Number(defaultValue))) {
      setVal("");
      return;
    }
    setVal(formatWonInput(Math.round(Number(defaultValue))));
  }, [defaultValue]);

  useEffect(() => {
    if (!onCommitValue || readOnly || disabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const n = numericFromWonString(val);
      if (n === lastCommittedRef.current) return;
      lastCommittedRef.current = n;
      onCommitValue(n);
    }, commitDebounceMs);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [val, onCommitValue, readOnly, disabled, commitDebounceMs]);

  return (
    <input
      ref={inputRef}
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
      onBlur={flushCommit}
    />
  );
}
