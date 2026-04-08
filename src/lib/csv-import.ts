/** Google 시트·CSV 컬럼(한글/영문 별칭) → Employee 입력 */

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
