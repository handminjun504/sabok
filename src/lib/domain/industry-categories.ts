/**
 * 통계청 한국표준산업분류(KSIC) **대분류** 21개.
 * 양식 [별지 제15호서식] 3쪽 작성방법 2: ⑧ 업종란은 대분류 업종명을 적는다.
 * 코드(A~U)와 라벨을 한 곳에서 관리하고, `Tenant.industry` 는 코드만 저장한다.
 */
export type IndustryCode =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U";

export const INDUSTRY_CATEGORIES: { code: IndustryCode; label: string }[] = [
  { code: "A", label: "농업, 임업 및 어업" },
  { code: "B", label: "광업" },
  { code: "C", label: "제조업" },
  { code: "D", label: "전기, 가스, 증기 및 공기 조절 공급업" },
  { code: "E", label: "수도, 하수 및 폐기물 처리, 원료 재생업" },
  { code: "F", label: "건설업" },
  { code: "G", label: "도매 및 소매업" },
  { code: "H", label: "운수 및 창고업" },
  { code: "I", label: "숙박 및 음식점업" },
  { code: "J", label: "정보통신업" },
  { code: "K", label: "금융 및 보험업" },
  { code: "L", label: "부동산업" },
  { code: "M", label: "전문, 과학 및 기술 서비스업" },
  { code: "N", label: "사업시설 관리, 사업 지원 및 임대 서비스업" },
  { code: "O", label: "공공행정, 국방 및 사회보장 행정" },
  { code: "P", label: "교육 서비스업" },
  { code: "Q", label: "보건업 및 사회복지 서비스업" },
  { code: "R", label: "예술, 스포츠 및 여가관련 서비스업" },
  { code: "S", label: "협회 및 단체, 수리 및 기타 개인 서비스업" },
  { code: "T", label: "가구내 고용활동 및 달리 분류되지 않은 자가소비 생산활동" },
  { code: "U", label: "국제 및 외국기관" },
];

const CODE_SET = new Set(INDUSTRY_CATEGORIES.map((c) => c.code));

export function isIndustryCode(v: unknown): v is IndustryCode {
  return typeof v === "string" && CODE_SET.has(v as IndustryCode);
}

export function industryLabelOf(code: string | null | undefined): string {
  if (!code) return "";
  const hit = INDUSTRY_CATEGORIES.find((c) => c.code === code);
  return hit?.label ?? code;
}
