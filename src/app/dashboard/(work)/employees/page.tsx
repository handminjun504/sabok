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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="neu-title-gradient text-2xl font-bold">직원 정보</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            참고용 사복 진행 조사표와 같은 열 순서(레벨·예상 인센은 앱 확장). 시트 실시간 연동 없음. 가로 스크롤.
          </p>
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

      <div className="surface p-3 text-sm">
        <p className="font-semibold tracking-tight">&lt;{yy}년 사복 진행 조사표&gt;</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          창립월 {foundingMonth}월 · CODE 순 · 시트 매핑은 저장소 docs/sheet-mapping.md
        </p>
      </div>

      <div className="surface overflow-x-auto p-0">
        <table className="w-max min-w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--border-strong)] bg-[var(--surface-hover)]/40 text-[10px] font-semibold uppercase text-[var(--muted)]">
              <th className="sticky left-0 z-10 border-r border-[var(--border)] bg-[var(--bg)] px-2 py-2">CODE</th>
              <th className="sticky left-[3.25rem] z-10 border-r border-[var(--border)] bg-[var(--bg)] px-2 py-2">
                이름
              </th>
              <th className="px-2 py-2">직급</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">기존연봉</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">조정급여</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">사복지급분</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">알아서금액</th>
              <th className="px-2 py-2 text-center">대표반환</th>
              <th className="px-2 py-2 text-center">배우자수령</th>
              <th className="max-w-[5.5rem] whitespace-normal px-2 py-2 text-center leading-tight">
                근로자 실질 수령(반환분 제외)
              </th>
              <th className="px-2 py-2 text-center">입사 월</th>
              <th className="px-2 py-2 text-center">생일 월만입력</th>
              <th className="px-2 py-2 text-center">결혼기념월(예정월)</th>
              <th className="px-2 py-2 text-center">영유아</th>
              <th className="px-2 py-2 text-center">미취학아동</th>
              <th className="px-2 py-2 text-center">청소년</th>
              <th className="px-2 py-2 text-center">부모님</th>
              <th className="px-2 py-2 text-center">시부모님</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">보험료</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">대출이자</th>
              <th className="px-2 py-2 text-center">급여일</th>
              <th className="px-2 py-2 text-center">레벨</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">예상 인센</th>
              <th className="sticky right-0 z-10 border-l border-[var(--border)] bg-[var(--bg)] px-2 py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="group border-b border-[var(--border)] hover:bg-[var(--bg)]">
                <td className="sticky left-0 z-[1] border-r border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono group-hover:bg-[var(--bg)]">
                  {e.employeeCode}
                </td>
                <td className="sticky left-[3.25rem] z-[1] max-w-[6rem] truncate border-r border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-medium group-hover:bg-[var(--bg)]">
                  {e.name}
                </td>
                <td className="max-w-[4rem] truncate px-2 py-1.5">{e.position}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatWon(e.baseSalary)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatWon(e.adjustedSalary)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatWon(e.welfareAllocation)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatWon(e.discretionaryAmount)}</td>
                <td className="px-2 py-1.5 text-center">{yn(e.flagRepReturn)}</td>
                <td className="px-2 py-1.5 text-center">{yn(e.flagSpouseReceipt)}</td>
                <td className="px-2 py-1.5 text-center">{yn(e.flagWorkerNet)}</td>
                <td className="px-2 py-1.5 text-center text-[var(--muted)]">{e.hireMonth ?? "—"}</td>
                <td className="px-2 py-1.5 text-center text-[var(--muted)]">{e.birthMonth ?? "—"}</td>
                <td className="px-2 py-1.5 text-center text-[var(--muted)]">{e.weddingMonth ?? "—"}</td>
                <td className="px-2 py-1.5 text-center">{e.childrenInfant}</td>
                <td className="px-2 py-1.5 text-center">{e.childrenPreschool}</td>
                <td className="px-2 py-1.5 text-center">{e.childrenTeen}</td>
                <td className="px-2 py-1.5 text-center">{e.parentsCount}</td>
                <td className="px-2 py-1.5 text-center">{e.parentsInLawCount}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatWon(e.insurancePremium)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatWon(e.loanInterest)}</td>
                <td className="px-2 py-1.5 text-center">{e.payDay ?? "—"}</td>
                <td className="px-2 py-1.5 text-center">{e.level}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatWon(e.incentiveAmount)}</td>
                <td className="sticky right-0 z-[1] border-l border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 group-hover:bg-[var(--bg)]">
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
