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
    `① 당월 근로자 지급(사복) 합계: ${formatWonLine(sum)} 원`,
    `   → 사내근로복지기금 통장에 이 합계가 있어야 근로자에게 지급·이체하실 수 있습니다.`,
    ``,
    `② 20% 추가 적립이 필요한 경우(개인사업자, 자본금 50% 적립 중 법인 등):`,
    `   → 통장에는 약 ${formatWonLine(with20)} 원까지 입금·조정이 필요할 수 있습니다.`,
    ``,
    `(앱의 월별 스케줄 집계 기준이며, 대표반환·수수료·회계 처리는 별도입니다.)`,
  ].join("\n");
}

/** 안녕하세요! N월 사내근로복지기금 … 입금·이체 금액 + 직원별 지급액 */
export function buildWelfareFundNotice(month: number, rows: AnnouncementRowInput[]): string {
  const sorted = sortByEmployeeCode(rows);
  const sum = sorted.reduce((s, r) => s + Math.max(0, Math.round(r.welfareMonth)), 0);
  const with20 = Math.round(sum * 1.2);
  const lines: string[] = [
    `안녕하세요! ${month}월 사내근로복지기금 안내드립니다.`,
    ``,
    `당월 근로자에게 지급할 사복(기금) 합계는 ${formatWonLine(sum)} 원입니다.`,
    `사내근로복지기금 통장에서 위 합계만큼 준비·이체하시면 근로자 지급에 맞출 수 있습니다.`,
    `(개인사업자 등으로 해당 월 지급액에 20%를 더해 통장에 넣어야 하시면, 약 ${formatWonLine(with20)} 원까지 입금을 검토해 주세요.)`,
    ``,
  ];
  for (const r of sorted) {
    const w = Math.round(r.welfareMonth);
    if (w <= 0) continue;
    lines.push(`${r.name} ${formatWonLine(w)} 원`);
  }
  return lines.join("\n");
}

export function showSalaryPortionNoticeMode(mode: TenantOperationMode): boolean {
  return mode === "SALARY_WELFARE" || mode === "COMBINED";
}

/**
 * 급여(월) = 조정·기준 연봉의 월 환산(`monthlySalaryPortion`과 동일).
 * 해당 월에 스케줄 기금이 있는 직원만 넣거나, 급여낮추기 전용 모드면 월 기금 0이어도 포함.
 */
export function buildSalaryPortionNotice(
  month: number,
  operationMode: TenantOperationMode,
  rows: AnnouncementRowInput[]
): string | null {
  if (!showSalaryPortionNoticeMode(operationMode)) return null;
  const sorted = sortByEmployeeCode(rows);
  const included: AnnouncementRowInput[] = [];
  let sumSalary = 0;
  for (const r of sorted) {
    if (r.salaryMonth <= 0) continue;
    const w = Math.round(r.welfareMonth);
    const include =
      operationMode === "SALARY_WELFARE" ? true : operationMode === "COMBINED" ? w > 0 : false;
    if (!include) continue;
    sumSalary += Math.round(r.salaryMonth);
    included.push(r);
  }
  if (included.length === 0) return null;
  const head = [
    `${month}월 급여분 안내드립니다.`,
    ``,
    `아래 금액은 조정·기준 연봉의 월 환산(급여 쪽) 합계 ${formatWonLine(sumSalary)} 원입니다. 급여 계좌로 이체·지급하실 때 참고해 주세요.`,
    ``,
  ];
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
    `사내근로복지기금 통장으로 ${formatWonLine(sumWelfare)} 원 이체하신 후`,
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
  return lines.join("\n");
}
