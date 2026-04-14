import Link from "next/link";
import { companySettingsByTenant, employeeListByTenantCodeAsc } from "@/lib/pb/repository";
import { requireTenantContext } from "@/lib/tenant-context";
import { canEditEmployees } from "@/lib/permissions";
import { CsvImportClient } from "@/components/CsvImportClient";
import { EmployeeCsvExportButton } from "@/components/EmployeeCsvExportButton";
import { formatWon, yn } from "@/lib/spreadsheet-format";

export default async function EmployeesPage() {
  const { tenantId, role } = await requireTenantContext();
  const [settings, list] = await Promise.all([
    companySettingsByTenant(tenantId),
    employeeListByTenantCodeAsc(tenantId),
  ]);
  const activeYear = settings?.activeYear ?? new Date().getFullYear();
  const foundingMonth = settings?.foundingMonth ?? 1;
  const yy = String(activeYear).slice(-2);
  const colRepReturn = list.some((e) => e.flagRepReturn);
  const colSpouseReceipt = list.some((e) => e.flagSpouseReceipt);
  const colWorkerNet = list.some((e) => e.flagWorkerNet);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="neu-title-gradient text-2xl font-bold">직원 정보</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <EmployeeCsvExportButton />
          {canEditEmployees(role) && (
            <>
              <Link href="/dashboard/employees/new" className="btn btn-primary px-4 py-2 text-sm">
                직원 추가
              </Link>
              <CsvImportClient />
            </>
          )}
        </div>
      </div>

      <div className="surface dash-panel-pad text-sm">
        <p className="font-semibold tracking-normal text-[var(--text)]">&lt;{yy}년 사복 진행 조사표&gt;</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          창립월 {foundingMonth}월 · CODE 순 · 시트 매핑은 저장소 docs/sheet-mapping.md
        </p>
      </div>

      <div className="surface overflow-x-auto p-0">
        <table className="employee-directory-table w-max min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-[var(--border-strong)] bg-[var(--surface-hover)]/40 text-[var(--muted)]">
              <th
                colSpan={3}
                className="dash-table-group-th sticky left-0 z-10 border-r-2 border-[var(--border-strong)] bg-[var(--surface-hover)] text-left"
              >
                기본 정보
              </th>
              <th
                colSpan={
                  17 +
                  (colRepReturn ? 1 : 0) +
                  (colSpouseReceipt ? 1 : 0) +
                  (colWorkerNet ? 1 : 0)
                }
                className="dash-table-group-th text-left"
              >
                급여·복지·가족
              </th>
              <th className="sticky right-0 z-10 w-14 min-w-[3.5rem] border-l border-[var(--border)] bg-[var(--surface-hover)] px-2 py-2.5" />
            </tr>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]/40">
              <th className="dash-table-head sticky left-0 z-10 min-w-[4.5rem] border-r border-[var(--border)] bg-[var(--bg)] text-left">
                코드
              </th>
              <th className="dash-table-head sticky left-[4.5rem] z-10 min-w-[7.5rem] border-r border-[var(--border)] bg-[var(--bg)] text-left">
                이름
              </th>
              <th className="dash-table-head min-w-[6.5rem] max-w-[10rem] border-r-2 border-[var(--border-strong)] bg-[var(--bg)] text-left">
                직급
              </th>
              <th className="dash-table-head dash-table-vline-strong whitespace-nowrap text-right">기존연봉</th>
              <th className="dash-table-head dash-table-vline whitespace-nowrap text-right">조정급여</th>
              <th className="dash-table-head dash-table-vline whitespace-nowrap text-right">사복지급분</th>
              <th className="dash-table-head dash-table-vline whitespace-nowrap text-right">알아서금액</th>
              {colRepReturn ? <th className="dash-table-head text-center">대표반환</th> : null}
              {colSpouseReceipt ? <th className="dash-table-head text-center">배우자수령</th> : null}
              {colWorkerNet ? (
                <th className="dash-table-head max-w-[5.5rem] whitespace-normal text-center leading-tight">
                  근로자 실질 수령(반환분 제외)
                </th>
              ) : null}
              <th className="dash-table-head text-center">입사 월</th>
              <th className="dash-table-head text-center">생일 월</th>
              <th className="dash-table-head text-center">결혼기념월</th>
              <th className="dash-table-head text-center">영유아</th>
              <th className="dash-table-head text-center">미취학아동</th>
              <th className="dash-table-head text-center">청소년</th>
              <th className="dash-table-head text-center">부모님</th>
              <th className="dash-table-head text-center">시부모님</th>
              <th className="dash-table-head dash-table-vline-strong whitespace-nowrap text-right">보험료</th>
              <th className="dash-table-head dash-table-vline whitespace-nowrap text-right">대출이자</th>
              <th className="dash-table-head dash-table-vline whitespace-nowrap text-right">월세</th>
              <th className="dash-table-head text-center">급여일</th>
              <th className="dash-table-head text-center">레벨</th>
              <th className="dash-table-head dash-table-vline-strong whitespace-nowrap text-right">예상 인센</th>
              <th className="sticky right-0 z-10 border-l border-[var(--border)] bg-[var(--bg)] px-2 py-2.5"> </th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="group border-b border-[var(--border)] hover:bg-[var(--bg)]">
                <td className="sticky left-0 z-[1] border-r border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 tabular-nums text-[var(--text)] group-hover:bg-[var(--bg)]">
                  {e.employeeCode}
                </td>
                <td className="sticky left-[4.5rem] z-[1] border-r border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 font-medium text-[var(--text)] group-hover:bg-[var(--bg)]">
                  <span className="block max-w-[9rem] break-words leading-snug">{e.name}</span>
                </td>
                <td className="max-w-[10rem] border-r-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)] group-hover:bg-[var(--bg)]">
                  <span className="block break-words leading-snug">{e.position}</span>
                </td>
                <td className="dash-table-vline-strong whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {formatWon(e.baseSalary)}
                </td>
                <td className="dash-table-vline whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {formatWon(e.adjustedSalary)}
                </td>
                <td className="dash-table-vline whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {formatWon(e.welfareAllocation)}
                </td>
                <td className="dash-table-vline whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {formatWon(e.discretionaryAmount)}
                </td>
                {colRepReturn ? <td className="px-3 py-2.5 text-center tabular-nums">{yn(e.flagRepReturn)}</td> : null}
                {colSpouseReceipt ? <td className="px-3 py-2.5 text-center tabular-nums">{yn(e.flagSpouseReceipt)}</td> : null}
                {colWorkerNet ? <td className="px-3 py-2.5 text-center tabular-nums">{yn(e.flagWorkerNet)}</td> : null}
                <td className="px-3 py-2.5 text-center tabular-nums text-[var(--muted)]">{e.hireMonth ?? "—"}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-[var(--muted)]">{e.birthMonth ?? "—"}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-[var(--muted)]">{e.weddingMonth ?? "—"}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{e.childrenInfant}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{e.childrenPreschool}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{e.childrenTeen}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{e.parentsCount}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{e.parentsInLawCount}</td>
                <td className="dash-table-vline-strong whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {formatWon(e.insurancePremium)}
                </td>
                <td className="dash-table-vline whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {formatWon(e.loanInterest)}
                </td>
                <td className="dash-table-vline whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {formatWon(e.monthlyRentAmount)}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums">{e.payDay ?? "—"}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{e.level}</td>
                <td className="dash-table-vline-strong whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {formatWon(e.incentiveAmount)}
                </td>
                <td className="sticky right-0 z-[1] border-l border-[var(--border)] bg-[var(--surface)] px-2 py-2.5 text-sm group-hover:bg-[var(--bg)]">
                  <Link href={`/dashboard/employees/${e.id}`} className="text-[var(--accent)] hover:underline">
                    상세
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">등록된 직원이 없습니다.</p>}
      </div>
    </div>
  );
}
