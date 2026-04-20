import type { TenantOperationMode } from "@/lib/domain/tenant-profile";
import { VENDOR_CONTRIBUTION_RESERVE_RATE } from "@/lib/domain/vendor-reserve";

export function formatWonLine(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}`;
}

export type AnnouncementRowInput = {
  employeeCode: string;
  name: string;
  welfareMonth: number;
  salaryMonth: number;
  flagRepReturn: boolean;
  discretionaryAmount: number | null;
};

/**
 * 안내 멘트의 통장 입금 줄에 “+20% 적립금 포함” 을 자동 반영할지 결정하는 옵션.
 * `vendor-reserve.additionalReserveStatus()` 의 `active` 값을 그대로 넘기면 된다.
 */
export type ReserveAnnouncementOptions = {
  /** true 면 입금 합계에 +20% 적립금을 포함해서 안내 */
  additionalReserveActive: boolean;
};

function sortByEmployeeCode<T extends { employeeCode: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode, "ko", { numeric: true }));
}

/** 스케줄 기준 해당 월 근로자 지급(사복) 합계 */
export function sumWelfareScheduledMonth(rows: readonly AnnouncementRowInput[]): number {
  return rows.reduce((s, r) => s + Math.max(0, Math.round(r.welfareMonth)), 0);
}

/** 적립금 20% 포함 시 입금 금액 (개인 / 법인 50% 미달 공통) */
export function applyAdditionalReserve(amount: number): number {
  return Math.round(Math.max(0, amount) * (1 + VENDOR_CONTRIBUTION_RESERVE_RATE));
}

/**
 * 법인·단일월 카톡 양식: 인사 → 통장 이체 금액 → 직원별(지급>0) → 마무리
 * 예) 안녕하세요! 2월 … / 통장에 23,820,000원 이체하신 후 / … / 이체해주시면 됩니다.
 *
 * `additionalReserveActive` 가 true 이면 통장 이체 금액에 +20% 적립금을 자동 포함하고,
 * 그 줄 옆에 “(적립금 20% 포함)” 표기를 덧붙인다(개인사업자 / 자본금 50% 미달 법인).
 */
export function buildWelfareFundNotice(
  month: number,
  rows: AnnouncementRowInput[],
  options: ReserveAnnouncementOptions = { additionalReserveActive: false },
): string {
  const sorted = sortByEmployeeCode(rows);
  const sum = sorted.reduce((s, r) => s + Math.max(0, Math.round(r.welfareMonth)), 0);
  const reserveActive = options.additionalReserveActive;
  const transferAmount = reserveActive ? applyAdditionalReserve(sum) : sum;
  const transferTail = reserveActive ? " (적립금 20% 포함)" : "";

  const lines: string[] = [
    `안녕하세요! ${month}월 사내근로복지기금 안내드립니다.`,
    `사내근로복지기금 통장에 ${formatWonLine(transferAmount)}원${transferTail} 이체하신 후`,
    ``,
  ];
  for (const r of sorted) {
    const w = Math.round(r.welfareMonth);
    if (w <= 0) continue;
    lines.push(`${r.name} ${formatWonLine(w)} 원`);
  }
  lines.push("", "이체해주시면 됩니다.");
  return lines.join("\n");
}

export type WelfareByMonthRow = {
  employeeCode: string;
  name: string;
  welfareByMonth: Readonly<Record<number, number>>;
};

/**
 * 여러 달을 한 번에 안내할 때(개인 등): 인사~ → 통장 합계 → 직원별 월별 금액 → 마무리 문구
 * `monthFrom`~`monthTo` 포함 구간(순서 자동 정렬).
 *
 * `additionalReserveActive` 가 true 이면 통장 합계에 +20% 적립금을 자동 포함하고
 * 그 줄에 “(적립금 20% 포함)” 표기를 덧붙인다.
 */
export function buildWelfareFundBatchedNotice(
  monthFrom: number,
  monthTo: number,
  rows: readonly WelfareByMonthRow[],
  options: ReserveAnnouncementOptions = { additionalReserveActive: false },
): string {
  const from = Math.min(Math.max(1, monthFrom), 12);
  const to = Math.max(Math.min(12, monthTo), 1);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const sorted = [...rows].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode, "ko", { numeric: true }));

  let total = 0;
  const personBlocks: string[] = [];
  for (const r of sorted) {
    const sub: string[] = [];
    for (let m = lo; m <= hi; m++) {
      const w = Math.round(r.welfareByMonth[m] ?? 0);
      if (w <= 0) continue;
      total += w;
      sub.push(`${m}월: ${formatWonLine(w)}원`);
    }
    if (sub.length === 0) continue;
    personBlocks.push(`${r.name}님`, ...sub, "");
  }

  const reserveActive = options.additionalReserveActive;
  const transferAmount = reserveActive ? applyAdditionalReserve(total) : total;
  const transferTail = reserveActive ? " (적립금 20% 포함)" : "";

  const monthLabels = Array.from({ length: hi - lo + 1 }, (_, i) => `${lo + i}월`).join(" ");
  const head = [
    `안녕하세요~`,
    `${lo}월 ~ ${hi}월 사내근로복지기금 지급분 안내드립니다.`,
    `사내근로복지기금 통장으로 ${formatWonLine(transferAmount)}원${transferTail} 이체하신 후`,
    "",
  ];
  const foot = ["", "각각 이체해주시면됩니다.", `(저번처럼 각 인원 ${monthLabels} 총 ${hi - lo + 1}번씩 이체해주셔야합니다!)`];

  if (personBlocks.length === 0) {
    return [...head, `(해당 기간에 스케줄상 지급액이 있는 직원이 없습니다.)`, ...foot].join("\n");
  }

  return [...head, ...personBlocks, ...foot].join("\n");
}

export function showSalaryPortionNoticeMode(mode: TenantOperationMode): boolean {
  return mode === "SALARY_WELFARE" || mode === "COMBINED";
}

/**
 * 급여(월) = 조정·기준 연봉의 월 환산(`monthlySalaryPortion`과 동일).
 * 급여낮추기·복합 모드: 월 환산 급여가 있는 직원은 해당 월 기금 유무와 관계없이 포함(실무 안내 양식).
 */
export function buildSalaryPortionNotice(
  month: number,
  operationMode: TenantOperationMode,
  rows: AnnouncementRowInput[]
): string | null {
  if (!showSalaryPortionNoticeMode(operationMode)) return null;
  const sorted = sortByEmployeeCode(rows);
  const included = sorted.filter((r) => r.salaryMonth > 0);
  if (included.length === 0) return null;
  const head = [`${month}월 급여분 안내드립니다.`, ``];
  const body = included.map((r) => `${r.name} ${formatWonLine(Math.round(r.salaryMonth))} 원`);
  return [...head, ...body].join("\n");
}

export function shouldShowTransferDetailBlock(
  rows: ReadonlyArray<Pick<AnnouncementRowInput, "flagRepReturn" | "discretionaryAmount">>
): boolean {
  return rows.some(
    (r) => r.flagRepReturn || (r.discretionaryAmount != null && Math.round(r.discretionaryAmount) > 0)
  );
}

/**
 * 통장 이체·직원별 기금·대표반환(문구만)·알아서금액.
 *
 * `additionalReserveActive` 가 true 이면 통장 입금액을 자동으로 +20% 가산 금액으로 표시하고
 * 보조 줄에 “(적립금 20% 포함)” 안내를 한다. false 이면 일반 입금만 표시.
 *
 * 대표님 반환 금액은 시스템에 없어 별도 기재 안내 줄만 넣는다.
 */
export function buildTransferAndDetailNotice(
  month: number,
  rows: AnnouncementRowInput[],
  options: ReserveAnnouncementOptions = { additionalReserveActive: false },
): string {
  const sorted = sortByEmployeeCode(rows);
  const sumWelfare = sorted.reduce((s, r) => s + Math.max(0, Math.round(r.welfareMonth)), 0);
  const reserveActive = options.additionalReserveActive;
  const transferAmount = reserveActive ? applyAdditionalReserve(sumWelfare) : sumWelfare;

  const lines: string[] = [
    `${month}월 사내근로복지기금 안내드립니다.`,
    reserveActive
      ? `사내근로복지기금 통장에 ${formatWonLine(transferAmount)}원 이체하신 후 (적립금 20% 포함, 근로자 지급 합계 ${formatWonLine(sumWelfare)}원 + 적립 ${formatWonLine(transferAmount - sumWelfare)}원)`
      : `사내근로복지기금 통장에 ${formatWonLine(transferAmount)}원 이체하신 후`,
    "",
  ];

  for (const r of sorted) {
    const w = Math.round(r.welfareMonth);
    const dec = r.discretionaryAmount != null ? Math.round(r.discretionaryAmount) : 0;
    if (w <= 0 && !r.flagRepReturn && dec <= 0) continue;

    lines.push(`${r.name} ${formatWonLine(w)} 원`);
    if (r.flagRepReturn) {
      lines.push(`ㄴ대표님 반환: ※ 금액은 별도 산정 후 기재`);
    }
    if (dec > 0) {
      lines.push(`ㄴ알아서금액: ${formatWonLine(dec)} 원`);
    }
    lines.push("");
  }

  while (lines[lines.length - 1] === "") lines.pop();
  lines.push("", "이체해주시면 됩니다.");
  return lines.join("\n");
}
