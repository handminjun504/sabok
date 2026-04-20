/**
 * 숫자 입력·금액 표시 공통 유틸.
 *
 * 코드베이스 곳곳에 흩어져 있던 `replace(/,/g,"")`·`Number(...)`·`Math.round(...)·toLocaleString` 패턴을 한 곳으로 모은다.
 * UI 콤마 입력 / FormData 파싱 / 도메인 로직에서 일관되게 사용한다.
 */

/** 입력값에서 숫자 외 문자(쉼표·공백 등)를 모두 제거. 콤마 입력의 핵심 정규화. */
export function digitsOnly(s: string): string {
  return s.replace(/[^\d-]/g, "");
}

/** 입력 도중 콤마를 다시 끼워주는 표시용 포매터(부호·빈문자열 보존). */
export function formatWonInput(s: string): string {
  if (s === "" || s === "-") return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString("ko-KR");
}

/**
 * “0 또는 숫자”로 강제. 빈 값·NaN·null·undefined → 0.
 * Server Action 의 `d(formData.get(...))` 와 동일한 의미.
 */
export function toNum0(v: unknown): number {
  if (v == null) return 0;
  const s = typeof v === "number" ? String(v) : String(v).replace(/,/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** 빈 값·NaN 은 null, 그 외엔 숫자. */
export function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const s = typeof v === "number" ? String(v) : String(v).replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 정수만. 빈 값·NaN 은 null. */
export function toIntOrNull(v: unknown): number | null {
  if (v == null) return null;
  const s = typeof v === "number" ? String(v) : String(v).trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** 정수만. 빈 값·NaN 은 0. */
export function toInt0(v: unknown): number {
  return toIntOrNull(v) ?? 0;
}

/** 표시용 원화 콤마. null/undefined → "". */
export function formatWon(value: { toString(): string } | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(value);
  return Math.round(n).toLocaleString("ko-KR");
}

/** 반올림 후 원화 콤마. 도메인 계산 결과 표시에 적합. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}
