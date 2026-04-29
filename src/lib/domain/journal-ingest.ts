/**
 * 분개장(PDF/XLSX)·합계잔액시산표·거래처별 잔액표 파싱 & 양식 제15호서식 집계 로직.
 *
 * 이 모듈은 **원 단위**로 집계한 JournalAggregate 를 생성하며,
 * 단위 변환(원→천원)은 최종 표시·직렬화 단계에서 수행한다.
 *
 * 단계:
 *  1) parsePdfJournalText / parseXlsxJournal / parsePdfTrialBalanceText / parseXlsxTrialBalance
 *  2) mapAccountToTarget (계정명 → 양식 칸 매핑)
 *  3) isExternalParty (거래처 → 외부/직원 판정)
 *  4) aggregateJournalForOperatingReport (양식별 금액·수혜자·매핑로그 생성)
 *
 * PB 저장은 이 모듈 범위 밖이며, 결과는 세션/UI 상태로만 취급한다.
 */

import type {
  Employee,
  JournalAggregate,
  JournalEntry,
  JournalMappingLogItem,
  JournalMappingTarget,
  Tenant,
} from "@/types/models";

/** 원 단위 입력 → 천원 반올림 */
export function toThousand(amountWon: number): number {
  if (!Number.isFinite(amountWon)) return 0;
  return Math.round(amountWon / 1000);
}

/** 공백·제로폭 문자를 완전히 제거해 계정명 매칭 키 생성 */
export function normalizeAccountName(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** --- PDF 분개장 파서 --- */

/** 라인 끝 숫자(쉼표 포함) — 금액 후보 */
const TRAILING_AMOUNT_RE = /([\d,]+)\s*$/;
/** 라인 전체가 숫자(쉼표 포함) — 계정명이 긴 경우 금액이 다음 줄로 밀려남 */
const PURE_AMOUNT_RE = /^\s*([\d,]+)\s*$/;
/** 페이지 헤더/푸터·메타 라인 패턴 — pdf-parse 결과(공백 제거됨) 기준 */
const SKIP_LINE_PATTERNS: RegExp[] = [
  /^구\s*분차\s*변대\s*변$/,
  /^구\s*분\s*차\s*변\s*대\s*변$/,
  /^월\/일번호계/,
  /^월\/일\s+번호/,
  /계\s*정\s*과\s*목/,
  /^분\s*개\s*장$/,
  /^회사명[:\s]/,
  /^\d{4}\.\d{2}\.\d{2}\s*~\s*\d{4}\.\d{2}\.\d{2}$/,
  /^--\s*\d+\s*of\s*\d+\s*--$/,
  /^합\s*계\s*[\d,]+[\s,]*[\d,]*\s*$/,
  /^$/,
];

function isSkipLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return SKIP_LINE_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * "합 계 640,445,358 640,445,358" 또는 "합계640,445,358640,445,358" 라인에서 차·대 총합 추출.
 * 두 숫자 중 하나만 있으면 그 값을 양쪽 동일로 반환.
 */
function extractGrandTotal(text: string): { debit: number; credit: number } | null {
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    /** 쉼표가 붙은 큰 숫자가 2개 연속/붙어있는 경우 */
    const m2 = /^합\s*계\s*([\d,]+)\s+([\d,]+)\s*$/.exec(trimmed);
    if (m2) {
      return {
        debit: parseInt(m2[1].replace(/,/g, ""), 10),
        credit: parseInt(m2[2].replace(/,/g, ""), 10),
      };
    }
    /** "합계A,BCD,EFGA,BCD,EFG" 형태(같은 숫자 2번 연결)를 길이 반으로 쪼개 탐지 */
    const m1 = /^합\s*계\s*([\d,]+)\s*$/.exec(trimmed);
    if (m1) {
      const raw = m1[1];
      if (raw.length >= 2 && raw.length % 2 === 0) {
        const half = raw.length / 2;
        const left = raw.slice(0, half);
        const right = raw.slice(half);
        if (left === right) {
          return {
            debit: parseInt(left.replace(/,/g, ""), 10),
            credit: parseInt(right.replace(/,/g, ""), 10),
          };
        }
      }
      const v = parseInt(raw.replace(/,/g, ""), 10);
      if (Number.isFinite(v)) return { debit: v, credit: v };
    }
  }
  return null;
}

/** 기간 추출: "2025.01.01 ~ 2025.12.31" */
function extractPeriod(text: string): { from: string | null; to: string | null } {
  const m = /(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(text);
  if (!m) return { from: null, to: null };
  return {
    from: `${m[1]}-${m[2]}-${m[3]}`,
    to: `${m[4]}-${m[5]}-${m[6]}`,
  };
}

function yearFromPeriod(text: string): number | null {
  const m = /(\d{4})\.(\d{2})\.(\d{2})\s*~/.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * 엔트리 시작 라인에서 "MM/DD", 전표번호, 나머지를 뽑는다.
 * 관찰된 두 포맷 모두 수용:
 *   - "01/2100001보    통    예    금9,729,000"
 *   - "01/21 00001 보 통 예 금 9,729,000"
 */
function parseEntryStart(line: string): { mm: string; dd: string; entryNo: string; rest: string } | null {
  /** 패턴1: 공백 없이 밀착 */
  const m1 = /^(\d{2})\/(\d{2})(\d{5})(.*)$/.exec(line.trim());
  if (m1) return { mm: m1[1], dd: m1[2], entryNo: m1[3], rest: m1[4] ?? "" };
  /** 패턴2: 공백 구분 */
  const m2 = /^(\d{2})\/(\d{2})\s+(\d{3,6})\b(.*)$/.exec(line.trim());
  if (m2) return { mm: m2[1], dd: m2[2], entryNo: m2[3], rest: m2[4] ?? "" };
  return null;
}

/**
 * PDF 분개장 텍스트(전체 텍스트) → JournalEntry[].
 *
 * 관찰된 포맷:
 *   [페이지 헤더/기타 스킵 라인]
 *   01/2100001보    통    예    금9,729,000     ← 엔트리 시작(차변/CASH_FLOW)
 *   명 절 지원금(상품권)(판)9,729,000          ← 대변 1줄~N줄
 *   [거래처 라인 (숫자 없음)]
 *   ...
 *   합계640,445,358640,445,358
 *
 * 예외: 계정명이 길면 금액이 다음 줄로 밀려남.
 *   "독서 및 문화생활 장려금(생일)(판)"
 *   "1,000,000"
 */
export function parsePdfJournalText(text: string): {
  entries: JournalEntry[];
  grandTotal: { debit: number; credit: number } | null;
  period: { from: string | null; to: string | null };
  warnings: string[];
} {
  const warnings: string[] = [];
  const year = yearFromPeriod(text);
  const period = extractPeriod(text);
  const grandTotal = extractGrandTotal(text);

  const rawLines = text.split(/\r?\n/);
  const entries: JournalEntry[] = [];

  let cur: {
    date: string | null;
    entryNo: string | null;
    debitAccount: string | null;
    debitAmount: number;
    creditLines: Array<{ account: string; amount: number; sourceLine: number }>;
    /** 금액이 다음 줄로 밀린 대변 계정명을 임시 보관 */
    pendingCreditAccount: string | null;
    pendingCreditSourceLine: number | null;
    partyLineBuf: string[];
  } | null = null;

  const commit = () => {
    if (!cur) return;
    if (cur.debitAccount && cur.debitAmount > 0) {
      entries.push({
        date: cur.date,
        entryNo: cur.entryNo,
        account: cur.debitAccount,
        side: "DEBIT",
        amount: cur.debitAmount,
        party: cur.partyLineBuf.join(" ") || null,
        memo: null,
        sourceLine: null,
      });
    }
    for (const c of cur.creditLines) {
      entries.push({
        date: cur.date,
        entryNo: cur.entryNo,
        account: c.account,
        side: "CREDIT",
        amount: c.amount,
        party: cur.partyLineBuf.join(" ") || null,
        memo: null,
        sourceLine: c.sourceLine,
      });
    }
    cur = null;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (isSkipLine(line)) continue;

    const s = parseEntryStart(line);
    if (s) {
      commit();
      const rest = s.rest.trim();
      const amtM = TRAILING_AMOUNT_RE.exec(rest);
      let debitAccount: string | null = null;
      let debitAmount = 0;
      if (amtM && amtM.index != null) {
        debitAmount = parseInt(amtM[1].replace(/,/g, ""), 10);
        debitAccount = rest.slice(0, amtM.index).trim();
      } else {
        debitAccount = rest;
      }
      cur = {
        date: year ? `${year}-${s.mm}-${s.dd}` : `${s.mm}/${s.dd}`,
        entryNo: s.entryNo,
        debitAccount: debitAccount ? normalizeAccountName(debitAccount) : null,
        debitAmount,
        creditLines: [],
        pendingCreditAccount: null,
        pendingCreditSourceLine: null,
        partyLineBuf: [],
      };
      continue;
    }

    if (!cur) continue;

    const trimmed = line.trim();

    /** (a) 숫자만 있는 라인 — pending 계정의 금액 */
    const pureM = PURE_AMOUNT_RE.exec(trimmed);
    if (pureM) {
      if (cur.pendingCreditAccount) {
        const amount = parseInt(pureM[1].replace(/,/g, ""), 10);
        cur.creditLines.push({
          account: cur.pendingCreditAccount,
          amount,
          sourceLine: cur.pendingCreditSourceLine ?? i + 1,
        });
        cur.pendingCreditAccount = null;
        cur.pendingCreditSourceLine = null;
      }
      continue;
    }

    /** (b) 계정명 + 금액이 같은 라인에 있는 경우 */
    const amtM = TRAILING_AMOUNT_RE.exec(trimmed);
    if (amtM) {
      const digitsOnly = amtM[1].replace(/,/g, "");
      /** 최소 1자리 이상 숫자 + 계정명이 비어있지 않아야 금액으로 인정 */
      if (/^\d+$/.test(digitsOnly) && amtM.index != null && amtM.index > 0) {
        /** pending 계정이 있는데 새 금액이 포함된 줄이 오면, pending 은 버림 처리(잘못된 파싱 회피) */
        cur.pendingCreditAccount = null;
        cur.pendingCreditSourceLine = null;
        const amount = parseInt(digitsOnly, 10);
        const accountPart = trimmed.slice(0, amtM.index);
        cur.creditLines.push({
          account: normalizeAccountName(accountPart),
          amount,
          sourceLine: i + 1,
        });
        continue;
      }
    }

    /**
     * (c) 계정명만 있고 금액이 없는 라인(다음 줄이 금액).
     * "(판)"·"장려금" 등 명사성 어미로 끝나면 계정 후보, 아니면 거래처.
     */
    const looksLikeAccount =
      /(판)$|장려금$|지원금$|지원$|자금$|수익$|수입$|비용$|수수료$|준비금전입수입$|양지원금$|학금지원$|료비용$/.test(trimmed) ||
      /\(판\)\s*$/.test(trimmed);
    if (looksLikeAccount) {
      cur.pendingCreditAccount = normalizeAccountName(trimmed);
      cur.pendingCreditSourceLine = i + 1;
      continue;
    }

    /** (d) 거래처 라인 */
    if (trimmed) cur.partyLineBuf.push(trimmed);
  }
  commit();

  if (grandTotal && grandTotal.debit !== grandTotal.credit) {
    warnings.push(
      `분개장 차·대 총합 불일치: 차변=${grandTotal.debit.toLocaleString("ko-KR")} 대변=${grandTotal.credit.toLocaleString("ko-KR")}`,
    );
  }

  return { entries, grandTotal, period, warnings };
}

/** --- 합계잔액시산표 파서 (재무제표 PDF 내부) --- */

/** 시산표 표준 계정명(정규화) */
export type TrialBalanceEntry = {
  accountName: string;
  /** 차변 잔액(원) — 시산표 왼쪽 "잔액" */
  debitBalance: number;
  /** 대변 잔액(원) — 시산표 오른쪽 "잔액" */
  creditBalance: number;
};

/**
 * 재무제표 PDF의 합계잔액시산표 라인 파싱.
 * 관찰된 포맷(pdf-parse 출력, 공백이 제거되어 숫자가 연결됨):
 *   "1,578,428321,011,893현 금 및 현 금 성 자 산319,433,465"
 *   "62,50062,500세 금 과 공 과 금"
 *   "이   자   수   익11,89311,893"
 *   "321,011,893640,445,358합          계640,445,358321,011,893"
 * 숫자 토큰은 `\d{1,3}(?:,\d{3})+` 로 분리(쉼표 최소 1개 포함).
 */
export function parsePdfTrialBalanceText(text: string): {
  entries: TrialBalanceEntry[];
  grandDebit: number | null;
  grandCredit: number | null;
} {
  const lines = text.split(/\r?\n/);
  const out: TrialBalanceEntry[] = [];
  let grandDebit: number | null = null;
  let grandCredit: number | null = null;

  /** 시산표 섹션 시작/종료 감지 */
  let inSection = false;

  const NUM_RE = /\d{1,3}(?:,\d{3})+/g;
  /** 계정명 내부(숫자 2자리·1자리 식별번호 등) 숫자는 쉼표 없는 숫자이므로 NUM_RE 와 충돌 없음 */
  const EXCLUDE_LINE = /^(합계잔액시산표|회사명|\(단위|제\s*\d+기|차\s*변|대\s*변|계\s*정\s*과\s*목|잔\s*액|합\s*계\s*계\s*정|2025년|현금흐름표)/;

  for (const raw of lines) {
    const line = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (!line) continue;
    if (/합계잔액시산표/.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    /** 다음 재무표(현금흐름표 등)가 시작하면 섹션 종료 */
    if (/^(재무상태표|손익계산서|이익잉여금|현금흐름표)$/.test(line)) {
      inSection = false;
      continue;
    }
    if (EXCLUDE_LINE.test(line)) continue;

    /** 숫자들을 전부 뽑는다 */
    const nums: Array<{ value: number; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(line)) !== null) {
      nums.push({
        value: parseInt(m[0].replace(/,/g, ""), 10),
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    if (nums.length === 0) continue;

    /** 계정명: 숫자 사이 또는 양쪽에 있는 한글/기호 구간 */
    /** 가장 긴 연속된 비숫자 구간을 계정명으로 사용 */
    const chunks: Array<{ text: string; start: number; end: number }> = [];
    let cursor = 0;
    for (const n of nums) {
      if (n.start > cursor) {
        const t = line.slice(cursor, n.start);
        if (t.trim()) chunks.push({ text: t, start: cursor, end: n.start });
      }
      cursor = n.end;
    }
    if (cursor < line.length) {
      const t = line.slice(cursor);
      if (t.trim()) chunks.push({ text: t, start: cursor, end: line.length });
    }
    if (chunks.length === 0) continue;
    chunks.sort((a, b) => b.text.replace(/\s/g, "").length - a.text.replace(/\s/g, "").length);
    const accountChunk = chunks[0];
    const accountName = normalizeAccountName(accountChunk.text);
    if (!accountName) continue;

    /** 합계 행 감지 — 계정명에 "합계"만 있는 경우 */
    if (/^합계$/.test(accountName) || /^합\s*계$/.test(accountChunk.text.trim())) {
      /** 좌측 숫자 중 큰 값 = 차변 합계, 우측 숫자 중 큰 값 = 대변 합계 */
      const left = nums.filter((n) => n.end <= accountChunk.start);
      const right = nums.filter((n) => n.start >= accountChunk.end);
      if (left.length >= 1) grandDebit = Math.max(...left.map((x) => x.value));
      if (right.length >= 1) grandCredit = Math.max(...right.map((x) => x.value));
      continue;
    }

    /** 좌측(차변) 숫자들과 우측(대변) 숫자들 분리 */
    const left = nums.filter((n) => n.end <= accountChunk.start);
    const right = nums.filter((n) => n.start >= accountChunk.end);

    /** 좌측에 숫자 2개: 잔액·합계. 같으면 차변 잔액만 취함. 다르면 잔액은 첫 숫자. */
    const debitBalance = left.length === 0 ? 0 : left[0].value;
    /** 우측에도 동일 — 잔액은 마지막 숫자. */
    const creditBalance = right.length === 0 ? 0 : right[right.length - 1].value;

    out.push({ accountName, debitBalance, creditBalance });
  }

  return { entries: out, grandDebit, grandCredit };
}

/** 시산표 엔트리 → 의사 분개장 엔트리(Journal 규격 통일) */
export function trialBalanceToJournalEntries(trial: TrialBalanceEntry[]): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const t of trial) {
    if (t.debitBalance > 0) {
      out.push({
        date: null,
        entryNo: null,
        account: t.accountName,
        side: "DEBIT",
        amount: t.debitBalance,
        party: null,
        memo: "시산표(차변잔액)",
        sourceLine: null,
      });
    }
    if (t.creditBalance > 0) {
      out.push({
        date: null,
        entryNo: null,
        account: t.accountName,
        side: "CREDIT",
        amount: t.creditBalance,
        party: null,
        memo: "시산표(대변잔액)",
        sourceLine: null,
      });
    }
  }
  return out;
}

/** --- XLSX 파서 --- */

type XlsxCell = string | number | null;
type XlsxRow = XlsxCell[];

/**
 * 시트 이름 힌트로 종류 판정.
 * - "분개장"/"journal" → JOURNAL
 * - "잔액"/"거래처"/"balance" → BALANCE
 * - "시산표"/"trial" → TRIAL_BALANCE
 * - 그 외 → UNKNOWN
 */
export type XlsxSheetKind = "JOURNAL" | "BALANCE" | "TRIAL_BALANCE" | "UNKNOWN";

export function detectXlsxSheetKind(sheetName: string): XlsxSheetKind {
  const n = sheetName.toLowerCase();
  if (/분개장|journal/i.test(n)) return "JOURNAL";
  if (/시산표|trial/i.test(n)) return "TRIAL_BALANCE";
  if (/잔액|거래처|balance/i.test(n)) return "BALANCE";
  return "UNKNOWN";
}

/** 헤더 행에서 열 인덱스 매핑(없으면 null). */
function findHeaderIdx(row: XlsxRow, patterns: RegExp[]): number {
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c == null) continue;
    const s = String(c).trim();
    if (patterns.some((re) => re.test(s))) return i;
  }
  return -1;
}

const H_DATE = [/^(일자|날짜|월\/일)$/];
const H_ACCOUNT = [/^(계정과목|계정명|계\s*정\s*과\s*목|과목)$/];
const H_DEBIT = [/^(차변|차변금액|차\s*변)$/];
const H_CREDIT = [/^(대변|대변금액|대\s*변)$/];
const H_AMOUNT = [/^(금액|금\s*액)$/];
const H_PARTY = [/^(거래처|거래처명|업체|업체명|협력사|상대처)$/];
const H_ENTRYNO = [/^(전표번호|번호|분개번호|NO|No)$/];

/**
 * 엑셀 분개장 파서.
 * - 헤더 행을 0~3행 내에서 자동 탐색
 * - 차변/대변 분리 칼럼 + 단일 금액 + 차변/대변 구분 칼럼 둘 다 지원
 * - 다중 시트인 경우 "분개장" 힌트 시트를 우선 사용
 */
export function parseXlsxJournal(rows: XlsxRow[]): {
  entries: JournalEntry[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const entries: JournalEntry[] = [];

  let headerIdx = -1;
  let dateCol = -1;
  let accountCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let amountCol = -1;
  let partyCol = -1;
  let entryNoCol = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i];
    const d = findHeaderIdx(r, H_DATE);
    const a = findHeaderIdx(r, H_ACCOUNT);
    const db = findHeaderIdx(r, H_DEBIT);
    const cr = findHeaderIdx(r, H_CREDIT);
    const am = findHeaderIdx(r, H_AMOUNT);
    if (a >= 0 && (db >= 0 || cr >= 0 || am >= 0)) {
      headerIdx = i;
      dateCol = d;
      accountCol = a;
      debitCol = db;
      creditCol = cr;
      amountCol = am;
      partyCol = findHeaderIdx(r, H_PARTY);
      entryNoCol = findHeaderIdx(r, H_ENTRYNO);
      break;
    }
  }
  if (headerIdx < 0) {
    warnings.push("엑셀 분개장 헤더를 찾지 못했습니다(일자/계정과목/차변/대변 또는 금액 칼럼 필요).");
    return { entries, warnings };
  }

  const parseNum = (v: XlsxCell): number => {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return Math.round(v);
    const s = String(v).replace(/,/g, "").trim();
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c == null || c === "")) continue;
    const account = accountCol >= 0 ? String(r[accountCol] ?? "").trim() : "";
    if (!account) continue;
    const accNorm = normalizeAccountName(account);
    const date = dateCol >= 0 ? String(r[dateCol] ?? "").trim() || null : null;
    const party = partyCol >= 0 ? String(r[partyCol] ?? "").trim() || null : null;
    const entryNo = entryNoCol >= 0 ? String(r[entryNoCol] ?? "").trim() || null : null;

    if (debitCol >= 0 || creditCol >= 0) {
      const debit = debitCol >= 0 ? parseNum(r[debitCol]) : 0;
      const credit = creditCol >= 0 ? parseNum(r[creditCol]) : 0;
      if (debit > 0) {
        entries.push({
          date,
          entryNo,
          account: accNorm,
          side: "DEBIT",
          amount: debit,
          party,
          memo: null,
          sourceLine: i + 1,
        });
      }
      if (credit > 0) {
        entries.push({
          date,
          entryNo,
          account: accNorm,
          side: "CREDIT",
          amount: credit,
          party,
          memo: null,
          sourceLine: i + 1,
        });
      }
    } else if (amountCol >= 0) {
      const amt = parseNum(r[amountCol]);
      if (amt > 0) {
        entries.push({
          date,
          entryNo,
          account: accNorm,
          side: "CREDIT",
          amount: amt,
          party,
          memo: null,
          sourceLine: i + 1,
        });
      }
    }
  }

  return { entries, warnings };
}

/**
 * 엑셀 거래처별 잔액/합계표 파서.
 * 일반 구조: 행=거래처, 열=계정코드·계정명별 합계
 * → 계정명 헤더를 1행(또는 2~3행 안쪽)에서 탐색
 * → 본문 셀 합으로 계정별 총합 산출 후 의사 분개장(CREDIT)으로 출력
 */
export function parseXlsxBalance(rows: XlsxRow[]): {
  entries: JournalEntry[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const entries: JournalEntry[] = [];

  /** 헤더: 계정과목 텍스트(한글)가 2개 이상 포함된 행을 찾는다 */
  const scoreRow = (row: XlsxRow) => {
    let n = 0;
    for (const c of row) {
      if (c == null) continue;
      const s = String(c).trim();
      if (/[가-힣]/.test(s) && s.length >= 3) n++;
    }
    return n;
  };
  let headerIdx = -1;
  let bestScore = 2;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const s = scoreRow(rows[i] ?? []);
    if (s > bestScore) {
      bestScore = s;
      headerIdx = i;
    }
  }
  if (headerIdx < 0) {
    warnings.push("엑셀 잔액표 헤더(계정명)를 찾지 못했습니다.");
    return { entries, warnings };
  }

  const headerRow = rows[headerIdx] ?? [];
  /** 계정명(한글 텍스트) 칼럼 인덱스 목록 */
  const accountCols: Array<{ idx: number; name: string }> = [];
  for (let i = 0; i < headerRow.length; i++) {
    const c = headerRow[i];
    if (c == null) continue;
    const s = String(c).trim();
    if (!/[가-힣]/.test(s)) continue;
    if (s.length < 2) continue;
    /** 보통예금·현금성자산 등 현금 계정은 CASH_FLOW 로 전달 */
    accountCols.push({ idx: i, name: normalizeAccountName(s) });
  }
  if (accountCols.length === 0) {
    warnings.push("엑셀 잔액표에서 계정명 열을 식별하지 못했습니다.");
    return { entries, warnings };
  }

  const parseNum = (v: XlsxCell): number => {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return Math.round(v);
    const s = String(v).replace(/,/g, "").trim();
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };

  /** 계정명별 총합 */
  const totals = new Map<string, number>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    for (const { idx, name } of accountCols) {
      const n = parseNum(r[idx]);
      if (n === 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + n);
    }
  }
  for (const [account, amount] of totals) {
    if (amount === 0) continue;
    entries.push({
      date: null,
      entryNo: null,
      account,
      side: "CREDIT",
      amount,
      party: null,
      memo: "거래처잔액표",
      sourceLine: null,
    });
  }

  return { entries, warnings };
}

/** --- 매핑 테이블 (스펙 기반) --- */

type MappingRule = { keywords: string[]; target: JournalMappingTarget; reason: string };

/**
 * 키워드는 `normalizeAccountName` 으로 공백이 제거된 계정명 기준.
 * 우선순위가 높은 규칙이 위에 오도록 배치.
 */
const MAPPING_RULES: MappingRule[] = [
  /** 현금 흐름 계정(차변 보통예금 등) — 집계 제외 */
  { keywords: ["보통예금", "현금", "당좌예금", "정기예금", "현금성자산"], target: { kind: "CASH_FLOW" }, reason: "현금성 자산 이동" },
  /** ⑬ 사업주 출연 */
  { keywords: ["고유목적사업준비금전입수입", "출연금수입", "출연금", "기부금수입"], target: { kind: "EMPLOYER_CONTRIBUTION" }, reason: "사업주 출연 수입" },
  /** ㉙ 기금운용 수익금 */
  { keywords: ["이자수익", "수입이자", "배당금수익", "운용수익", "잡수익"], target: { kind: "INTEREST_INCOME" }, reason: "기금운용 수익금" },
  /** 57 주택구입·임차자금 */
  { keywords: ["주택구입", "주택임차", "주거자금"], target: { kind: "BIZ", code: 57 }, reason: "주택구입·임차자금" },
  /** 58 우리사주 */
  { keywords: ["우리사주"], target: { kind: "BIZ", code: 58 }, reason: "우리사주 구입자금" },
  /** 60 장학금 */
  { keywords: ["자녀면학장학금", "면학장학금", "장학금지원", "학자금지원", "장학금"], target: { kind: "BIZ", code: 60 }, reason: "장학금" },
  /** 61 재난구호금 */
  { keywords: ["재난구호", "재해구호"], target: { kind: "BIZ", code: 61 }, reason: "재난구호금" },
  /** 62 체육·문화활동 지원 */
  { keywords: ["독서및문화생활장려금", "체육활동", "문화활동", "독서장려금", "문화생활장려금"], target: { kind: "BIZ", code: 62 }, reason: "체육·문화활동 지원" },
  /** 63 모성보호 */
  { keywords: ["모성보호", "출산지원", "육아지원"], target: { kind: "BIZ", code: 63 }, reason: "모성보호·일가정양립" },
  /** 64 근로자의 날 */
  { keywords: ["근로자의날", "창립기념일", "사내행사"], target: { kind: "BIZ", code: 64 }, reason: "근로자의 날·창립기념" },
  /** 65 복지시설 */
  { keywords: ["복지시설", "사내구판장", "콘도", "보육시설"], target: { kind: "BIZ", code: 65 }, reason: "근로복지시설" },
  /** 66 그 밖의 복지비 */
  { keywords: ["부모봉양지원금", "부모봉양", "보험및대출지원금", "보험지원", "대출지원", "대출이자지원", "경조사비", "기타복지"], target: { kind: "BIZ", code: 66 }, reason: "그 밖의 복지비" },
  /** 59 생활안정자금 (품위유지비·명절상품권·명절지원금 포함 — 부모봉양보다 뒤에 배치하지 않도록 주의) */
  { keywords: ["품위유지비", "명절상품권", "명절지원금", "명절지원", "생활안정", "생일축하금", "생일지원금"], target: { kind: "BIZ", code: 59 }, reason: "생활안정자금" },
  /** 68 기금 운영비 */
  { keywords: ["수수료비용", "수수료", "세금과공과금", "세금과공과", "통신비", "운영비", "지급수수료"], target: { kind: "OPERATION_COST" }, reason: "기금 운영비" },
];

/**
 * 계정명(원문) → 양식 칸.
 * `userOverrides` 는 세션 단위로 사용자가 직접 지정한 매핑(원문 계정명 → target).
 */
export function mapAccountToTarget(
  accountRaw: string,
  userOverrides?: Map<string, JournalMappingTarget>,
): { target: JournalMappingTarget; reason: string; confident: boolean } {
  const norm = normalizeAccountName(accountRaw);
  if (!norm) return { target: { kind: "UNMAPPED" }, reason: "빈 계정명", confident: false };
  if (userOverrides?.has(norm)) {
    return { target: userOverrides.get(norm)!, reason: "사용자 지정", confident: true };
  }
  for (const rule of MAPPING_RULES) {
    for (const kw of rule.keywords) {
      if (norm.includes(kw)) {
        return { target: rule.target, reason: `${rule.reason} (키워드: ${kw})`, confident: true };
      }
    }
  }
  return { target: { kind: "UNMAPPED" }, reason: "매핑 규칙 없음", confident: false };
}

/** --- 외부 거래처 판정 --- */

/** 은행·통장 별칭 prefix — 실 거래처명 앞에 붙는 통장별칭(하나윤용현 등) 제거에 사용 */
const BANK_PREFIXES = ["하나", "신한", "농협", "기업", "우리", "신협", "국민", "카카오뱅크", "SC제일", "씨티"];

/** 외부 거래처로 판정되는 키워드(법인/금융사/행정청/상품권업체 등) */
const EXTERNAL_KEYWORDS = [
  "주식회사",
  "(주)",
  "(유)",
  "유한회사",
  "합명회사",
  "합자회사",
  "은행",
  "보험",
  "카드",
  "상품권",
  "티켓",
  "증권",
  "사내근로복지기금",
  "세무서",
  "구청",
  "시청",
  "노동청",
  "공단",
  "협회",
  "한화손",
  "한화생명",
  "삼성생명",
  "현대해상",
  "DB손해보험",
  "KB손해보험",
];

/**
 * 거래처 원문 → 외부 거래처(법인·금융사·기관 등) 여부 판정.
 * tenant.name 이 포함되어 있으면(기금법인 자기 자신) 무시.
 */
export function isExternalParty(party: string, tenantName?: string | null): boolean {
  const s = party.trim();
  if (!s) return false;
  if (tenantName && s.includes(tenantName)) {
    const rest = s.replace(tenantName, "").trim();
    if (!rest) return true;
  }
  return EXTERNAL_KEYWORDS.some((kw) => s.includes(kw));
}

/**
 * 거래처 라인에서 실제 직원 이름 후보 추출.
 * - 기금법인명(`tenantName`)이 포함되어 있으면 제거
 * - 은행·통장 prefix 제거
 * - 공백으로 분리된 토큰 중, 직원 목록에 이름이 있으면 그것을 우선
 * - 없으면 마지막 토큰을 반환
 */
export function extractEmployeeNameCandidate(
  party: string,
  tenantName: string | null,
  employeeNames: Set<string>,
): string | null {
  if (!party) return null;
  let s = party.trim();
  if (tenantName) s = s.split(tenantName).join(" ").trim();
  /** 금융/법인 키워드 포함 시 비직원 */
  if (isExternalParty(s, tenantName)) return null;
  const tokens = s.split(/\s+/).filter(Boolean);
  const stripped: string[] = [];
  for (const t of tokens) {
    let cur = t;
    for (const pref of BANK_PREFIXES) {
      if (cur.startsWith(pref) && cur.length > pref.length) {
        cur = cur.slice(pref.length);
        break;
      }
    }
    stripped.push(cur);
  }
  for (const tk of stripped) {
    if (employeeNames.has(tk)) return tk;
  }
  /** 이름 매칭 실패 — 한글 2~4자 토큰을 직원 후보로 취급 */
  for (let i = stripped.length - 1; i >= 0; i--) {
    const tk = stripped[i];
    if (/^[가-힣]{2,4}$/.test(tk)) return tk;
  }
  return null;
}

/** --- 집계 --- */

export type AggregateInput = {
  entries: JournalEntry[];
  tenant: Pick<Tenant, "name"> | null;
  employees: Employee[];
  /** 사용자 세션 매핑 override (계정명 → target). 없으면 빈 Map */
  userMappingOverrides?: Map<string, JournalMappingTarget>;
  /** 추가 source 정보(파일 목록 등) */
  source?: JournalAggregate["source"];
};

/**
 * 분개장 엔트리들을 양식 제15호서식 집계값으로 변환.
 * - 금액 단위: 원(호출부에서 천원 변환).
 * - CASH_FLOW / 미매핑 / UNMAPPED / DEBIT 보통예금 은 합산에서 제외(매핑로그에는 기록).
 */
export function aggregateJournalForOperatingReport(input: AggregateInput): JournalAggregate {
  const { entries, tenant, employees, userMappingOverrides, source } = input;
  const employeeNames = new Set(employees.map((e) => e.name.trim()).filter(Boolean));
  const tenantName = tenant?.name ?? null;

  const logAccum = new Map<
    string,
    { target: JournalMappingTarget; amount: number; confident: boolean; reason: string }
  >();
  const addLog = (account: string, target: JournalMappingTarget, amount: number, confident: boolean, reason: string) => {
    const prev = logAccum.get(account);
    if (prev) {
      prev.amount += amount;
      if (!confident) prev.confident = false;
    } else {
      logAccum.set(account, { target, amount, confident, reason });
    }
  };

  let employerContribution = 0;
  let interestIncome = 0;
  let operationCost = 0;
  const purposeByCode: Record<number, number> = { 57: 0, 58: 0, 59: 0, 60: 0, 61: 0, 62: 0, 63: 0, 64: 0, 65: 0, 66: 0 };
  /** 코드별 수혜자 이름 집합 */
  const recipientSetByCode: Record<number, Set<string>> = {
    57: new Set(),
    58: new Set(),
    59: new Set(),
    60: new Set(),
    61: new Set(),
    62: new Set(),
    63: new Set(),
    64: new Set(),
    65: new Set(),
    66: new Set(),
  };
  const allRecipients = new Set<string>();

  const warnings: string[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  const externalPartyCounts = new Map<string, number>();

  for (const e of entries) {
    if (e.side === "DEBIT") totalDebit += e.amount;
    else totalCredit += e.amount;

    const m = mapAccountToTarget(e.account, userMappingOverrides);
    addLog(e.account, m.target, e.amount, m.confident, m.reason);

    switch (m.target.kind) {
      case "CASH_FLOW":
        /** 현금 흐름 계정은 합산 제외 */
        break;
      case "EMPLOYER_CONTRIBUTION":
        /** 분개장에서는 대변 수입으로 기록 (보통 CREDIT). DEBIT 라인은 취소/수정분으로 간주 */
        if (e.side === "CREDIT") employerContribution += e.amount;
        else employerContribution -= e.amount;
        break;
      case "INTEREST_INCOME":
        if (e.side === "CREDIT") interestIncome += e.amount;
        else interestIncome -= e.amount;
        break;
      case "OPERATION_COST":
        /**
         * 경비 계정은 **side 무관**하게 누적.
         * - 분개장에서는 "차변 보통예금 / 대변 수수료비용" 으로 찍혀 경비가 CREDIT side 에 오고
         * - 시산표에서는 경비 잔액이 DEBIT side 에 옴
         * 두 경로 모두 동일 결과를 내기 위해 양쪽 합산.
         */
        operationCost += e.amount;
        break;
      case "BIZ": {
        /** BIZ 도 OPERATION_COST 와 동일한 이유로 side 무관 누적 */
        const code = m.target.code;
        purposeByCode[code] = (purposeByCode[code] ?? 0) + e.amount;
        const party = e.party ?? "";
        const isExternal = party ? isExternalParty(party, tenantName) : true;
        if (isExternal) {
          if (party) externalPartyCounts.set(party, (externalPartyCounts.get(party) ?? 0) + 1);
        } else {
          const empName = extractEmployeeNameCandidate(party, tenantName, employeeNames);
          if (empName) {
            recipientSetByCode[code].add(empName);
            allRecipients.add(empName);
          }
        }
        break;
      }
      case "UNMAPPED":
        /** 합산 제외 - 경고로 표출 */
        break;
    }
  }

  const mappingLog: JournalMappingLogItem[] = [];
  for (const [account, v] of logAccum) {
    mappingLog.push({
      account,
      target: v.target,
      amount: v.amount,
      confident: v.confident,
      reason: v.reason,
    });
  }
  mappingLog.sort((a, b) => b.amount - a.amount);

  /** 경고 생성 */
  for (const item of mappingLog) {
    if (item.target.kind === "UNMAPPED" && item.amount > 0) {
      warnings.push(`미매핑 계정 "${item.account}" — ${item.amount.toLocaleString("ko-KR")}원. 매핑을 확인하세요.`);
    }
  }
  if (externalPartyCounts.size > 0 && allRecipients.size > 0) {
    const list = Array.from(externalPartyCounts.keys()).slice(0, 3).join(", ");
    warnings.push(`외부 거래처(${externalPartyCounts.size}건, 예: ${list}…)는 수혜자 수 집계에서 제외되었습니다.`);
  }
  if (totalDebit !== totalCredit) {
    warnings.push(
      `분개장 차변·대변 합계가 다릅니다(차변 ${totalDebit.toLocaleString("ko-KR")} / 대변 ${totalCredit.toLocaleString("ko-KR")}).`,
    );
  }

  const recipientsByCode: Record<number, number> = {};
  let totalPurpose = 0;
  for (const c of [57, 58, 59, 60, 61, 62, 63, 64, 65, 66]) {
    recipientsByCode[c] = recipientSetByCode[c].size;
    totalPurpose += purposeByCode[c];
  }

  const aggregate: JournalAggregate = {
    source: source ?? { files: [], totalDebit, totalCredit, balanceOk: totalDebit === totalCredit },
    employerContribution,
    interestIncome,
    operationCost,
    purposeByCode,
    recipientsByCode,
    mappingLog,
    warnings,
    uniqueRecipientNames: Array.from(allRecipients).sort(),
    totalPurpose,
    periodFrom: null,
    periodTo: null,
  };
  aggregate.source.totalDebit = totalDebit;
  aggregate.source.totalCredit = totalCredit;
  aggregate.source.balanceOk = totalDebit === totalCredit;
  return aggregate;
}

/** 매핑 대상 → 사람이 읽기 좋은 라벨 */
export function describeMappingTarget(t: JournalMappingTarget): string {
  switch (t.kind) {
    case "BIZ":
      return `◯${t.code}`;
    case "OPERATION_COST":
      return "◯68 기금운영비";
    case "EMPLOYER_CONTRIBUTION":
      return "⑬ 사업주 출연";
    case "INTEREST_INCOME":
      return "㉙ 기금운용 수익금";
    case "CASH_FLOW":
      return "(현금성 이동)";
    case "UNMAPPED":
      return "미매핑";
  }
}

/** UI 드롭다운용 모든 매핑 옵션 */
export const ALL_MAPPING_TARGETS: { value: string; label: string; target: JournalMappingTarget }[] = [
  { value: "UNMAPPED", label: "미매핑 / 집계 제외", target: { kind: "UNMAPPED" } },
  { value: "CASH_FLOW", label: "(현금성 이동 — 집계 제외)", target: { kind: "CASH_FLOW" } },
  { value: "EMPLOYER_CONTRIBUTION", label: "⑬ 사업주 출연", target: { kind: "EMPLOYER_CONTRIBUTION" } },
  { value: "INTEREST_INCOME", label: "㉙ 기금운용 수익금", target: { kind: "INTEREST_INCOME" } },
  { value: "OPERATION_COST", label: "◯68 기금 운영비", target: { kind: "OPERATION_COST" } },
  { value: "BIZ:57", label: "◯57 주택구입·임차자금", target: { kind: "BIZ", code: 57 } },
  { value: "BIZ:58", label: "◯58 우리사주 구입자금", target: { kind: "BIZ", code: 58 } },
  { value: "BIZ:59", label: "◯59 생활안정자금", target: { kind: "BIZ", code: 59 } },
  { value: "BIZ:60", label: "◯60 장학금", target: { kind: "BIZ", code: 60 } },
  { value: "BIZ:61", label: "◯61 재난구호금", target: { kind: "BIZ", code: 61 } },
  { value: "BIZ:62", label: "◯62 체육·문화활동 지원", target: { kind: "BIZ", code: 62 } },
  { value: "BIZ:63", label: "◯63 모성보호, 일·가정 양립", target: { kind: "BIZ", code: 63 } },
  { value: "BIZ:64", label: "◯64 근로자의 날 행사 등", target: { kind: "BIZ", code: 64 } },
  { value: "BIZ:65", label: "◯65 근로복지시설", target: { kind: "BIZ", code: 65 } },
  { value: "BIZ:66", label: "◯66 그 밖의 복지비", target: { kind: "BIZ", code: 66 } },
];

/** --- FM 방식 ㉚·㉛·㉜ 계산 --- */

export type ContribUsageRatio = 50 | 80 | 90;
export type PrevBaseAssetUsageRatio = 20 | 25 | 30;

export type FundSourceFMInput = {
  /** ⑬+⑮ 출연금 합 */
  contribBase: number;
  /** ⑫ 직전 회계연도 말 기본재산 */
  prevYearEndTotal: number;
  /** ⑳ 당해 회계연도 말 기본재산 */
  currentYearEndTotal: number;
  /** 본사 자본금 */
  capital: number;
  /** ㉚ 비율(50/80/90) */
  contribUsageRatio: ContribUsageRatio;
  /** ㉜ 비율(20/25/30) */
  prevBaseAssetUsageRatio: PrevBaseAssetUsageRatio;
  /** 협력업체 복리후생 사용 여부 */
  vendorWelfareApplied: boolean;
  /** ⑨ 소속 근로자 수(㉜ 적용 요건 검사용) */
  employeeCount: number;
  /** ㉝ 공동근로복지기금 지원액 */
  jointFundSupport: number;
  /** ㉞ 이월금 */
  carryover: number;
  /** ㉙ 기금운용 수익금 */
  interestIncome: number;
};

export type FundSourceFMResult = {
  /** ㉚ 출연금 범위 사용액 */
  contribUsageAmount: number;
  /** ㉛ 기본재산 × 자본금 50% 초과액 */
  excessCapitalUsage: number;
  /** ㉜ 직전 기본재산 범위 사용액 */
  prevBaseAssetUsageAmount: number;
  /** ㉟ 합계 */
  total: number;
  /** FM 방식 잔여분이 어디 배치됐는지 (디버깅) */
  residualPlacement: "EXCESS_CAPITAL" | "PREV_BASE_ASSET" | "NONE";
  warnings: string[];
};

/**
 * 스펙의 FM 방식 — ⑬+⑮+㉙ 합이 ㉟ 합계와 일치하도록 잔여분을 ㉛ 또는 ㉜에 자동 배치.
 *
 * 우선순위:
 *  1) ㉛ 산식 한도 = max(0, ⑳ - 자본금×50%) — 한도 내 우선 배치
 *  2) ㉛ 한도가 0 (자본금이 기본재산보다 큼) 이면 ㉜에 배치 (엔씨 케이스)
 *  3) ㉜ 적용 요건 (⑫÷⑨ ≥ 200만원 AND 협력업체 사용) 미충족이면 ㉛으로 강제 배치하고 경고
 */
export function computeFundSourceFM(input: FundSourceFMInput): FundSourceFMResult {
  const warnings: string[] = [];
  const halfCapital = Math.floor(input.capital * 0.5);
  /** ㉚ 자동 */
  const contribUsageAmount = Math.floor((input.contribBase * input.contribUsageRatio) / 100);

  /** ㉛ 산식 한도 (⑳ - 자본금×50%) — 음수면 0 */
  const excessLimit = Math.max(0, input.currentYearEndTotal - halfCapital);
  /** ㉜ 산식 한도 (⑫ × 비율) */
  const prevLimit = Math.floor((input.prevYearEndTotal * input.prevBaseAssetUsageRatio) / 100);

  /** ㉜ 적용 요건 — 직전 기본재산÷소속근로자 ≥ 200만원 AND 협력업체 복리후생 사용 */
  const perCapitaPrev = input.employeeCount > 0 ? input.prevYearEndTotal / input.employeeCount : 0;
  const prevApplicable = perCapitaPrev >= 2_000_000 && input.vendorWelfareApplied;

  /** 합계 = ⑬+⑮+㉙ 가 되어야 한다 */
  const target = input.contribBase + input.interestIncome;
  const fixed = input.jointFundSupport + input.carryover + input.interestIncome;
  /** 가용분 = target - 고정값(㉝+㉞+㉙) - ㉚ */
  const remainder = Math.max(0, target - fixed - contribUsageAmount);

  let excessCapitalUsage = 0;
  let prevBaseAssetUsageAmount = 0;
  let residualPlacement: FundSourceFMResult["residualPlacement"] = "NONE";

  if (remainder === 0) {
    /** 잔여 없음 — 산식 한도와 무관하게 0 */
    excessCapitalUsage = 0;
    prevBaseAssetUsageAmount = 0;
  } else if (excessLimit >= remainder) {
    /** ㉛ 한도가 충분 — 잔여분 전체를 ㉛에 */
    excessCapitalUsage = remainder;
    residualPlacement = "EXCESS_CAPITAL";
  } else {
    /**
     * ㉛ 한도가 부족 → 한도까지는 ㉛, 나머지는 ㉜에.
     * ㉜ 요건 미충족이라도 실무적으로 잔여를 처리해야 하므로 배치하되 경고.
     */
    excessCapitalUsage = excessLimit;
    const stillNeed = remainder - excessLimit;
    prevBaseAssetUsageAmount = stillNeed;
    residualPlacement = excessLimit > 0 ? "EXCESS_CAPITAL" : "PREV_BASE_ASSET";

    if (!prevApplicable) {
      warnings.push(
        `㉜ 적용 요건(직전 기본재산÷소속근로자 ≥ 200만원 AND 협력업체 복리후생 사용)을 만족하지 않습니다. ` +
          `현재 ⑫÷⑨ = ${input.employeeCount > 0 ? Math.round(perCapitaPrev).toLocaleString("ko-KR") : "—"}원, ` +
          `협력업체 적용=${input.vendorWelfareApplied ? "있음" : "없음"}. ` +
          `잔여분 ${stillNeed.toLocaleString("ko-KR")}원을 ㉜에 임시 배치했습니다.`,
      );
    }
    if (stillNeed > prevLimit && prevApplicable) {
      warnings.push(
        `㉜에 배치된 ${stillNeed.toLocaleString("ko-KR")}원이 산식 한도(⑫×${input.prevBaseAssetUsageRatio}% = ${prevLimit.toLocaleString("ko-KR")}원)를 초과합니다.`,
      );
    }
  }

  /** 자본금이 너무 작아 ㉛ 산식 한도와 잔여분 갭이 큰 경우 별도 경고(스펙 주의사항 #4) */
  if (input.capital > 0 && input.contribBase > 0 && input.capital < input.contribBase / 10) {
    warnings.push(
      `본사 자본금(${input.capital.toLocaleString("ko-KR")}원)이 출연금(${input.contribBase.toLocaleString("ko-KR")}원)의 10% 미만으로 매우 작아 ` +
        `㉛ 산식 한도와 FM 잔여분 사이 갭이 큽니다. 경리·노무 담당자와 배치 방식을 확인하세요.`,
    );
  }

  const total =
    input.interestIncome +
    contribUsageAmount +
    excessCapitalUsage +
    prevBaseAssetUsageAmount +
    input.jointFundSupport +
    input.carryover;

  return {
    contribUsageAmount,
    excessCapitalUsage,
    prevBaseAssetUsageAmount,
    total,
    residualPlacement,
    warnings,
  };
}

/**
 * 협력업체 복리후생 사용 여부·비율로 ㉚ 자동 추천 비율을 산출.
 * - 협력업체 미적용 + tenant 가 개인사업자 → 50%
 * - 협력업체 미적용 + 법인 → 80%(기본)
 * - 협력업체 적용 + 비율 80(출연금 80% 범위) → 80%
 * - 협력업체 적용 + 비율 90(출연금 20% 초과) → 90%
 */
export function recommendContribUsageRatio(input: {
  isIndividual: boolean;
  vendorWelfareApplied: boolean;
  vendorWelfareRatio: 80 | 90 | 20 | 25 | 30 | null;
}): ContribUsageRatio {
  if (!input.vendorWelfareApplied) return input.isIndividual ? 50 : 80;
  if (input.vendorWelfareRatio === 90) return 90;
  if (input.vendorWelfareRatio === 80) return 80;
  return input.isIndividual ? 50 : 80;
}

export function parseMappingTargetValue(value: string): JournalMappingTarget | null {
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
