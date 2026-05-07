"use client";

import { useRef, useState } from "react";

type Segment = { type: "digit" | "free"; length: number };

/** 패턴 문자열로 세그먼트를 파싱. `D` = 숫자, `X` = 임의 문자. */
function parsePattern(pattern: string): Segment[] {
  const segs: Segment[] = [];
  let cur: Segment | null = null;
  for (const ch of pattern) {
    if (ch === "-") {
      if (cur) segs.push(cur);
      cur = null;
      continue;
    }
    const type: "digit" | "free" = ch === "D" ? "digit" : "free";
    if (cur && cur.type === type) {
      cur.length++;
    } else {
      if (cur) segs.push(cur);
      cur = { type, length: 1 };
    }
  }
  if (cur) segs.push(cur);
  return segs;
}

/** 숫자·임의 문자 값만 남기고 패턴에 맞게 하이픈 삽입. */
function applyMask(raw: string, pattern: string): string {
  const segs = parsePattern(pattern);
  const isAllDigit = segs.every((s) => s.type === "digit");
  const clean = isAllDigit
    ? raw.replace(/\D/g, "")
    : raw.replace(/-/g, "");

  const parts: string[] = [];
  let pos = 0;
  for (const seg of segs) {
    const chunk = clean.slice(pos, pos + seg.length);
    if (!chunk) break;
    parts.push(chunk);
    pos += seg.length;
  }
  return parts.join("-");
}

export function MaskedInput({
  name,
  defaultValue = "",
  placeholder,
  pattern,
  className = "input w-full text-xs",
  disabled,
  autoComplete = "off",
}: {
  name: string;
  /** 패턴: D = 숫자, X = 임의 문자, - 는 구분자. 예: "DDDD-DDDD-D", "DDD-DD-DDDDD", "DDD-DDDD-DDDD" */
  pattern: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const [val, setVal] = useState(() => applyMask(defaultValue, pattern));
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      name={name}
      type="text"
      inputMode="numeric"
      className={className}
      value={val}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete={autoComplete}
      onChange={(e) => {
        const masked = applyMask(e.target.value, pattern);
        setVal(masked);
      }}
    />
  );
}
