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
  discretionaryAmount: number | null;
};

/** `ScheduleAnnouncementPanel` 에 넘기는 행 — 와이어를 파싱한 결과 */
export type ScheduleAnnouncementPanelRow = {
  employeeCode: string;
  name: string;
  welfareByMonth: Record<number, number>;
  announcementSalaryByMonthList: readonly number[];
  salaryMonth: number;
  flagRepReturn: boolean;
  discretionaryAmount: number | null;
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
    discretionaryAmount: number | null;
  }>,
): string {
  const wire: ScheduleAnnouncementWireRow[] = rows.map((r) => {
    const w12 = Array.from({ length: 12 }, (_, i) => Math.round(r.welfareByMonth[i + 1] ?? 0));
    const sal12 = coerceLength12([...r.announcementSalaryByMonthList]);
    return {
      employeeCode: r.employeeCode,
      name: r.name,
      welfare12: w12,
      salaryNotice12: sal12,
      salaryMonthFloor: Math.round(r.salaryMonth),
      flagRepReturn: Boolean(r.flagRepReturn),
      discretionaryAmount:
        r.discretionaryAmount != null && Number.isFinite(Number(r.discretionaryAmount))
          ? Math.round(Number(r.discretionaryAmount))
          : null,
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
    out.push({
      employeeCode: String(o.employeeCode ?? ""),
      name: String(o.name ?? ""),
      welfareByMonth: welfareRecordFrom12(welfare12),
      announcementSalaryByMonthList: salaryNotice12,
      salaryMonth: salaryMonthFloor,
      flagRepReturn: Boolean(o.flagRepReturn),
      discretionaryAmount: (() => {
        if (o.discretionaryAmount == null || o.discretionaryAmount === "") return null;
        const n = Number(o.discretionaryAmount);
        return Number.isFinite(n) ? Math.round(n) : null;
      })(),
    });
  }
  return out;
}
