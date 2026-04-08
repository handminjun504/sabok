/** 구글 시트(사복 진행 조사표) 스타일 숫자·표시 헬퍼 */

export function formatWon(value: { toString(): string } | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(value);
  return Math.round(n).toLocaleString("ko-KR");
}

export function yn(v: boolean | null | undefined): string {
  return v ? "✓" : "";
}
