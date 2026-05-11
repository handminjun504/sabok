import type { Employee } from "@/types/models";
import { employeeStatusForYear } from "./schedule";

/**
 * 직원 표·카드의 status badge 라벨 — 인사 정보(`resignYear/resignMonth`) 우선,
 * 사복 활성 월 범위는 보조(`detail`) 로만 노출.
 *
 * 기존에는 `employeeStatusForYear` 의 활성 범위(`ACTIVE_PARTIAL { 1..4 }`)를 그대로 「~4월 재직」 으로
 * 표시했지만, 사용자 멘탈모델은 인사상 「N월 퇴사」 이므로 그 형태로 통일한다.
 * 예: 5월 퇴사 + 「퇴사월 사복 지급」 OFF → 활성 범위는 {1..4} 이지만 label = "5월 퇴사", detail = "사복 ~4월 (퇴사월 미지급)".
 *
 * 입사 라벨은 모델에 `hireYear` 가 없어 정확히 「올해 N월 입사」 를 판정할 수 없으므로 본 헬퍼에서는 생략한다.
 * (필요 시 별도 컬럼 추가 후 확장)
 */
export type EmployeeStatusLabel = {
  /** badge 한 줄 — 인사 정보 우선 */
  label: string;
  /** tooltip 등 보조 — 인사 정보와 사복 활성 범위가 다를 때만 채움 */
  detail?: string;
  /** 색상 단서 — caller 가 클래스 매핑 */
  tone: "success" | "warn" | "neutral";
};

type LabelInput = Pick<Employee, "resignYear" | "resignMonth"> & {
  flagPayWelfareOnResignMonth?: boolean | null;
};

function monthOrNull(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

export function employeeStatusLabelForYear(employee: LabelInput, year: number): EmployeeStatusLabel {
  const status = employeeStatusForYear(employee, year);
  const ry = employee.resignYear ?? null;
  const rm = monthOrNull(employee.resignMonth);
  const flag = employee.flagPayWelfareOnResignMonth === true;

  if (status.kind === "ACTIVE_FULL_YEAR") {
    return { label: "재직", tone: "success" };
  }
  if (status.kind === "AFTER_RESIGN") {
    const yLabel = ry != null ? `${ry}년` : "";
    const mLabel = rm != null ? ` ${rm}월` : "";
    const out = `${yLabel}${mLabel} 퇴사`.trim();
    return { label: out || "퇴사", tone: "neutral" };
  }

  /** ACTIVE_PARTIAL — 인사 정보(올해 퇴사) 우선 라벨 */
  if (ry === year && rm != null) {
    const detail =
      !flag && rm > 1 ? `사복 ~${rm - 1}월 (퇴사월 미지급)` : undefined;
    return { label: `${rm}월 퇴사`, detail, tone: "warn" };
  }

  /** 인사 정보가 비어 있는 legacy 케이스만 활성 범위 폴백 — 일반 운영에선 위 분기에서 끝남. */
  const { fromMonth, toMonth } = status.range;
  const fb =
    fromMonth === 1
      ? `~${toMonth}월 재직`
      : toMonth === 12
        ? `${fromMonth}월~ 재직`
        : `${fromMonth}~${toMonth}월 재직`;
  return { label: fb, tone: "warn" };
}

/**
 * badge 색상 클래스 매핑 — 컴포넌트별 className 중복을 줄이기 위한 작은 헬퍼.
 * tone="warn" → 「badge-warn」, "success" → 「badge-success」, "neutral" → 「badge-neutral」.
 */
export function employeeStatusLabelBadgeClass(label: EmployeeStatusLabel): string {
  switch (label.tone) {
    case "success":
      return "badge badge-success";
    case "warn":
      return "badge badge-warn";
    case "neutral":
    default:
      return "badge badge-neutral";
  }
}
