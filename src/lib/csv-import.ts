/** 사복 진행 조사표 형식 CSV 컬럼(한글/영문 별칭) → Employee 입력. 시트 실시간 연동 없음. */

import type { CompanySettings, Employee } from "@/types/models";

const ALIASES: Record<string, string> = {
  code: "employeeCode",
  CODE: "employeeCode",
  /** 취합 탭 등 시트 오타 헤더 */
  CDOE: "employeeCode",
  직원코드: "employeeCode",
  이름: "name",
  직급: "position",
  기존연봉: "baseSalary",
  조정급여: "adjustedSalary",
  사복지급분: "welfareAllocation",
  "사내근로복지기금 지급분": "welfareAllocation",
  인센티브: "incentiveAmount",
  알아서금액: "discretionaryAmount",
  대표반환: "flagRepReturn",
  배우자수령: "flagSpouseReceipt",
  "배우자 수령": "flagSpouseReceipt",
  "근로자 실질 수령": "flagWorkerNet",
  "근로자 실질 수령(반환분 제외)": "flagWorkerNet",
  근로자실질수령반환분제외: "flagWorkerNet",
  "입사 월": "hireMonth",
  입사월: "hireMonth",
  "입사 연도": "hireYear",
  입사연도: "hireYear",
  "퇴사 월": "resignMonth",
  퇴사월: "resignMonth",
  "퇴사 연도": "resignYear",
  퇴사연도: "resignYear",
  "생일 월만입력": "birthMonth",
  생일월: "birthMonth",
  "결혼기념월(예정월)": "weddingMonth",
  영유아: "childrenInfant",
  미취학아동: "childrenPreschool",
  미취학: "childrenPreschool",
  청소년: "childrenTeen",
  부모님: "parentsCount",
  시부모님: "parentsInLawCount",
  보험료: "insurancePremium",
  대출이자: "loanInterest",
  월세: "monthlyRentAmount",
  급여일: "payDay",
  레벨: "level",
};

function norm(s: string) {
  return s.replace(/^\uFEFF/, "").trim();
}

function parseBool(v: string): boolean {
  const x = v.trim().toLowerCase();
  return x === "y" || x === "1" || x === "true" || x === "예" || x === "o";
}

/**
 * RFC4180 호환 파서.
 * - `"foo,bar"` 같이 따옴표 안에 쉼표 허용
 * - 따옴표 안 `""` 는 리터럴 `"`
 * - CR/LF 는 따옴표 밖에서만 행 구분자
 * - 마지막 빈 줄은 결과에 포함하지 않음
 *
 * 단순 split(",") 대비 사용자가 손으로 다듬은 조사표(이름·메모에 쉼표/줄바꿈 포함) 손상을 방지한다.
 */
export function parseCsvRfc4180(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      if (i + 1 < len && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] != null && r[0] !== ""));
}

export type CsvRowResult = {
  row: number;
  employeeCode: string;
  fields: Record<string, string | number | boolean | null>;
  오류?: string;
};

export function parseEmployeeCsv(text: string): CsvRowResult[] {
  const rows = parseCsvRfc4180(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((c) => norm(c));
  const colIndex: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = ALIASES[h] ?? ALIASES[h.replace(/\s+/g, "")] ?? h;
    colIndex[key] = i;
  });

  const out: CsvRowResult[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r].map((c) => norm(c));
    const get = (logical: string) => {
      const idx = colIndex[logical];
      if (idx === undefined) return "";
      return cells[idx] ?? "";
    };

    const employeeCode = String(get("employeeCode") || get("CODE") || "");
    const fields: Record<string, string | number | boolean | null> = {
      employeeCode,
      name: String(get("name") || ""),
      position: String(get("position") || ""),
      baseSalary: String(get("baseSalary") || "0").replace(/,/g, ""),
      adjustedSalary: String(get("adjustedSalary") || "0").replace(/,/g, ""),
      welfareAllocation: String(get("welfareAllocation") || "0").replace(/,/g, ""),
      incentiveAmount: String(get("incentiveAmount") || "").replace(/,/g, "") || null,
      discretionaryAmount: String(get("discretionaryAmount") || "").replace(/,/g, "") || null,
      birthMonth: get("birthMonth") ? parseInt(String(get("birthMonth")), 10) : null,
      hireMonth: get("hireMonth") ? parseInt(String(get("hireMonth")), 10) : null,
      hireYear: get("hireYear") ? parseInt(String(get("hireYear")), 10) : null,
      resignMonth: get("resignMonth") ? parseInt(String(get("resignMonth")), 10) : null,
      resignYear: get("resignYear") ? parseInt(String(get("resignYear")), 10) : null,
      weddingMonth: get("weddingMonth") ? parseInt(String(get("weddingMonth")), 10) : null,
      childrenInfant: parseInt(String(get("childrenInfant") || "0"), 10) || 0,
      childrenPreschool: parseInt(String(get("childrenPreschool") || "0"), 10) || 0,
      childrenTeen: parseInt(String(get("childrenTeen") || "0"), 10) || 0,
      parentsCount: parseInt(String(get("parentsCount") || "0"), 10) || 0,
      parentsInLawCount: parseInt(String(get("parentsInLawCount") || "0"), 10) || 0,
      insurancePremium: String(get("insurancePremium") || "0").replace(/,/g, ""),
      loanInterest: String(get("loanInterest") || "0").replace(/,/g, ""),
      monthlyRentAmount: String(get("monthlyRentAmount") || "").replace(/,/g, "") || null,
      payDay: get("payDay") ? parseInt(String(get("payDay")), 10) : null,
      level: parseInt(String(get("level") || "3"), 10) || 3,
      flagAutoAmount: parseBool(String(get("flagAutoAmount") || "")),
      flagRepReturn: parseBool(String(get("flagRepReturn") || "")),
      flagSpouseReceipt: parseBool(String(get("flagSpouseReceipt") || "")),
      flagWorkerNet: parseBool(String(get("flagWorkerNet") || "")),
    };

    let 오류: string | undefined;
    if (!employeeCode) 오류 = "직원 코드 없음";
    if (!fields.name) 오류 = "이름 없음";

    out.push({ row: r + 1, employeeCode, fields, 오류 });
  }
  return out;
}

/** 참고 시트 「직원정보」 열 순서(조사표 플래그 열 제외) + 앱 확장(레벨, 예상 인센) */
const SHEET_EMPLOYEE_EXPORT_HEADERS_CORE = [
  "CODE",
  "이름",
  "직급",
  "기존연봉",
  "조정급여",
  "사복지급분",
  "알아서금액",
] as const;

const SHEET_EMPLOYEE_EXPORT_HEADERS_TAIL = [
  "입사 연도",
  "입사 월",
  "퇴사 연도",
  "퇴사 월",
  "생일 월만입력",
  "결혼기념월(예정월)",
  "영유아",
  "미취학아동",
  "청소년",
  "부모님",
  "시부모님",
  "보험료",
  "대출이자",
  "월세",
  "급여일",
  "레벨",
  "예상 인센",
] as const;

const SURVEY_HEADER_REP = "대표반환";
const SURVEY_HEADER_SPOUSE = "배우자수령";
const SURVEY_HEADER_WORKER = "근로자 실질 수령(반환분 제외)";

function surveyExportHeaders(settings: CompanySettings | null): string[] {
  const h: string[] = [];
  if (settings?.surveyShowRepReturn) h.push(SURVEY_HEADER_REP);
  if (settings?.surveyShowSpouseReceipt) h.push(SURVEY_HEADER_SPOUSE);
  if (settings?.surveyShowWorkerNet) h.push(SURVEY_HEADER_WORKER);
  return h;
}

/** 전사 설정에 따라 조사표 플래그 열이 가변 — 문서·다운로드 시 `buildEmployeeSheetCsv`와 동일 규칙 */
export function sheetEmployeeExportHeaders(settings: CompanySettings | null): string[] {
  return [
    ...SHEET_EMPLOYEE_EXPORT_HEADERS_CORE,
    ...surveyExportHeaders(settings),
    ...SHEET_EMPLOYEE_EXPORT_HEADERS_TAIL,
  ];
}

function csvEscapeCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function wonCell(n: number | null | undefined): string {
  return Math.round(Number(n) || 0).toLocaleString("ko-KR");
}

function ynCell(b: boolean): string {
  return b ? "Y" : "";
}

/** 스프레드시트에 붙여넣기 하기 좋은 한 행. 숫자는 ko-KR 콤마 형식. */
export function employeeToSheetCsvCells(e: Employee, settings: CompanySettings | null): string[] {
  const survey: string[] = [];
  if (settings?.surveyShowRepReturn) survey.push(ynCell(e.flagRepReturn));
  if (settings?.surveyShowSpouseReceipt) survey.push(ynCell(e.flagSpouseReceipt));
  if (settings?.surveyShowWorkerNet) survey.push(ynCell(e.flagWorkerNet));

  return [
    e.employeeCode,
    e.name,
    e.position,
    wonCell(e.baseSalary),
    wonCell(e.adjustedSalary),
    wonCell(e.welfareAllocation),
    e.discretionaryAmount != null && Number(e.discretionaryAmount) !== 0 ? wonCell(e.discretionaryAmount) : "",
    ...survey,
    e.hireYear != null ? String(e.hireYear) : "",
    e.hireMonth != null ? String(e.hireMonth) : "",
    e.resignYear != null ? String(e.resignYear) : "",
    e.resignMonth != null ? String(e.resignMonth) : "",
    e.birthMonth != null ? String(e.birthMonth) : "",
    e.weddingMonth != null ? String(e.weddingMonth) : "",
    String(e.childrenInfant),
    String(e.childrenPreschool),
    String(e.childrenTeen),
    String(e.parentsCount),
    String(e.parentsInLawCount),
    wonCell(e.insurancePremium),
    wonCell(e.loanInterest),
    e.monthlyRentAmount != null && Number(e.monthlyRentAmount) !== 0 ? wonCell(e.monthlyRentAmount) : "",
    e.payDay != null ? String(e.payDay) : "",
    String(e.level),
    e.incentiveAmount != null && Number(e.incentiveAmount) > 0 ? wonCell(e.incentiveAmount) : "",
  ];
}

/** UTF-8 BOM + CSV 한 덩어리(파일 저장·다른 도구에 붙여넣기용) */
export function buildEmployeeSheetCsv(employees: Employee[], settings: CompanySettings | null): string {
  const header = sheetEmployeeExportHeaders(settings).map(csvEscapeCell).join(",");
  const body = employees
    .map((e) => employeeToSheetCsvCells(e, settings).map(csvEscapeCell).join(","))
    .join("\r\n");
  return `\uFEFF${header}\r\n${body}\r\n`;
}
