/**
 * 「선택적 복지」 직원×월 그리드 입력의 폼 직렬화 / 변경 감지 헬퍼.
 *
 * 액션 파일(`src/app/actions/optional-welfare.ts`) 은 `"use server"` 라 일반 export 를
 * 허용하지 않으므로, 단위 테스트 가능한 순수 함수는 모두 이 도메인 파일로 분리한다.
 */

/**
 * 폼에서 그리드 셀들을 `${empId}|${month}` → amount 맵으로 모은다.
 *
 * 입력 name 형식: `optional_${employeeId}_${month}` (1~12).
 * - 빈 문자열·콤마·공백만 있는 값은 0(=해제) 으로 간주.
 * - 음수·NaN 은 0 으로 클램프.
 * - 같은 (empId, month) 가 여러 번 들어오면 마지막 입력 유지.
 */
export function pickOptionalCellsFromForm(formData: FormData): Map<string, number> {
  const out = new Map<string, number>();
  for (const [name, value] of formData.entries()) {
    const m = name.match(/^optional_([^_]+)_(\d{1,2})$/);
    if (!m) continue;
    const empId = m[1];
    const month = Number(m[2]);
    if (!empId || !Number.isFinite(month) || month < 1 || month > 12) continue;
    const raw = String(value).replace(/[,\s]/g, "").trim();
    const n = raw.length === 0 ? 0 : Math.round(Number(raw));
    const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
    out.set(`${empId}|${month}`, safe);
  }
  return out;
}

/**
 * 폼에서 hidden `optional_initial_${empId}_${month}` 들을 모아 초기값 맵을 만든다.
 * 클라이언트가 보낸 「현재 PB 저장값 스냅샷」 — 액션은 이 값과 비교해 변경된 셀만 처리한다.
 */
export function pickInitialFromForm(formData: FormData): Map<string, number> {
  const out = new Map<string, number>();
  for (const [name, value] of formData.entries()) {
    const m = name.match(/^optional_initial_([^_]+)_(\d{1,2})$/);
    if (!m) continue;
    const empId = m[1];
    const month = Number(m[2]);
    if (!empId || !Number.isFinite(month) || month < 1 || month > 12) continue;
    const n = Math.round(Number(String(value).replace(/[,\s]/g, "")));
    out.set(`${empId}|${month}`, Number.isFinite(n) ? Math.max(0, n) : 0);
  }
  return out;
}

/**
 * 「현재」와 「초기값」 의 차이를 비교해 변경된 셀만 골라낸다.
 *
 * - current 만 있고 initial 에 없는 키 → 새로 입력 (변경).
 * - 같은 키에서 amount 가 다르면 변경.
 * - initial 에만 있고 current 에 없는 키는 무시 — 그리드 폼에는 모든 셀이 항상 들어가므로 누락 시 의도 X.
 */
export function diffAgainstInitial(
  current: Map<string, number>,
  initial: Map<string, number>,
): { changed: Array<{ employeeId: string; month: number; amount: number }>; unchanged: number } {
  const changed: Array<{ employeeId: string; month: number; amount: number }> = [];
  let unchanged = 0;
  for (const [k, v] of current.entries()) {
    const prev = initial.get(k) ?? 0;
    if (prev === v) {
      unchanged += 1;
      continue;
    }
    const [empId, monthStr] = k.split("|");
    changed.push({ employeeId: empId, month: Number(monthStr), amount: v });
  }
  return { changed, unchanged };
}

/** 폼의 hidden `activeYear` 를 2000~2100 범위 안의 정수로 파싱. */
export function pickActiveYearFromForm(formData: FormData): number | null {
  const raw = String(formData.get("activeYear") ?? "").trim();
  const y = Math.round(Number(raw));
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return null;
  return y;
}
