/** 사복 진행 조사표 형식 CSV 컬럼(한글/영문 별칭) → Employee 입력. 시트 실시간 연동 없음. */

import type { Employee } from "@/types/models";

const ALIASES: Record<string, string> = {
  code: "employeeCode",
  CODE: "employeeCode",
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
  "생일 월만입력": "birthMonth",
  생일월: "birthMonth",
  "결혼기념월(예정월)": "weddingMonth",
  영유아: "childrenInfant",
  미취학아동: "childrenPreschool",
  청소년: "childrenTeen",
  부모님: "parentsCount",
  시부모님: "parentsInLawCount",
  보험료: "insurancePremium",
  대출이자: "loanInterest",
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

export type CsvRowResult = {
  row: number;
  employeeCode: string;
  fields: Record<string, string | number | boolean | null>;
  오류?: string;
};

export function parseEmployeeCsv(text: string): CsvRowResult[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((c) => norm(c.replace(/^"|"$/g, "")));
  const colIndex: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = ALIASES[h] ?? ALIASES[h.replace(/\s+/g, "")] ?? h;
    colIndex[key] = i;
  });

  const out: CsvRowResult[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(",").map((c) => norm(c.replace(/^"|"$/g, "")));
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
      weddingMonth: get("weddingMonth") ? parseInt(String(get("weddingMonth")), 10) : null,
      childrenInfant: parseInt(String(get("childrenInfant") || "0"), 10) || 0,
      childrenPreschool: parseInt(String(get("childrenPreschool") || "0"), 10) || 0,
      childrenTeen: parseInt(String(get("childrenTeen") || "0"), 10) || 0,
      parentsCount: parseInt(String(get("parentsCount") || "0"), 10) || 0,
      parentsInLawCount: parseInt(String(get("parentsInLawCount") || "0"), 10) || 0,
      insurancePremium: String(get("insurancePremium") || "0").replace(/,/g, ""),
      loanInterest: String(get("loanInterest") || "0").replace(/,/g, ""),
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

/** 참고 시트 「직원정보」 열 순서 + 앱 확장(레벨, 예상 인센) — CSV 보내기/문서 단일 기준 */
export const SHEET_EMPLOYEE_EXPORT_HEADERS = [
  "CODE",
  "이름",
  "직급",
  "기존연봉",
  "조정급여",
  "사복지급분",
  "알아서금액",
  "대표반환",
  "배우자수령",
  "근로자 실질 수령(반환분 제외)",
  "입사 월",
  "생일 월만입력",
  "결혼기념월(예정월)",
  "영유아",
  "미취학아동",
  "청소년",
  "부모님",
  "시부모님",
  "보험료",
  "대출이자",
  "급여일",
  "레벨",
  "예상 인센",
] as const;

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
export function employeeToSheetCsvCells(e: Employee): string[] {
  return [
    e.employeeCode,
    e.name,
    e.position,
    wonCell(e.baseSalary),
    wonCell(e.adjustedSalary),
    wonCell(e.welfareAllocation),
    e.discretionaryAmount != null && Number(e.discretionaryAmount) !== 0 ? wonCell(e.discretionaryAmount) : "",
    ynCell(e.flagRepReturn),
    ynCell(e.flagSpouseReceipt),
    ynCell(e.flagWorkerNet),
    e.hireMonth != null ? String(e.hireMonth) : "",
    e.birthMonth != null ? String(e.birthMonth) : "",
    e.weddingMonth != null ? String(e.weddingMonth) : "",
    String(e.childrenInfant),
    String(e.childrenPreschool),
    String(e.childrenTeen),
    String(e.parentsCount),
    String(e.parentsInLawCount),
    wonCell(e.insurancePremium),
    wonCell(e.loanInterest),
    e.payDay != null ? String(e.payDay) : "",
    String(e.level),
    e.incentiveAmount != null && Number(e.incentiveAmount) > 0 ? wonCell(e.incentiveAmount) : "",
  ];
}

/** UTF-8 BOM + CSV 한 덩어리(파일 저장·다른 도구에 붙여넣기용) */
export function buildEmployeeSheetCsv(employees: Employee[]): string {
  const header = SHEET_EMPLOYEE_EXPORT_HEADERS.map(csvEscapeCell).join(",");
  const body = employees.map((e) => employeeToSheetCsvCells(e).map(csvEscapeCell).join(",")).join("\r\n");
  return `\uFEFF${header}\r\n${body}\r\n`;
}
