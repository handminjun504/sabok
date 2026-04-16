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

/** 안녕하세요! N월 사내근로복지기금 … 직원별 지급액 */
export function buildWelfareFundNotice(month: number, rows: AnnouncementRowInput[]): string {
  const lines: string[] = [`안녕하세요! ${month}월 사내근로복지기금 안내드립니다.`];
  for (const r of sortByEmployeeCode(rows)) {
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
  const lines: string[] = [`${month}월 급여분 안내드립니다.`];
  let any = false;
  for (const r of sortByEmployeeCode(rows)) {
    if (r.salaryMonth <= 0) continue;
    const w = Math.round(r.welfareMonth);
    const include =
      operationMode === "SALARY_WELFARE" ? true : operationMode === "COMBINED" ? w > 0 : false;
    if (!include) continue;
    lines.push(`${r.name} ${formatWonLine(Math.round(r.salaryMonth))} 원`);
    any = true;
  }
  return any ? lines.join("\n") : null;
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
