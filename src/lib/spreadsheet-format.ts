/** 사복 진행 조사표와 같은 표기(콤마 원·체크)용 표시 헬퍼 */

export { formatWon } from "@/lib/util/number";

export function yn(v: boolean | null | undefined): string {
  return v ? "✓" : "";
}
