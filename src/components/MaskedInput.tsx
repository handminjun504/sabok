"use client";

import { useRef, useState } from "react";

/**
 * 한 세그먼트의 길이는 「필수 문자 수 + 선택 문자 수」 까지 허용.
 * - 「필수 문자」: 패턴의 `D` / `X` 그대로 — 그만큼은 무조건 그 세그먼트에 들어가야 한다.
 * - 「선택 문자」: 패턴의 `D?` / `X?` — 사용자가 더 입력하면 같은 세그먼트에 흡수.
 *
 * 예) 인가번호 `DDDD-DDDD-DD?` → 마지막 세그먼트는 1~2 자리 모두 OK.
 */
type Segment = { type: "digit" | "free"; min: number; max: number };

/** 패턴 문자열로 세그먼트를 파싱. `D` = 숫자, `X` = 임의 문자, `?` = 직전 문자가 선택(가변 길이). */
function parsePattern(pattern: string): Segment[] {
  const segs: Segment[] = [];
  let cur: Segment | null = null;
  const chars = [...pattern];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "-") {
      if (cur) segs.push(cur);
      cur = null;
      continue;
    }
    if (ch !== "D" && ch !== "X") continue;
    const isOptional = chars[i + 1] === "?";
    const type: "digit" | "free" = ch === "D" ? "digit" : "free";
    if (cur && cur.type === type) {
      cur.max++;
      if (!isOptional) cur.min++;
    } else {
      if (cur) segs.push(cur);
      cur = { type, min: isOptional ? 0 : 1, max: 1 };
    }
    if (isOptional) i++;
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
    const chunk = clean.slice(pos, pos + seg.max);
    if (!chunk) break;
    parts.push(chunk);
    pos += seg.max;
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
  /**
   * 패턴: `D` = 숫자, `X` = 임의 문자, `-` 는 구분자, `?` 는 직전 문자를 「선택(가변 길이)」 으로 만든다.
   * 예) `DDDD-DDDD-D` (4-4-1 고정), `DDD-DD-DDDDD` (사업자등록번호), `DDD-DDDD-DDDD` (전화번호),
   * `DDDD-DDDD-DD?` (4-4-1 또는 4-4-2 모두 허용 — 인가번호 양식이 둘 다 있을 때).
   */
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
