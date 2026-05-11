/**
 * 안내 탭(급여분·사복 멘트)만 서버에서 만들어 JSON 문자열로 넘길 때의 와이어 형식.
 * 객체 배열을 클라이언트 경계에서 넘기면 필드가 비는 경우가 있어, 문자열 한 방으로 고정한다.
 */
export type ScheduleAnnouncementWireRow = {
  employeeCode: string;
  name: string;
  /** 길이 12 — 인덱스 0 = 1월 사복 합계 */
  welfare12: number[];
  /** 길이 12 — 인덱스 0 = 1월, `floor(급여분 연간÷12)` 가 활성 월마다 동일 반복 */
  salaryNotice12: number[];
  /** 멘트 배열이 깨졌을 때만 쓰는 바닥 월액(연봉÷12 내림 등) */
  salaryMonthFloor: number;
  flagRepReturn: boolean;
  /** 길이 12 — 대표반환 직원별 월별 금액 (입력 없으면 0) */
  repReturn12: number[];
  /** 길이 12 — 배우자수령 직원별 월별 금액 (입력 없으면 0) */
  spouseReceipt12: number[];
  /** 길이 12 — 알아서금액 직원별 월별 금액 (입력 없으면 0) */
  discretionary12: number[];
  /**
   * 「+ 반환 추가」 사용자 정의 카테고리 — 직원별 라벨·길이 12 금액 배열.
   * 라벨이 비거나 12 칸 모두 0 인 카테고리는 직렬화 시 제외.
   */
  customReturns12: Array<{ label: string; amounts: number[] }>;
  /**
   * 「퇴사자 안내 정산 — 급여 추가 지급(true-up)」 정보. SALARY_WELFARE/COMBINED 퇴사자에만 채워진다.
   *  - `month`: true-up 차액이 합산되는 활성 월(보통 퇴사월). 그 달 안내 카드에서만 내역 라인 노출.
   *  - `breakdown`: "내역: 낮춘급여 X + 인센 Y − 사복지급 Z − 차감 W(메모)" 한 줄. 빈 문자열은 노출 안 함.
   * 누락/null 인 행은 안내에서 별도 처리하지 않는다(기존 동작 동일).
   */
  trueUp?: { month: number; breakdown: string } | null;
};

/** `ScheduleAnnouncementPanel` 에 넘기는 행 — 와이어를 파싱한 결과 */
export type ScheduleAnnouncementPanelRow = {
  employeeCode: string;
  name: string;
  welfareByMonth: Record<number, number>;
  announcementSalaryByMonthList: readonly number[];
  salaryMonth: number;
  flagRepReturn: boolean;
  /** 직원 ID 별 1~12월 — 인덱스 m-1 = m월 금액 */
  repReturnByMonth: Record<number, number>;
  spouseReceiptByMonth: Record<number, number>;
  discretionaryByMonth: Record<number, number>;
  /**
   * 「+ 반환 추가」 사용자 정의 카테고리 — 직원별 라벨·{ 1~12 월 금액 } 맵.
   * 빈 배열은 「표시할 줄 없음」.
   */
  customReturnsByMonth: ReadonlyArray<{ label: string; byMonth: Record<number, number> }>;
  /**
   * 「퇴사자 true-up 차액 + 내역 요약」 — 패널이 focusMonth === trueUp.month 일 때 안내 라인에 노출.
   * 비퇴사자·재직자는 null.
   */
  trueUp: { month: number; breakdown: string } | null;
};

function coerceLength12(raw: unknown): number[] {
  if (!Array.isArray(raw)) return Array.from({ length: 12 }, () => 0);
  const a = raw.map((x) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0));
  if (a.length >= 12) return a.slice(0, 12);
  return [...a, ...Array.from({ length: 12 - a.length }, () => 0)];
}

function welfareRecordFrom12(w12: number[]): Record<number, number> {
  const o: Record<number, number> = {};
  for (let i = 0; i < 12; i++) {
    o[i + 1] = w12[i] ?? 0;
  }
  return o;
}

/** 서버: 카드 행에서 안내 탭용 JSON 문자열 생성 */
export function encodeAnnouncementPanelPayloadJson(
  rows: ReadonlyArray<{
    employeeCode: string;
    name: string;
    welfareByMonth: Record<number, number>;
    announcementSalaryByMonthList: readonly number[];
    salaryMonth: number;
    flagRepReturn: boolean;
    /** 인덱스 m-1 = m월 금액 — 없으면 0 */
    repReturnByMonth?: Record<number, number>;
    spouseReceiptByMonth?: Record<number, number>;
    discretionaryByMonth?: Record<number, number>;
    /** 「+ 반환 추가」 사용자 정의 카테고리 — 카테고리 단위 라벨·12-칸 배열 */
    customReturnsByMonth?: ReadonlyArray<{ label: string; byMonth: Record<number, number> }>;
    /** 퇴사자 안내 정산용 true-up 정보 — 없으면 null/undefined. */
    trueUp?: { month: number; breakdown: string } | null;
  }>,
): string {
  const buildMonth12 = (src: Record<number, number> | undefined): number[] => {
    if (!src) return Array.from({ length: 12 }, () => 0);
    return Array.from({ length: 12 }, (_, i) => {
      const v = src[i + 1];
      return Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0;
    });
  };
  const buildCustomReturns12 = (
    src: ReadonlyArray<{ label: string; byMonth: Record<number, number> }> | undefined,
  ): Array<{ label: string; amounts: number[] }> => {
    if (!src || src.length === 0) return [];
    const out: Array<{ label: string; amounts: number[] }> = [];
    for (const c of src) {
      const label = typeof c.label === "string" ? c.label.trim() : "";
      if (!label) continue;
      const amounts = buildMonth12(c.byMonth);
      const allZero = amounts.every((v) => v <= 0);
      if (allZero) continue;
      out.push({ label, amounts });
    }
    return out;
  };
  const wire: ScheduleAnnouncementWireRow[] = rows.map((r) => {
    const w12 = Array.from({ length: 12 }, (_, i) => Math.round(r.welfareByMonth[i + 1] ?? 0));
    const sal12 = coerceLength12([...r.announcementSalaryByMonthList]);
    /**
     * 「퇴사자 true-up」 정보 정규화 — month ∈ [1..12] 이고 breakdown 이 비어 있지 않을 때만 동봉.
     * 그 외는 null 로 박아 패널·빌더가 무시한다(기존 행은 회귀 없음).
     */
    const tu = r.trueUp;
    let trueUpOut: { month: number; breakdown: string } | null = null;
    if (tu != null) {
      const m = Math.round(Number(tu.month));
      const breakdown = typeof tu.breakdown === "string" ? tu.breakdown.trim() : "";
      if (Number.isFinite(m) && m >= 1 && m <= 12 && breakdown.length > 0) {
        trueUpOut = { month: m, breakdown };
      }
    }
    return {
      employeeCode: r.employeeCode,
      name: r.name,
      welfare12: w12,
      salaryNotice12: sal12,
      salaryMonthFloor: Math.round(r.salaryMonth),
      flagRepReturn: Boolean(r.flagRepReturn),
      repReturn12: buildMonth12(r.repReturnByMonth),
      spouseReceipt12: buildMonth12(r.spouseReceiptByMonth),
      discretionary12: buildMonth12(r.discretionaryByMonth),
      customReturns12: buildCustomReturns12(r.customReturnsByMonth),
      trueUp: trueUpOut,
    };
  });
  return JSON.stringify(wire);
}

/** 클라이언트: JSON 문자열 → 패널 행 */
export function parseAnnouncementPanelPayloadJson(json: string): ScheduleAnnouncementPanelRow[] {
  if (typeof json !== "string" || json.trim() === "") return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: ScheduleAnnouncementPanelRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const welfare12 = coerceLength12(o.welfare12);
    const salaryNotice12 = coerceLength12(o.salaryNotice12);
    const floorRaw = o.salaryMonthFloor;
    const salaryMonthFloor =
      Number.isFinite(Number(floorRaw)) ? Math.round(Number(floorRaw)) : 0;
    /**
     * 「true-up」 파싱 — wire 에 누락/잘못된 형태면 null. 후방 호환 위해 옵셔널.
     */
    let trueUpParsed: { month: number; breakdown: string } | null = null;
    const tuRaw = o.trueUp;
    if (tuRaw && typeof tuRaw === "object") {
      const t = tuRaw as Record<string, unknown>;
      const m = Math.round(Number(t.month));
      const breakdown = typeof t.breakdown === "string" ? t.breakdown.trim() : "";
      if (Number.isFinite(m) && m >= 1 && m <= 12 && breakdown.length > 0) {
        trueUpParsed = { month: m, breakdown };
      }
    }
    out.push({
      employeeCode: String(o.employeeCode ?? ""),
      name: String(o.name ?? ""),
      welfareByMonth: welfareRecordFrom12(welfare12),
      announcementSalaryByMonthList: salaryNotice12,
      salaryMonth: salaryMonthFloor,
      flagRepReturn: Boolean(o.flagRepReturn),
      repReturnByMonth: welfareRecordFrom12(coerceLength12(o.repReturn12)),
      spouseReceiptByMonth: welfareRecordFrom12(coerceLength12(o.spouseReceipt12)),
      discretionaryByMonth: welfareRecordFrom12(coerceLength12(o.discretionary12)),
      customReturnsByMonth: parseCustomReturns12(o.customReturns12),
      trueUp: trueUpParsed,
    });
  }
  return out;
}

/**
 * 와이어 customReturns12 → 패널 행의 `customReturnsByMonth`.
 * 라벨 trim·빈 라벨 제외·12 칸 정규화. 라벨 정렬은 빌더가 출력 시점에 적용한다.
 */
function parseCustomReturns12(
  raw: unknown,
): { label: string; byMonth: Record<number, number> }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; byMonth: Record<number, number> }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    const amounts = coerceLength12(o.amounts);
    const allZero = amounts.every((v) => v <= 0);
    if (allZero) continue;
    out.push({ label, byMonth: welfareRecordFrom12(amounts) });
  }
  return out;
}
