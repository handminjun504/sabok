"use client";

import { useMemo, useState } from "react";
import {
  computeOperatingReportView,
  type OperatingReportInputs,
  type OperatingReportView,
} from "@/lib/domain/operating-report";
import {
  serializeToSpecJson,
  validateOperatingReport,
} from "@/lib/domain/operating-report-validation";
import type {
  CompanySettings,
  BaseAssetAnnual,
  FundSourceAnnual,
  JournalAggregate,
  RealEstateHolding,
  Tenant,
} from "@/types/models";
import { JournalUploadPanel } from "./JournalUploadPanel";
import { OperatingReportJsonView } from "./OperatingReportJsonView";
import { OperatingReportPreview } from "./OperatingReportPreview";
import { OperatingReportValidationPanel } from "./OperatingReportValidationPanel";

type Unit = "원" | "천원";

type Props = {
  /** 서버 컴퓨트에 사용한 그대로의 입력 — 클라이언트에서 분개장 결합 시 재계산용 */
  computeArgs: {
    tenant: Tenant | null;
    settings: CompanySettings | null;
    year: number;
    inputs: OperatingReportInputs;
    prevBaseAsset: BaseAssetAnnual | null;
    prevFundSource: FundSourceAnnual | null;
    autos: {
      autoEmployerContribution: number;
      autoNonEmployerContribution: number;
      autoBaseAssetUsed: number;
      autoEmployeeCount: number;
      /** Map → 직렬화 가능한 Array 로 전달 후 클라이언트에서 Map 으로 복원 */
      legalAllocByCodeEntries: Array<[number, number]>;
      autoCeoName: string | null;
      autoOptionalRecipients: number;
    };
  };
  /** 서버에서 한번 계산된 초기 view (분개장 적용 전) */
  initialView: OperatingReportView;
  /** 부동산 원본(JSON 직렬화용) */
  realEstate: RealEstateHolding[];
};

/**
 * 미리보기 + 분개장 업로드 + 검증 + JSON 출력 — 모두 한 클라이언트 래퍼에서 관리.
 * 단위 토글(원/천원)도 여기서 결정해 자식 컴포넌트에 전달한다.
 */
export function OperatingReportPreviewClient({ computeArgs, initialView, realEstate }: Props) {
  const [unit, setUnit] = useState<Unit>("원");
  const [journal, setJournal] = useState<JournalAggregate | null>(null);

  /** 분개장이 들어오면 view 재계산. 없으면 초기 view 그대로. */
  const view = useMemo(() => {
    if (!journal) return initialView;
    return computeOperatingReportView({
      ...computeArgs,
      autos: {
        autoEmployerContribution: computeArgs.autos.autoEmployerContribution,
        autoNonEmployerContribution: computeArgs.autos.autoNonEmployerContribution,
        autoBaseAssetUsed: computeArgs.autos.autoBaseAssetUsed,
        autoEmployeeCount: computeArgs.autos.autoEmployeeCount,
        legalAllocByCode: new Map(computeArgs.autos.legalAllocByCodeEntries),
        autoCeoName: computeArgs.autos.autoCeoName,
        autoOptionalRecipients: computeArgs.autos.autoOptionalRecipients,
        journalAggregate: journal,
      },
    });
  }, [journal, computeArgs, initialView]);

  const validation = useMemo(
    () =>
      validateOperatingReport({
        view,
        tenant: computeArgs.tenant,
        settings: computeArgs.settings,
      }),
    [view, computeArgs.tenant, computeArgs.settings],
  );

  const json = useMemo(
    () =>
      serializeToSpecJson({
        view,
        tenant: computeArgs.tenant,
        settings: computeArgs.settings,
        realEstate,
        validation,
        journal,
      }),
    [view, computeArgs.tenant, computeArgs.settings, realEstate, validation, journal],
  );

  return (
    <div className="space-y-4">
      {/* 상단: 단위 토글 + 분개장 적용 상태 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-[var(--muted)]">
          {journal ? (
            <span>
              <span className="text-[var(--accent)] font-semibold">분개장 자동집계 적용 중</span>
              {" — "}
              {journal.source.files.length}개 파일,{" "}
              {(journal.source.totalCredit + journal.source.totalDebit).toLocaleString("ko-KR")}원 합계
              {journal.source.balanceOk ? "" : " (차·대 불일치)"}
            </span>
          ) : (
            "분개장 미업로드 — 앱에 입력된 데이터로만 자동값 산출"
          )}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-[var(--border)] p-0.5">
          <UnitButton current={unit} value="원" onClick={() => setUnit("원")} />
          <UnitButton current={unit} value="천원" onClick={() => setUnit("천원")} />
        </div>
      </div>

      <JournalUploadPanel onAggregate={setJournal} unit={unit} />

      <OperatingReportPreview view={view} year={computeArgs.year} />

      <OperatingReportValidationPanel result={validation} unit={unit} />

      <OperatingReportJsonView
        json={json}
        fileName={`operating-report-${computeArgs.year}.json`}
      />
    </div>
  );
}

function UnitButton({ current, value, onClick }: { current: Unit; value: Unit; onClick: () => void }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-xs ${
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--muted)] hover:bg-[var(--surface-hover)]"
      }`}
    >
      {value}
    </button>
  );
}
