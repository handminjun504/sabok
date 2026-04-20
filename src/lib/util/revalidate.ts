import { revalidatePath } from "next/cache";

/**
 * 직원·레벨·분기·월 노트 변경 시 같이 무효화해야 하는 화면들.
 * 액션마다 같은 경로 묶음을 반복하는 대신 한 곳에서 관리한다.
 *
 * “스케줄·운영보고·급여포함신고” 는 직원/레벨/분기 데이터에 의존하므로 항상 함께 무효화한다.
 */
export function revalidateScheduleArtifacts(): void {
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/operating-report");
  revalidatePath("/dashboard/salary-inclusion-report");
}

/** 직원 목록·상세 변경 시 — 스케줄 계열까지 같이 무효화. */
export function revalidateEmployeeArtifacts(opts?: { detailPath?: string; includeNew?: boolean }): void {
  revalidatePath("/dashboard/employees", "layout");
  if (opts?.detailPath) revalidatePath(opts.detailPath);
  if (opts?.includeNew) revalidatePath("/dashboard/employees/new");
  revalidateScheduleArtifacts();
}

/** 레벨 규칙·정기 행사 변경 시. */
export function revalidateLevelArtifacts(): void {
  revalidatePath("/dashboard/levels");
  revalidateScheduleArtifacts();
}

/** 분기 항목·월별 노트 변경 시. */
export function revalidateQuarterlyArtifacts(): void {
  revalidatePath("/dashboard/quarterly");
  revalidateScheduleArtifacts();
}

/** 전사 설정 변경 시. */
export function revalidateSettingsArtifacts(): void {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/employees");
  revalidateScheduleArtifacts();
}
