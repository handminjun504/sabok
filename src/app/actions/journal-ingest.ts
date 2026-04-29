"use server";

import { resolveActionTenant } from "@/lib/tenant-context";
import { canEditCompanySettings } from "@/lib/permissions";
import {
  aggregateJournalForOperatingReport,
  parsePdfJournalText,
  parsePdfTrialBalanceText,
  parseXlsxBalance,
  parseXlsxJournal,
  detectXlsxSheetKind,
  trialBalanceToJournalEntries,
} from "@/lib/domain/journal-ingest";
import {
  employeeListByTenantCodeAsc,
  tenantGetById,
} from "@/lib/pb/repository";
import type {
  JournalAggregate,
  JournalEntry,
  JournalMappingTarget,
} from "@/types/models";

/**
 * 업로드된 파일 한 건의 종류 추정.
 * - 이름에 "분개장"·"journal" → JOURNAL
 * - "잔액"·"거래처" → BALANCE
 * - "시산표"·"trial" → TRIAL_BALANCE
 * - 그 외 → UNKNOWN (확장자 기준 PDF/XLSX 만 보임)
 */
type FileKind = "JOURNAL_PDF" | "JOURNAL_XLSX" | "TRIAL_BALANCE_PDF" | "BALANCE_XLSX" | "UNKNOWN";

function detectFileKind(name: string): FileKind {
  const lower = name.toLowerCase();
  const isPdf = lower.endsWith(".pdf");
  const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  if (isPdf && /시산표|trial|재무제표/.test(name)) return "TRIAL_BALANCE_PDF";
  if (isPdf && /분개장|journal/.test(name)) return "JOURNAL_PDF";
  if (isPdf) return "JOURNAL_PDF"; // PDF 기본은 분개장으로 가정
  if (isXlsx && /분개장|journal/.test(name)) return "JOURNAL_XLSX";
  if (isXlsx && /잔액|거래처|balance/.test(name)) return "BALANCE_XLSX";
  if (isXlsx) return "BALANCE_XLSX";
  return "UNKNOWN";
}

export type ParseUploadedFilesResult =
  | {
      ok: true;
      aggregate: JournalAggregate;
      raw: { fileName: string; kind: FileKind; entries: number; warnings: string[] }[];
    }
  | { ok: false; error: string };

/**
 * 업로드된 분개장/시산표/잔액표 파일들을 파싱·집계.
 *
 * - PDF 분개장과 시산표를 동시에 업로드한 경우, **분개장 우선** 사용.
 *   (시산표 기반 의사 분개장은 분개장 파일이 전혀 없을 때만 사용)
 * - 결과는 PB에 저장하지 않고 호출부(클라이언트 상태)에 반환.
 *
 * userMappingOverridesJson: `{ "원계정명": "BIZ:59" | "OPERATION_COST" | ... }`
 * 형식의 JSON 문자열. 비워두면 기본 키워드 매핑.
 */
export async function parseUploadedFilesAction(
  _: ParseUploadedFilesResult | null,
  formData: FormData,
): Promise<ParseUploadedFilesResult> {
  const ctx = await resolveActionTenant();
  if (!ctx.ok) return { ok: false, error: ctx.message };
  if (!canEditCompanySettings(ctx.role)) {
    return { ok: false, error: "분개장 업로드 권한이 없습니다." };
  }

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "업로드된 파일이 없습니다." };

  const tenant = await tenantGetById(ctx.tenantId).catch(() => null);
  const employees = await employeeListByTenantCodeAsc(ctx.tenantId).catch(() => []);

  const allEntries: JournalEntry[] = [];
  const raw: { fileName: string; kind: FileKind; entries: number; warnings: string[] }[] = [];
  let trialBalanceFallback: JournalEntry[] = [];
  let hasJournal = false;

  for (const file of files) {
    const kind = detectFileKind(file.name);
    const buf = Buffer.from(await file.arrayBuffer());
    const fileWarnings: string[] = [];
    let entries: JournalEntry[] = [];

    try {
      if (kind === "JOURNAL_PDF" || kind === "TRIAL_BALANCE_PDF") {
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = pdfParseModule.default ?? pdfParseModule;
        const text = (await pdfParse(buf)).text;
        if (kind === "JOURNAL_PDF") {
          const j = parsePdfJournalText(text);
          /** 분개장이 한 건이라도 추출되면 분개장으로 인정 */
          if (j.entries.length > 0) {
            entries = j.entries;
            hasJournal = true;
          } else {
            /** 분개장 추정에 실패했으면 시산표로 한 번 더 시도 */
            const tb = parsePdfTrialBalanceText(text);
            if (tb.entries.length > 0) {
              trialBalanceFallback = trialBalanceFallback.concat(trialBalanceToJournalEntries(tb.entries));
              fileWarnings.push("PDF에서 분개장을 찾지 못해 시산표로 대체 집계합니다.");
            } else {
              fileWarnings.push("PDF에서 분개장/시산표 어느 쪽도 인식되지 않았습니다.");
            }
          }
          fileWarnings.push(...j.warnings);
        } else {
          const tb = parsePdfTrialBalanceText(text);
          trialBalanceFallback = trialBalanceFallback.concat(trialBalanceToJournalEntries(tb.entries));
          if (tb.entries.length === 0) fileWarnings.push("시산표 테이블을 찾지 못했습니다.");
        }
      } else if (kind === "JOURNAL_XLSX" || kind === "BALANCE_XLSX") {
        const xlsxModule = await import("xlsx");
        const wb = xlsxModule.read(buf, { type: "buffer" });
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          if (!sheet) continue;
          const rows = xlsxModule.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as Array<
            Array<string | number | null>
          >;
          const sheetKind = detectXlsxSheetKind(sheetName);
          if (sheetKind === "JOURNAL" || (kind === "JOURNAL_XLSX" && sheetKind === "UNKNOWN")) {
            const r = parseXlsxJournal(rows);
            if (r.entries.length > 0) {
              entries = entries.concat(r.entries);
              hasJournal = true;
            }
            fileWarnings.push(...r.warnings);
          } else if (sheetKind === "BALANCE" || (kind === "BALANCE_XLSX" && sheetKind === "UNKNOWN")) {
            const r = parseXlsxBalance(rows);
            trialBalanceFallback = trialBalanceFallback.concat(r.entries);
            fileWarnings.push(...r.warnings);
          }
        }
      } else {
        fileWarnings.push("지원되지 않는 파일 형식입니다(.pdf, .xlsx 만 지원).");
      }
    } catch (e) {
      console.error("[parseUploadedFilesAction] parse failed", file.name, e);
      const msg = e instanceof Error ? e.message : String(e);
      fileWarnings.push(`파싱 실패: ${msg}`);
    }

    allEntries.push(...entries);
    raw.push({ fileName: file.name, kind, entries: entries.length, warnings: fileWarnings });
  }

  /** 분개장이 하나도 없으면 시산표 폴백 사용 */
  const finalEntries = hasJournal ? allEntries : trialBalanceFallback;
  if (finalEntries.length === 0) {
    return { ok: false, error: "어느 파일에서도 집계 가능한 내용을 찾지 못했습니다." };
  }

  /** 사용자 매핑 override 파싱 */
  const overridesJson = formData.get("userMappingOverridesJson");
  const userMappingOverrides = parseUserMappingOverrides(typeof overridesJson === "string" ? overridesJson : null);

  const aggregate = aggregateJournalForOperatingReport({
    entries: finalEntries,
    tenant,
    employees,
    userMappingOverrides,
    source: {
      files: raw.map((r) => ({ name: r.fileName, kind: r.kind, entryCount: r.entries })),
      totalDebit: 0,
      totalCredit: 0,
      balanceOk: false,
    },
  });

  return { ok: true, aggregate, raw };
}

function parseUserMappingOverrides(json: string | null): Map<string, JournalMappingTarget> | undefined {
  if (!json) return undefined;
  try {
    const obj = JSON.parse(json) as Record<string, string>;
    const map = new Map<string, JournalMappingTarget>();
    for (const [key, value] of Object.entries(obj)) {
      const target = parseTargetValue(value);
      if (target) map.set(key, target);
    }
    return map.size > 0 ? map : undefined;
  } catch {
    return undefined;
  }
}

function parseTargetValue(value: string): JournalMappingTarget | null {
  if (value === "UNMAPPED") return { kind: "UNMAPPED" };
  if (value === "CASH_FLOW") return { kind: "CASH_FLOW" };
  if (value === "EMPLOYER_CONTRIBUTION") return { kind: "EMPLOYER_CONTRIBUTION" };
  if (value === "INTEREST_INCOME") return { kind: "INTEREST_INCOME" };
  if (value === "OPERATION_COST") return { kind: "OPERATION_COST" };
  const m = /^BIZ:(\d{2})$/.exec(value);
  if (m) {
    const code = parseInt(m[1], 10);
    if ([57, 58, 59, 60, 61, 62, 63, 64, 65, 66].includes(code)) {
      return { kind: "BIZ", code: code as 57 | 58 | 59 | 60 | 61 | 62 | 63 | 64 | 65 | 66 };
    }
  }
  return null;
}
