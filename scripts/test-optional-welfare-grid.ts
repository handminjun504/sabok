/**
 * 「선택적 복지」 직원×월 그리드 — 폼 직렬화 / 변경 감지 회귀.
 *
 * 검증 포인트
 *  1. `pickOptionalCellsFromForm` — name 패턴 매칭, 0/빈값 클램프, 음수 클램프, 콤마 제거.
 *  2. `pickInitialFromForm` — hidden 초기값 만 분리해 모음.
 *  3. `diffAgainstInitial` — 변경된 셀만 골라내고, 동일·미변경은 unchanged 카운트.
 *  4. `pickActiveYearFromForm` — 2000~2100 범위 외 → null.
 */

import {
  diffAgainstInitial,
  pickActiveYearFromForm,
  pickInitialFromForm,
  pickOptionalCellsFromForm,
} from "../src/lib/domain/optional-welfare-grid";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

function buildForm(entries: Array<[string, string]>): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

console.log("=== 선택적 복지 그리드 — 폼 직렬화 ===\n");

const fd1 = buildForm([
  ["activeYear", "2026"],
  ["optional_emp1_3", "100,000"],
  ["optional_emp1_5", "200,000"],
  ["optional_emp2_3", ""],
  /** 음수·NaN 은 0 으로 클램프 */
  ["optional_emp3_7", "-50000"],
  ["optional_emp3_8", "abc"],
  /** 잘못된 월(13)·잘못된 prefix 는 무시 */
  ["optional_emp4_13", "999"],
  ["other_emp4_3", "12345"],
  ["optional_initial_emp1_3", "0"],
  ["optional_initial_emp1_5", "200,000"],
  ["optional_initial_emp2_3", "300,000"],
]);

const cells = pickOptionalCellsFromForm(fd1);
check("emp1 3월 = 100,000", cells.get("emp1|3"), 100_000);
check("emp1 5월 = 200,000", cells.get("emp1|5"), 200_000);
check("emp2 3월 = 0 (빈문자)", cells.get("emp2|3"), 0);
check("emp3 7월 = 0 (음수 클램프)", cells.get("emp3|7"), 0);
check("emp3 8월 = 0 (NaN 클램프)", cells.get("emp3|8"), 0);
check("emp4 13월 = undefined (월 범위 외 무시)", cells.get("emp4|13"), undefined);
check("other_ prefix 무시", cells.has("emp4|3"), false);
check("총 셀 5개 — 잘못된 month 와 prefix 제외", cells.size, 5);

const initial = pickInitialFromForm(fd1);
check("initial · emp1 3월 = 0", initial.get("emp1|3"), 0);
check("initial · emp1 5월 = 200,000", initial.get("emp1|5"), 200_000);
check("initial · emp2 3월 = 300,000", initial.get("emp2|3"), 300_000);
/** initial 은 「수정 후 값」 prefix 와 분리되어야 함 — emp4|3 도 없어야 함 */
check("initial 에는 current 패턴이 섞이지 않음", initial.size, 3);

console.log("\n=== diffAgainstInitial ===");

const diff = diffAgainstInitial(cells, initial);
check("변경 — emp1 3월 0→100,000", diff.changed.find((c) => c.employeeId === "emp1" && c.month === 3)?.amount, 100_000);
check("변경 — emp2 3월 300,000→0(해제)", diff.changed.find((c) => c.employeeId === "emp2" && c.month === 3)?.amount, 0);
check(
  "미변경 — emp1 5월 200,000 == 200,000",
  diff.changed.some((c) => c.employeeId === "emp1" && c.month === 5),
  false,
);
/** emp3 7·8월은 current=0, initial 키 없음(=0) → 동일하므로 미변경. */
check(
  "미변경 카운트 = 3 (emp1 5월 + emp3 7·8월 0=0)",
  diff.unchanged,
  3,
);
check(
  "변경 카운트 = 2 (emp1 3월, emp2 3월)",
  diff.changed.length,
  2,
);
check(
  "0=0 동등은 변경에 포함 안 됨 (emp3 7월)",
  diff.changed.some((c) => c.employeeId === "emp3" && c.month === 7),
  false,
);

console.log("\n=== pickActiveYearFromForm ===");

check("2026 → 2026", pickActiveYearFromForm(buildForm([["activeYear", "2026"]])), 2026);
check("빈문자 → null", pickActiveYearFromForm(buildForm([["activeYear", ""]])), null);
check("범위 외(1500) → null", pickActiveYearFromForm(buildForm([["activeYear", "1500"]])), null);
check("범위 외(3000) → null", pickActiveYearFromForm(buildForm([["activeYear", "3000"]])), null);
check("쓰레기 문자열 → null", pickActiveYearFromForm(buildForm([["activeYear", "abc"]])), null);

console.log("\n=== 동일성 가드 — 같은 셀 재입력 시 마지막 값 유지 ===");

const fd2 = buildForm([
  ["optional_emp1_3", "100,000"],
  ["optional_emp1_3", "150,000"],
  ["optional_emp1_3", "200,000"],
]);
check("같은 (empId, month) 마지막 입력 200,000", pickOptionalCellsFromForm(fd2).get("emp1|3"), 200_000);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
