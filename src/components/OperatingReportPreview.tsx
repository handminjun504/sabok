"use client";

import type { OperatingReportView } from "@/lib/domain/operating-report";
import { industryLabelOf } from "@/lib/domain/industry-categories";

type Props = {
  view: OperatingReportView;
  year: number;
};

function f(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 양식 [별지 제15호서식] 1·2쪽의 표 구조를 그대로 재현. */
export function OperatingReportPreview({ view, year }: Props) {
  return (
    <div className="space-y-6">
      {view.warnings.length > 0 ? (
        <ul className="rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-xs text-[var(--warn)] space-y-1">
          {view.warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      ) : null}

      <section className="space-y-2">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            1쪽. 기본정보 · 기본재산 · 운용방법 · 기금재원 ({year}년 회계연도)
          </h3>
        </header>

        <div className="op-report overflow-x-auto">
          <table className="op-report-table">
            <tbody>
              <tr>
                <Th>① 기금법인명</Th>
                <Td>{view.basic.name || "—"}</Td>
                <Th>② 인가번호</Th>
                <Td>{view.basic.approvalNumber || "—"}</Td>
              </tr>
              <tr>
                <Th>③ 설립등기일</Th>
                <Td>{view.basic.incorporationDate || "—"}</Td>
                <Th>④ 전화번호</Th>
                <Td>{view.basic.phone || "—"}</Td>
              </tr>
              <tr>
                <Th>⑤ 소재지</Th>
                <Td colSpan={3}>{view.basic.addressLine || "—"}</Td>
              </tr>
              <tr>
                <Th>⑥ 회계연도</Th>
                <Td>{view.basic.accountingYearLabel}</Td>
                <Th>⑦ 대표자</Th>
                <Td>{view.basic.ceoName || "—"}</Td>
              </tr>
              <tr>
                <Th>⑧ 업종</Th>
                <Td>{industryLabelOf(view.basic.industry) || "—"}</Td>
                <Th>⑪ 납입자본금</Th>
                <TdRight>{f(view.basic.headOfficeCapital)}원</TdRight>
              </tr>
              <tr>
                <Th>⑨ 소속근로자 수</Th>
                <TdRight>{f(view.basic.employeeCount)}명</TdRight>
                <Th>⑩ 협력업체근로자 수</Th>
                <TdRight>
                  {view.basic.vendorEmployeeCount != null ? `${f(view.basic.vendorEmployeeCount)}명` : "—"}
                </TdRight>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 기본재산 변동 ⑫~⑳ */}
        <div className="op-report overflow-x-auto">
          <table className="op-report-table">
            <caption className="op-report-caption">기본재산 변동 (단위: 원)</caption>
            <tbody>
              <tr>
                <Th>⑫ 직전 회계연도 말 기본재산 총액</Th>
                <TdRight>{f(view.baseAsset.prevYearEndTotal)}</TdRight>
                <Th rowSpan={2}>⑲ 소계</Th>
                <TdRight rowSpan={2} emphasis>
                  {f(view.baseAsset.subtotal)}
                </TdRight>
              </tr>
              <tr>
                <Th>
                  ⑬ 사업주 출연
                  {view.baseAsset.overridden.employerContribution ? <ManualBadge /> : null}
                </Th>
                <TdRight>{f(view.baseAsset.employerContribution)}</TdRight>
              </tr>
              <tr>
                <Th>⑭ 수익금·이월금 전입</Th>
                <TdRight>{f(view.baseAsset.investReturnAndCarryover)}</TdRight>
                <Th>⑰ 기본재산 사용</Th>
                <TdRight>{f(view.baseAsset.baseAssetUsed)}</TdRight>
              </tr>
              <tr>
                <Th>
                  ⑮ 사업주 외의 자 출연
                  {view.baseAsset.overridden.nonEmployerContribution ? <ManualBadge /> : null}
                </Th>
                <TdRight>{f(view.baseAsset.nonEmployerContribution)}</TdRight>
                <Th>⑱ 기금법인 분할 등</Th>
                <TdRight>{f(view.baseAsset.splitOut)}</TdRight>
              </tr>
              <tr>
                <Th>⑯ 기금법인 합병</Th>
                <TdRight>{f(view.baseAsset.mergerIn)}</TdRight>
                <Th>
                  ⑳ 해당 회계연도 말 총액
                  {view.baseAsset.overridden.currentYearEndTotal ? <ManualBadge /> : null}
                </Th>
                <TdRight emphasis>{f(view.baseAsset.currentYearEndTotal)}</TdRight>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 기금 운용방법 ㉑~㉘ */}
        <div className="op-report overflow-x-auto">
          <table className="op-report-table">
            <caption className="op-report-caption">기금 운용방법 (단위: 원)</caption>
            <tbody>
              <tr>
                <Th>㉑ 금융회사 예입·예탁</Th>
                <TdRight>{f(view.fundOperation.deposit)}</TdRight>
                <Th>㉒ 투자신탁 수익증권 매입</Th>
                <TdRight>{f(view.fundOperation.trust)}</TdRight>
              </tr>
              <tr>
                <Th>㉓ 유가증권 매입</Th>
                <TdRight>{f(view.fundOperation.security)}</TdRight>
                <Th>㉔ 보유 자사주 유상증자 참여</Th>
                <TdRight>{f(view.fundOperation.ownStock)}</TdRight>
              </tr>
              <tr>
                <Th>㉕ (부동산)투자회사 주식 매입</Th>
                <TdRight>{f(view.fundOperation.reit)}</TdRight>
                <Th>㉖ 기타</Th>
                <TdRight>{f(view.fundOperation.etc)}</TdRight>
              </tr>
              <tr>
                <Th>㉗ 근로자 대부</Th>
                <TdRight>{f(view.fundOperation.loan)}</TdRight>
                <Th>㉘ 합계</Th>
                <TdRight emphasis>{f(view.fundOperation.total)}</TdRight>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 기금사업 재원 ㉙~㉟ */}
        <div className="op-report overflow-x-auto">
          <table className="op-report-table">
            <caption className="op-report-caption">기금사업 재원 (단위: 원)</caption>
            <tbody>
              <tr>
                <Th>㉙ 해당 회계연도 기금운용 수익금</Th>
                <TdRight>{f(view.fundSource.operationIncome)}</TdRight>
                <Th>㉝ 공동근로복지기금 지원액 및 50%</Th>
                <TdRight>{f(view.fundSource.jointFundSupport)}</TdRight>
              </tr>
              <tr>
                <Th>
                  ㉚ 출연금액({view.fundSource.contribUsageRatio}%)
                  {view.fundSource.overridden.contribUsageAmount ? <ManualBadge /> : null}
                </Th>
                <TdRight>{f(view.fundSource.contribUsageAmount)}</TdRight>
                <Th>㉞ 이월금</Th>
                <TdRight>{f(view.fundSource.carryover)}</TdRight>
              </tr>
              <tr>
                <Th>
                  ㉛ 기본재산 × 자본금 100분의 50 초과액
                  {view.fundSource.overridden.excessCapitalUsage ? <ManualBadge /> : null}
                </Th>
                <TdRight>{f(view.fundSource.excessCapitalUsage)}</TdRight>
                <Th>㉟ 합계</Th>
                <TdRight emphasis>{f(view.fundSource.total)}</TdRight>
              </tr>
              <tr>
                <Th>
                  ㉜ 직전 기본재산({view.fundSource.prevBaseAssetUsageRatio}%)
                  {view.fundSource.overridden.prevBaseAssetUsageAmount ? <ManualBadge /> : null}
                </Th>
                <TdRight>{f(view.fundSource.prevBaseAssetUsageAmount)}</TdRight>
                <Td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            2쪽. 사용현황 · 사업실적 · 부동산 ({year}년)
          </h3>
        </header>

        {/* 사용현황 매트릭스 ㊱~◯56 */}
        <div className="op-report overflow-x-auto">
          <table className="op-report-table">
            <caption className="op-report-caption">출연금·기본재산 사용현황 (단위: 원)</caption>
            <thead>
              <tr>
                <Th>구분</Th>
                <Th>사용 금액</Th>
                <Th>수혜자 수</Th>
                <Th>협력업체근로자 복리후생 증진 사용액</Th>
                <Th>1인당 수혜금액</Th>
              </tr>
            </thead>
            <tbody>
              <UsageRow label="㊱~㊶ 100분의 80 범위" u={view.usage.u80} />
              <UsageRow label="㊵~㊶ 100분의 90 범위" u={view.usage.u90} />
              <UsageRow label="㊷~㊹ 100분의 20 범위" u={view.usage.u20} />
              <UsageRow label="㊼~㊾ 100분의 25 범위" u={view.usage.u25} />
              <UsageRow label="◯52~◯54 100분의 30 범위" u={view.usage.u30} />
            </tbody>
          </table>
        </div>

        {/* 사업실적 ◯57~◯72 */}
        <div className="op-report overflow-x-auto">
          <table className="op-report-table">
            <caption className="op-report-caption">사업실적 · 수혜자 수 (단위: 원 / 명)</caption>
            <thead>
              <tr>
                <Th rowSpan={2}>구분</Th>
                <Th colSpan={2}>목적사업</Th>
                <Th colSpan={2}>대부사업</Th>
              </tr>
              <tr>
                <Th>금액</Th>
                <Th>수혜자 수</Th>
                <Th>금액</Th>
                <Th>수혜자 수</Th>
              </tr>
            </thead>
            <tbody>
              {view.biz.items.map((it) => (
                <tr key={it.code}>
                  <Th>
                    ◯{it.code} {it.label}
                    {it.purposeAmountOverridden ? <ManualBadge /> : null}
                  </Th>
                  <TdRight>{f(it.purposeAmount)}</TdRight>
                  <TdRight>{f(it.purposeCount)}</TdRight>
                  <TdRight>{f(it.loanAmount)}</TdRight>
                  <TdRight>{f(it.loanCount)}</TdRight>
                </tr>
              ))}
              <tr>
                <Th>◯67 소계</Th>
                <TdRight emphasis>{f(view.biz.subtotalPurpose)}</TdRight>
                <Td />
                <TdRight emphasis>{f(view.biz.subtotalLoan)}</TdRight>
                <Td />
              </tr>
              <tr>
                <Th>◯68 기금 운영비</Th>
                <TdRight>{f(view.biz.operationCost)}</TdRight>
                <Td colSpan={3} />
              </tr>
              <tr>
                <Th>◯69 잔액</Th>
                <TdRight>{f(view.biz.balance)}</TdRight>
                <Td colSpan={3} />
              </tr>
              <tr>
                <Th>◯70 합계</Th>
                <TdRight emphasis>{f(view.biz.total)}</TdRight>
                <Td colSpan={3} />
              </tr>
              <tr>
                <Th>
                  ◯71 선택적 복지비
                  {view.biz.optionalAmountOverridden ? <ManualBadge /> : null}
                </Th>
                <TdRight>{f(view.biz.optionalAmount)}</TdRight>
                <Th>◯72 수혜자 수</Th>
                <TdRight>
                  {f(view.biz.optionalRecipients)}
                  {view.biz.optionalRecipientsOverridden ? <ManualBadge /> : null}
                </TdRight>
                <Td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* 부동산 현황 ㉓~㉕ */}
        <div className="op-report overflow-x-auto">
          <table className="op-report-table">
            <caption className="op-report-caption">부동산 현황 (단위: 원)</caption>
            <thead>
              <tr>
                <Th>번호</Th>
                <Th>명칭</Th>
                <Th>금액</Th>
                <Th>취득일</Th>
              </tr>
            </thead>
            <tbody>
              {view.realEstate.rows.length === 0 ? (
                <tr>
                  <Td colSpan={4} className="text-center text-[var(--muted)]">
                    등록된 부동산이 없습니다.
                  </Td>
                </tr>
              ) : (
                view.realEstate.rows.map((r) => (
                  <tr key={r.id}>
                    <TdRight>{r.seq}</TdRight>
                    <Td>{r.name || "—"}</Td>
                    <TdRight>{f(r.amount)}</TdRight>
                    <Td>{r.acquiredAt || "—"}</Td>
                  </tr>
                ))
              )}
              <tr>
                <Th colSpan={2}>총액</Th>
                <TdRight emphasis>{f(view.realEstate.totalAmount)}</TdRight>
                <Td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .op-report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .op-report-table th,
        .op-report-table td {
          border: 1px solid var(--border);
          padding: 6px 10px;
          vertical-align: middle;
        }
        .op-report-table thead th {
          background: var(--surface-hover);
          text-align: center;
        }
        .op-report-caption {
          caption-side: top;
          text-align: left;
          padding: 6px 2px;
          font-size: 11px;
          color: var(--muted);
        }
      `}</style>
    </div>
  );
}

function Th({
  children,
  rowSpan,
  colSpan,
}: {
  children: React.ReactNode;
  rowSpan?: number;
  colSpan?: number;
}) {
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      scope="row"
      style={{
        background: "var(--surface-hover)",
        fontWeight: 500,
        textAlign: "left",
        color: "var(--muted)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
  rowSpan,
  className,
}: {
  children?: React.ReactNode;
  colSpan?: number;
  rowSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} rowSpan={rowSpan} className={className}>
      {children ?? ""}
    </td>
  );
}

function TdRight({
  children,
  colSpan,
  rowSpan,
  emphasis,
}: {
  children: React.ReactNode;
  colSpan?: number;
  rowSpan?: number;
  emphasis?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={{
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontWeight: emphasis ? 600 : 400,
        color: emphasis ? "var(--text)" : undefined,
      }}
    >
      {children}
    </td>
  );
}

function ManualBadge() {
  return (
    <span
      style={{
        marginLeft: 6,
        padding: "1px 5px",
        borderRadius: 4,
        fontSize: 10,
        background: "var(--warn-bg, rgba(234,179,8,0.15))",
        color: "var(--warn)",
      }}
    >
      수동
    </span>
  );
}

function UsageRow({
  label,
  u,
}: {
  label: string;
  u: { amount: number; recipientCount: number; vendorWelfareAmount: number; perHead: number };
}) {
  return (
    <tr>
      <Th>{label}</Th>
      <TdRight>{f(u.amount)}</TdRight>
      <TdRight>{f(u.recipientCount)}명</TdRight>
      <TdRight>{f(u.vendorWelfareAmount)}</TdRight>
      <TdRight>{f(u.perHead)}</TdRight>
    </tr>
  );
}
