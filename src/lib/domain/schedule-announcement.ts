import type { TenantOperationMode } from "@/lib/domain/tenant-profile";

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

function sortByEmployeeCode<T extends { employeeCode: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode, "ko", { numeric: true }));
}

/** 스케줄 기준 해당 월 근로자 지급(사복) 합계 */
export function sumWelfareScheduledMonth(rows: readonly AnnouncementRowInput[]): number {
  return rows.reduce((s, r) => s + Math.max(0, Math.round(r.welfareMonth)), 0);
}

/** 입금·이체 금액만 요약한 짧은 멘트 */
export function buildDepositTransferSummaryNotice(month: number, rows: AnnouncementRowInput[]): string {
  const sum = sumWelfareScheduledMonth(rows);
  const with20 = Math.round(sum * 1.2);
  return [
    `${month}월 사내근로복지기금 입금·이체 안내`,
    ``,
    `① 당월 근로자 지급(사복) 합계: ${formatWonLine(sum)}원`,
    `   → 사내근로복지기금 통장에 이 금액을 먼저 넣으신 뒤, 아래 직원분께 이체하시면 됩니다.`,
    ``,
    `② 20% 추가 적립이 필요한 경우(개인사업자, 자본금 50% 적립 중 법인 등):`,
    `   → 통장에는 약 ${formatWonLine(with20)}원까지 입금·조정이 필요할 수 있습니다.`,
    ``,
    `(앱의 월별 스케줄 집계 기준이며, 대표반환·수수료·회계 처리는 별도입니다.)`,
  ].join("\n");
}

/**
 * 법인·단일월 카톡 양식: 인사 → 통장 이체 금액 → 직원별(지급>0) → 마무리
 * 예) 안녕하세요! 2월 … / 통장에 23,820,000원 이체하신 후 / … / 이체해주시면 됩니다.
 */
export function buildWelfareFundNotice(month: number, rows: AnnouncementRowInput[]): string {
  const sorted = sortByEmployeeCode(rows);
  const sum = sorted.reduce((s, r) => s + Math.max(0, Math.round(r.welfareMonth)), 0);
  const lines: string[] = [
    `안녕하세요! ${month}월 사내근로복지기금 안내드립니다.`,
    `사내근로복지기금 통장에 ${formatWonLine(sum)}원 이체하신 후`,
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
 */
export function buildWelfareFundBatchedNotice(monthFrom: number, monthTo: number, rows: readonly WelfareByMonthRow[]): string {
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

  const monthLabels = Array.from({ length: hi - lo + 1 }, (_, i) => `${lo + i}월`).join(" ");
  const head = [
    `안녕하세요~`,
    `${lo}월 ~ ${hi}월 사내근로복지기금 지급분 안내드립니다.`,
    `사내근로복지기금 통장으로 ${formatWonLine(total)}원 이체하신 후`,
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
 * 대표님 반환 금액은 시스템에 없어 별도 기재 안내 줄만 넣습니다.
 */
export function buildTransferAndDetailNotice(month: number, rows: AnnouncementRowInput[]): string {
  const sorted = sortByEmployeeCode(rows);
  const sumWelfare = sorted.reduce((s, r) => s + Math.max(0, Math.round(r.welfareMonth)), 0);
  const with20 = Math.round(sumWelfare * 1.2);

  const lines: string[] = [
    `${month}월 사내근로복지기금 안내드립니다.`,
    `사내근로복지기금 통장에 ${formatWonLine(sumWelfare)}원 이체하신 후`,
    `(※ 개인사업자이시거나 자본금의 50%까지 적립 중인 법인이시면, 해당 월 지급 합계에 20%를 더한 ${formatWonLine(with20)} 원을 입금해 주세요.)`,
    `(※ 법인이 예컨대 2,500만 원까지 적립해야 하는 경우, 근로자대부(근로자에게 빌려준 금액)는 회사 자산으로 포함되는 경우가 많아 그 잔액만큼은 이미 적립분에 해당하는 것으로 보고, 2,500만 원에서 근로자대부를 뺀 금액만 추가로 적립하면 됩니다. 예: 근로자대부 2,000만 원이면 500만 원만 더 맞추면 됩니다.)`,
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
