"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CommaWonInput } from "@/components/CommaWonInput";
import type {
  setCompanyIncentiveNetRatioAction,
  setMonthlyIncentiveAccrualCellAction,
  setMonthlyOptionalWelfareTextAction,
} from "@/app/actions/quarterly";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * 비율 정규화 — UI 입력 또는 props 의 raw 값을 받아 1~100 정수로 정리.
 * - null/빈값/유한수 아님/0 이하/100 초과 → null(=변환 비활성).
 * - 100 은 그대로 100 으로 둔다(변환 비활성과 의미는 같지만, 사용자가 명시한 값이라면 보존).
 */
function normalizeNetRatio(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : raw;
  if (s === "" || s === null) return null;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return n;
}

/**
 * 사용자가 적은 "세전" 금액에 비율을 곱해 "세후" 금액으로 변환.
 * - ratio 가 null 또는 100 이면 변환 비활성 → 입력값 그대로.
 * - 음수·NaN 입력은 그대로(상위에서 다시 검증). 변환 결과는 항상 정수.
 */
function applyNetRatio(grossWon: number, ratioPct: number | null): number {
  if (ratioPct == null || ratioPct === 100) return Math.round(grossWon);
  if (!Number.isFinite(grossWon)) return 0;
  return Math.round((grossWon * ratioPct) / 100);
}

/**
 * 컬럼 폭:
 *   코드 5.5rem · 이름 6.5rem · (1~12월) 각 7.25rem · 예상 7rem · 누적 7rem · 잔여 9rem · 상태 6rem
 *
 * 7.25rem = 콤마 포함 9~10자리(예: 12,345,678)까지 잘리지 않고 보이는 폭.
 * 이전 3.75rem 은 5~6자리만 들어가 흔히 잘려 보였다.
 *
 * 행 끝 요약 3칸:
 *   - 예상: 직원 마스터의 ‘예상 인센’ (incentiveAmount). 입력 불가, 직원 폼에서만 수정.
 *   - 누적: 1~12월 발생 인센 합. 입력 즉시(타이핑 단계에서) 갱신.
 *   - 잔여: 예상 − 누적. 음수면 빨갛게 + ‘급여 얹기’ 라벨 → 사복으로 다 지급할 수 없으니 초과분은 급여 포함으로 신고해야 함을 알림.
 */
const ROW_GRID =
  "5.5rem 6.5rem repeat(12, minmax(7.25rem, 1fr)) 7rem 7rem 9rem 6rem" as const;

export type MonthlyIncentiveAccrualGridRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  /** 지급월 1~12 — 그 달 노트에 적힌 발생(귀속) 인센 */
  incentiveAccrualByMonth: Record<number, number | null>;
  /**
   * 같은 노트의 `optionalWelfareText` — 직원·월 단위로 짧게 적어 두는 메모.
   * 셀 우상단 메모 토글로 편집·표시. 길이 상한은 서버 액션에서 가드.
   */
  optionalWelfareTextByMonth: Record<number, string | null>;
  /** 직원 마스터 ‘예상 인센’ — 사복으로 지급 가능한 한도. null/0 이면 한도 없음(잔여 비교 생략). */
  incentiveAmount: number | null;
  /**
   * 사복(사내근로복지기금) 미대상 — 사복 화면에서는 행이 빠지지만 이 그리드에서는 인센 기록을 위해 유지.
   * 코드 옆에 작은 ‘사복 미대상’ 배지 + 행 전체를 살짝 dim 으로 시각 구분.
   */
  welfareIneligible: boolean;
};

type CellKey = `${string}:${number}`;
function cellKey(employeeId: string, month: number): CellKey {
  return `${employeeId}:${month}`;
}

const MEMO_MAX_LEN = 500;

type CellStatus = "idle" | "pending" | "saved" | "error";
type MemoStatus = "idle" | "pending" | "saved" | "error";
type RatioStatus = "idle" | "pending" | "saved" | "error";

export function MonthlyIncentiveAccrualGrid({
  year,
  rows,
  canEdit,
  setCell,
  netRatioPercent,
  setNetRatio,
  setOptionalWelfareText,
}: {
  year: number;
  rows: MonthlyIncentiveAccrualGridRow[];
  canEdit: boolean;
  /** 한 셀(직원·월) 한 칸을 자동 저장하는 서버 액션. */
  setCell: typeof setMonthlyIncentiveAccrualCellAction;
  /**
   * 월별 발생 인센 자동 변환 비율(세후 비율, %). 1~100 또는 null(=비활성).
   * 비활성이면 셀 입력값이 그대로 저장된다.
   */
  netRatioPercent: number | null;
  /** 비율을 자동 저장하는 서버 액션. 권한이 없으면 그리드 상단에서 readonly 로만 보여준다. */
  setNetRatio: typeof setCompanyIncentiveNetRatioAction;
  /** 셀 메모(`optionalWelfareText`) 를 자동 저장하는 서버 액션. */
  setOptionalWelfareText: typeof setMonthlyOptionalWelfareTextAction;
}) {
  const [statusByCell, setStatusByCell] = useState<Map<CellKey, CellStatus>>(() => new Map());
  const [errorByCell, setErrorByCell] = useState<Map<CellKey, string>>(() => new Map());
  /**
   * 메모 라이브 캐시 — props 의 `optionalWelfareTextByMonth` 를 출발점으로 두고, 사용자가 저장한 뒤
   * 그 셀의 메모 표시(아이콘 진하기·툴팁)에 즉시 반영되도록 한다. null = 메모 없음.
   */
  const [memoByCell, setMemoByCell] = useState<Map<CellKey, string | null>>(() => {
    const m = new Map<CellKey, string | null>();
    for (const r of rows) {
      for (let mn = 1; mn <= 12; mn++) {
        const v = r.optionalWelfareTextByMonth?.[mn];
        if (typeof v === "string" && v.trim().length > 0) {
          m.set(cellKey(r.employeeId, mn), v);
        }
      }
    }
    return m;
  });
  const [memoStatusByCell, setMemoStatusByCell] = useState<Map<CellKey, MemoStatus>>(() => new Map());
  const [memoErrorByCell, setMemoErrorByCell] = useState<Map<CellKey, string>>(() => new Map());
  /** 현재 popover 가 열려 있는 셀 — 한 번에 하나만 열리도록 단일 키로 관리. */
  const [memoOpenCell, setMemoOpenCell] = useState<CellKey | null>(null);
  /** popover 안에서 사용자가 편집 중인 텍스트(저장 전 라이브). */
  const [memoDraft, setMemoDraft] = useState<string>("");
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);
  /**
   * 12개월 입력값을 라이브로 추적 — 잔여(예상-누적) 표시는 디바운스/저장 전에도 즉시 반영되어야 한다.
   * 저장된 값(=세후 변환 후) 기준으로 누적·잔여를 계산하므로 valueByCell 도 변환 후 값을 보관한다.
   * 초기값은 props 로 받은 incentiveAccrualByMonth(이미 DB 에 저장된 변환 후 값).
   */
  const [valueByCell, setValueByCell] = useState<Map<CellKey, number>>(() => {
    const m = new Map<CellKey, number>();
    for (const r of rows) {
      for (let mn = 1; mn <= 12; mn++) {
        const v = r.incentiveAccrualByMonth[mn];
        if (v != null && Number.isFinite(Number(v))) {
          m.set(cellKey(r.employeeId, mn), Math.round(Number(v)));
        }
      }
    }
    return m;
  });
  const [, startTransition] = useTransition();

  /** 비율 입력 — 1~100 정수 문자열. 빈 문자열 / 100 = 변환 비활성. */
  const [ratioInput, setRatioInput] = useState<string>(() =>
    netRatioPercent == null ? "" : String(netRatioPercent),
  );
  const [ratioStatus, setRatioStatus] = useState<RatioStatus>("idle");
  const [ratioError, setRatioError] = useState<string | null>(null);
  /**
   * 잠금 토글 — 기본은 readonly. "수정하기" 버튼을 눌러야만 편집 가능.
   * 실수로 비율이 바뀌면 "다음 입력부터" 잘못 저장되는 큰 사고로 이어지므로 의도적인 락 UX.
   */
  const [ratioEditing, setRatioEditing] = useState(false);
  const ratioInputRef = useRef<HTMLInputElement>(null);
  const lastSavedRatioRef = useRef<number | null>(netRatioPercent ?? null);
  const activeRatio = normalizeNetRatio(ratioInput);
  const ratioActive = activeRatio != null && activeRatio !== 100;
  /** 편집 중에 사용자가 새 값을 적었는지 — "완료" 버튼 활성/비활성 표기에 사용. */
  const ratioDirty = (normalizeNetRatio(ratioInput) ?? null) !== (lastSavedRatioRef.current ?? null);

  /** 부모에서 props 가 갱신되면(다른 곳에서 비율을 바꾼 경우) 입력 칸을 따라가게 한다. */
  useEffect(() => {
    setRatioInput(netRatioPercent == null ? "" : String(netRatioPercent));
    lastSavedRatioRef.current = netRatioPercent ?? null;
    /** 외부에서 값이 바뀌면 편집 중이던 상태도 안전하게 닫는다(서로 다른 화면이 동시 편집 사고 방지). */
    setRatioEditing(false);
  }, [netRatioPercent]);

  /** 편집 모드 진입 시 자동 포커스 + 전체 선택 — 사용자가 바로 새 값을 적을 수 있게. */
  useEffect(() => {
    if (ratioEditing) {
      const el = ratioInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [ratioEditing]);

  /** 메모 popover 가 새로 열리면 textarea 에 포커스 + 끝 커서. */
  useEffect(() => {
    if (memoOpenCell == null) return;
    const el = memoTextareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [memoOpenCell]);

  /**
   * props.rows 가 갱신되면(서버에서 다시 받아온 경우) 라이브 메모 캐시도 따라 동기화.
   * 사용자가 다른 셀에서 입력 중이라면 그 셀만은 라이브 값이 보존되도록 prev 와 병합한다.
   */
  useEffect(() => {
    setMemoByCell((prev) => {
      const next = new Map<CellKey, string | null>();
      for (const r of rows) {
        for (let mn = 1; mn <= 12; mn++) {
          const k = cellKey(r.employeeId, mn);
          /** popover 가 열려 있는 셀은 사용자가 편집 중일 수 있으니 prev 그대로. */
          if (memoOpenCell === k) {
            const cur = prev.get(k);
            if (cur != null) next.set(k, cur);
            continue;
          }
          const v = r.optionalWelfareTextByMonth?.[mn];
          if (typeof v === "string" && v.trim().length > 0) {
            next.set(k, v);
          }
        }
      }
      return next;
    });
  }, [rows, memoOpenCell]);

  const flushRatioSave = useCallback(
    (rawNext: number | null) => {
      if (!canEdit) return;
      if (rawNext === lastSavedRatioRef.current) return;
      lastSavedRatioRef.current = rawNext;
      setRatioStatus("pending");
      setRatioError(null);
      startTransition(async () => {
        const res = await setNetRatio(rawNext);
        if (res.ok) {
          setRatioStatus("saved");
          window.setTimeout(() => {
            setRatioStatus((s) => (s === "saved" ? "idle" : s));
          }, 1500);
        } else {
          setRatioStatus("error");
          setRatioError(res.오류);
        }
      });
    },
    [canEdit, setNetRatio],
  );

  /** 편집 모드에서만 사용 — 자동 디바운스 저장은 의도적으로 빼고 "완료" 버튼/Enter 로만 저장. */
  const onRatioInputChange = useCallback((next: string) => {
    const cleaned = next.replace(/[^\d]/g, "").slice(0, 3);
    setRatioInput(cleaned);
  }, []);

  /** "수정하기" 클릭 → 편집 모드 진입. 권한 없으면 무시. */
  const onRatioEditEnter = useCallback(() => {
    if (!canEdit) return;
    setRatioEditing(true);
    setRatioError(null);
    if (ratioStatus === "error") setRatioStatus("idle");
  }, [canEdit, ratioStatus]);

  /** "취소" → 마지막 저장값으로 되돌리고 잠금. */
  const onRatioEditCancel = useCallback(() => {
    const restored = lastSavedRatioRef.current;
    setRatioInput(restored == null ? "" : String(restored));
    setRatioEditing(false);
    setRatioError(null);
    if (ratioStatus === "error") setRatioStatus("idle");
  }, [ratioStatus]);

  /** "완료" → 정규화된 값으로 즉시 저장하고 잠금 상태로 복귀. */
  const onRatioEditCommit = useCallback(() => {
    const norm = normalizeNetRatio(ratioInput);
    /** 표시 정규화 — 사용자가 "080" 적어도 잠금 상태에서는 "80" 으로 깔끔히. */
    setRatioInput(norm == null ? "" : String(norm));
    flushRatioSave(norm);
    setRatioEditing(false);
  }, [flushRatioSave, ratioInput]);

  /** Enter / Escape 단축키로 빠르게 마무리. */
  const onRatioInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!ratioEditing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onRatioEditCommit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onRatioEditCancel();
      }
    },
    [ratioEditing, onRatioEditCommit, onRatioEditCancel],
  );

  const onCellLiveChange = useCallback(
    (employeeId: string, month: number, rawValue: number) => {
      /** 라이브 누적 표시는 "변환 후" 값으로 — 사용자가 보는 잔여(예상−누적)도 실제 사복 한도와 비교되는 값으로. */
      const converted = applyNetRatio(rawValue, activeRatio);
      const k = cellKey(employeeId, month);
      setValueByCell((prev) => {
        const m = new Map(prev);
        if (converted > 0) m.set(k, converted);
        else m.delete(k);
        return m;
      });
    },
    [activeRatio],
  );

  const onCellCommit = useCallback(
    (employeeId: string, month: number, rawValue: number) => {
      const converted = applyNetRatio(rawValue, activeRatio);
      const k = cellKey(employeeId, month);
      /** commit 도 동일하게 라이브 맵을 한 번 더 정리(blur 만 한 케이스에서 필요). */
      setValueByCell((prev) => {
        const m = new Map(prev);
        if (converted > 0) m.set(k, converted);
        else m.delete(k);
        return m;
      });
      setStatusByCell((prev) => {
        const m = new Map(prev);
        m.set(k, "pending");
        return m;
      });
      setErrorByCell((prev) => {
        const m = new Map(prev);
        m.delete(k);
        return m;
      });
      startTransition(async () => {
        const res = await setCell(employeeId, year, month, converted > 0 ? converted : null);
        if (res.ok) {
          setStatusByCell((prev) => {
            const m = new Map(prev);
            m.set(k, "saved");
            return m;
          });
          /** 잠깐 ‘저장됨’ 표시 후 idle 로 사라짐 — 사용자가 자기 입력이 보존됐다는 신호만 받게. */
          window.setTimeout(() => {
            setStatusByCell((prev) => {
              const m = new Map(prev);
              if (m.get(k) === "saved") m.delete(k);
              return m;
            });
          }, 1500);
        } else {
          setStatusByCell((prev) => {
            const m = new Map(prev);
            m.set(k, "error");
            return m;
          });
          setErrorByCell((prev) => {
            const m = new Map(prev);
            m.set(k, res.오류);
            return m;
          });
        }
      });
    },
    [activeRatio, setCell, year],
  );

  /** popover 토글 — 같은 셀을 다시 누르면 닫힌다. */
  const onMemoOpen = useCallback(
    (employeeId: string, month: number) => {
      const k = cellKey(employeeId, month);
      if (memoOpenCell === k) {
        setMemoOpenCell(null);
        setMemoDraft("");
        return;
      }
      const current = memoByCell.get(k) ?? "";
      setMemoDraft(current);
      setMemoOpenCell(k);
      /** 같은 셀 메모 오류는 새로 열 때 초기화 — 이전 사용자에게만 보였던 메시지를 고정 노출하지 않음. */
      setMemoErrorByCell((prev) => {
        const m = new Map(prev);
        m.delete(k);
        return m;
      });
    },
    [memoByCell, memoOpenCell],
  );

  const onMemoCancel = useCallback(() => {
    setMemoOpenCell(null);
    setMemoDraft("");
  }, []);

  /** 라이브 입력 — 길이 상한을 넘어가지 않도록 즉시 자른다. */
  const onMemoChange = useCallback((next: string) => {
    if (next.length > MEMO_MAX_LEN) {
      setMemoDraft(next.slice(0, MEMO_MAX_LEN));
    } else {
      setMemoDraft(next);
    }
  }, []);

  const onMemoCommit = useCallback(() => {
    if (!canEdit) return;
    if (memoOpenCell == null) return;
    const k = memoOpenCell;
    const [employeeId, monthStr] = k.split(":") as [string, string];
    const month = Number(monthStr);
    const trimmed = memoDraft.trim();
    const normalized = trimmed.length > 0 ? trimmed : null;
    const prevValue = memoByCell.get(k) ?? null;
    /** 변경이 없으면 서버 호출 생략 — 노이즈 줄이기. */
    if ((prevValue ?? null) === (normalized ?? null)) {
      setMemoOpenCell(null);
      setMemoDraft("");
      return;
    }
    setMemoByCell((prev) => {
      const m = new Map(prev);
      if (normalized == null) m.delete(k);
      else m.set(k, normalized);
      return m;
    });
    setMemoStatusByCell((prev) => {
      const m = new Map(prev);
      m.set(k, "pending");
      return m;
    });
    setMemoErrorByCell((prev) => {
      const m = new Map(prev);
      m.delete(k);
      return m;
    });
    setMemoOpenCell(null);
    setMemoDraft("");
    startTransition(async () => {
      const res = await setOptionalWelfareText(employeeId, year, month, normalized);
      if (res.ok) {
        setMemoStatusByCell((prev) => {
          const m = new Map(prev);
          m.set(k, "saved");
          return m;
        });
        window.setTimeout(() => {
          setMemoStatusByCell((prev) => {
            const m = new Map(prev);
            if (m.get(k) === "saved") m.delete(k);
            return m;
          });
        }, 1500);
      } else {
        /** 실패 시 라이브 캐시는 이전 값으로 롤백 — 사용자 시각 표시가 거짓으로 남지 않도록. */
        setMemoByCell((prev) => {
          const m = new Map(prev);
          if (prevValue == null) m.delete(k);
          else m.set(k, prevValue);
          return m;
        });
        setMemoStatusByCell((prev) => {
          const m = new Map(prev);
          m.set(k, "error");
          return m;
        });
        setMemoErrorByCell((prev) => {
          const m = new Map(prev);
          m.set(k, res.오류);
          return m;
        });
      }
    });
  }, [canEdit, memoByCell, memoDraft, memoOpenCell, setOptionalWelfareText, year]);

  const onMemoKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onMemoCancel();
        return;
      }
      /** Enter = 저장 / Shift+Enter = 줄바꿈. 사내 단축키 관습에 맞춤. */
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onMemoCommit();
      }
    },
    [onMemoCancel, onMemoCommit],
  );

  /** 한 행에서 “가장 우선순위 높은” 상태 — error > pending > saved > idle. */
  function rowStatus(employeeId: string): CellStatus {
    let acc: CellStatus = "idle";
    for (let m = 1; m <= 12; m++) {
      const s = statusByCell.get(cellKey(employeeId, m));
      if (s === "error") return "error";
      if (s === "pending") acc = "pending";
      else if (s === "saved" && acc === "idle") acc = "saved";
    }
    return acc;
  }

  function rowErrorMessage(employeeId: string): string | null {
    for (let m = 1; m <= 12; m++) {
      const e = errorByCell.get(cellKey(employeeId, m));
      if (e) return e;
    }
    return null;
  }

  function rowAccrualSum(employeeId: string): number {
    let s = 0;
    for (let m = 1; m <= 12; m++) {
      const v = valueByCell.get(cellKey(employeeId, m));
      if (typeof v === "number") s += v;
    }
    return s;
  }

  function fmt(n: number): string {
    return Math.round(n).toLocaleString("ko-KR");
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">직원 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        각 칸은 해당 <strong className="text-[var(--text)]">지급월</strong> 월별 노트의「발생 인센」과 같습니다. 입력
        후 잠시 멈추거나 다른 칸을 누르면{" "}
        <strong className="text-[var(--text)]">자동으로 저장</strong>됩니다(저장 버튼 없음). 행 끝의{" "}
        <strong className="text-[var(--text)]">잔여(예상−누적)</strong>가 음수면 발생 인센이 ‘예상 인센’ 한도를
        넘은 것이라, 초과분은 사복으로 다 줄 수 없으므로 <strong className="text-[var(--text)]">급여에 얹어 신고</strong>해야 합니다.
      </p>

      <div className="rounded-md border border-[var(--border)] bg-[var(--surface-hover)] p-3 text-xs leading-relaxed text-[var(--muted)]">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="incentiveNetRatioPercent" className="font-semibold text-[var(--text)]">
            세후 자동 변환 비율(%)
          </label>
          <input
            id="incentiveNetRatioPercent"
            name="incentiveNetRatioPercent"
            ref={ratioInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={
              "input w-20 px-2 py-1 text-center text-sm tabular-nums " +
              (ratioEditing
                ? "border-[var(--accent)]/60 ring-1 ring-[var(--accent)]/30"
                : "cursor-not-allowed border-dashed bg-[var(--surface)]/60 text-[var(--muted)]")
            }
            disabled={!canEdit}
            readOnly={!ratioEditing}
            placeholder="예: 80"
            value={ratioInput}
            onChange={(e) => onRatioInputChange(e.target.value)}
            onKeyDown={onRatioInputKeyDown}
            aria-readonly={!ratioEditing}
            title={ratioEditing ? "편집 모드 — Enter 로 저장, Esc 로 취소" : "잠금 — 수정하려면 ‘수정하기’를 누르세요"}
          />
          <span
            className={
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold " +
              (ratioActive
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]")
            }
          >
            {ratioActive ? `자동 변환 ON · ${activeRatio}%` : "자동 변환 OFF"}
          </span>

          {canEdit ? (
            ratioEditing ? (
              <span className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  className={
                    "rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold " +
                    (ratioDirty
                      ? "border-[var(--accent)]/60 bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
                      : "cursor-not-allowed border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]")
                  }
                  onClick={onRatioEditCommit}
                  disabled={!ratioDirty}
                  title={ratioDirty ? "Enter 로도 저장됩니다" : "변경 사항이 없습니다"}
                >
                  완료(저장)
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  onClick={onRatioEditCancel}
                  title="Esc 로도 취소됩니다"
                >
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="ml-auto rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                onClick={onRatioEditEnter}
                title="비율을 수정하려면 누르세요. 변경은 새 입력부터 적용됩니다."
              >
                수정하기
              </button>
            )
          ) : null}

          <span className="basis-full text-[0.7rem] text-[var(--muted)]">
            {ratioStatus === "pending"
              ? "비율 저장 중…"
              : ratioStatus === "saved"
                ? "저장됨 ✓"
                : ratioStatus === "error"
                  ? `저장 실패: ${ratioError ?? ""}`
                  : ratioEditing
                    ? "Enter = 저장 · Esc = 취소"
                    : canEdit
                      ? "잠금 상태 — 실수로 바뀌지 않도록 보호 중. 바꾸려면 ‘수정하기’를 누르세요."
                      : ""}
          </span>
        </div>
        <p className="mt-2">
          {ratioActive ? (
            <>
              아래 셀에 <strong className="text-[var(--text)]">세전 인센 금액</strong>을 입력하면 자동으로{" "}
              <strong className="text-[var(--text)]">{activeRatio}%</strong> 만 적용된 세후 금액으로 저장됩니다. 예:{" "}
              <strong className="text-[var(--text)]">1,000,000원</strong> 입력 →{" "}
              <strong className="text-[var(--text)]">{(1_000_000 * (activeRatio ?? 0) / 100).toLocaleString("ko-KR")}원</strong> 저장.
              비율 변경은 <strong className="text-[var(--text)]">새 입력부터</strong> 적용되며, 이미 저장된 셀은 자동
              재계산되지 않습니다(필요하면 그 셀을 다시 입력해 주세요).
            </>
          ) : (
            <>
              비율을 비워 두거나 100 으로 두면 자동 변환이 <strong className="text-[var(--text)]">비활성</strong> —
              아래 셀에 적은 금액이 그대로 저장됩니다. 1~99 사이 정수를 적으면{" "}
              <strong className="text-[var(--text)]">세전 → 세후 자동 변환</strong>이 켜집니다(예: 80 입력 시 80% 만
              저장).
            </>
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <div className="min-w-[110rem] bg-[var(--surface)]">
          <div
            className="grid border-b border-[var(--border)] bg-[var(--surface-hover)]"
            style={{ gridTemplateColumns: ROW_GRID }}
          >
            <div className="sticky left-0 z-[1] bg-[var(--surface-hover)] px-2 py-2 text-xs font-bold text-[var(--muted)]">
              코드
            </div>
            <div className="sticky left-[5.5rem] z-[1] bg-[var(--surface-hover)] px-2 py-2 text-xs font-bold text-[var(--muted)]">
              이름
            </div>
            {MONTHS.map((m) => (
              <div
                key={m}
                className="px-1 py-2 text-center text-xs font-bold tabular-nums text-[var(--muted)]"
              >
                {m}월
              </div>
            ))}
            <div className="px-2 py-2 text-right text-xs font-bold text-[var(--muted)]" title="직원 폼의 ‘예상 인센’ — 사복으로 줄 수 있는 한도">
              예상 인센
            </div>
            <div className="px-2 py-2 text-right text-xs font-bold text-[var(--muted)]" title="1~12월 발생 인센 합">
              누적 발생
            </div>
            <div className="px-2 py-2 text-right text-xs font-bold text-[var(--muted)]" title="예상 − 누적 발생 (음수 = 급여 얹기 필요)">
              잔여(예상−누적)
            </div>
            <div className="px-1 py-2 text-center text-xs font-bold text-[var(--muted)]">상태</div>
          </div>

          {rows.map((r) => {
            const status = rowStatus(r.employeeId);
            const errMsg = rowErrorMessage(r.employeeId);
            const expected =
              r.incentiveAmount != null && Number.isFinite(Number(r.incentiveAmount))
                ? Math.max(0, Math.round(Number(r.incentiveAmount)))
                : 0;
            const accrued = rowAccrualSum(r.employeeId);
            const hasCap = expected > 0;
            const remaining = expected - accrued;
            const overflow = hasCap && remaining < 0;
            const ineligible = r.welfareIneligible;
            const stickyBg = ineligible
              ? "bg-[var(--surface-hover)]/40"
              : "bg-[var(--surface)]";
            return (
              <div
                key={r.employeeId}
                className={
                  "grid border-b border-[var(--border)] last:border-b-0 " +
                  (ineligible ? "opacity-90" : "")
                }
                style={{ gridTemplateColumns: ROW_GRID }}
              >
                <div className={`sticky left-0 z-[1] ${stickyBg} px-2 py-1.5 font-mono text-xs font-semibold tabular-nums text-[var(--text)]`}>
                  <span className="inline-flex items-center gap-1">
                    <span>{r.employeeCode}</span>
                    {ineligible ? (
                      <span
                        className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-1 py-0 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--muted)]"
                        title="사내근로복지기금 미대상 — 사복 화면에서는 빠지지만 인센 기록은 가능"
                      >
                        미대상
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className={`sticky left-[5.5rem] z-[1] ${stickyBg} px-2 py-1.5 text-sm font-medium text-[var(--text)]`}>
                  {r.name}
                </div>
                {MONTHS.map((m) => {
                  const k = cellKey(r.employeeId, m);
                  const cellState = statusByCell.get(k);
                  const cellHasError = cellState === "error";
                  /**
                   * 셀에 보이는 값은 "변환 후" 값. valueByCell(라이브) 가 있으면 그것을, 없으면 props 의 저장값을 쓴다.
                   * CommaWonInput 은 포커스 외에서만 defaultValue 변경을 input 에 반영하므로,
                   * 입력 중인 셀은 사용자의 raw 입력이 그대로 보이고 blur/디바운스 후 변환값으로 갱신된다.
                   */
                  const liveCellValue = valueByCell.get(k);
                  const propsCellValue = r.incentiveAccrualByMonth[m];
                  const cellDefault =
                    liveCellValue != null
                      ? liveCellValue
                      : propsCellValue != null && Number.isFinite(Number(propsCellValue))
                        ? Math.round(Number(propsCellValue))
                        : null;
                  const memoText = memoByCell.get(k) ?? null;
                  const hasMemo = memoText != null && memoText.trim().length > 0;
                  const memoState = memoStatusByCell.get(k);
                  const memoErr = memoErrorByCell.get(k) ?? null;
                  const memoOpen = memoOpenCell === k;
                  return (
                    <div key={m} className="relative px-1 py-1">
                      <button
                        type="button"
                        onClick={() => onMemoOpen(r.employeeId, m)}
                        disabled={!canEdit && !hasMemo}
                        className={
                          "absolute right-1.5 top-1.5 z-[2] inline-flex h-4 w-4 items-center justify-center rounded-full border text-[0.6rem] leading-none transition-colors " +
                          (memoState === "error"
                            ? "border-[var(--danger)]/60 bg-[var(--danger)]/10 text-[var(--danger)]"
                            : hasMemo
                              ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-[var(--accent)]"
                              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] opacity-60 hover:opacity-100") +
                          (canEdit ? " cursor-pointer" : hasMemo ? " cursor-help" : " cursor-not-allowed")
                        }
                        title={
                          memoState === "pending"
                            ? "메모 저장 중…"
                            : memoState === "error"
                              ? `메모 저장 실패: ${memoErr ?? ""}`
                              : hasMemo
                                ? `메모: ${memoText}`
                                : canEdit
                                  ? "이 달에 짧은 메모를 남깁니다 (Enter 저장 / Esc 취소)"
                                  : "메모 없음"
                        }
                        aria-label={hasMemo ? "메모 보기·편집" : "메모 추가"}
                      >
                        {hasMemo ? "•" : "+"}
                      </button>
                      <CommaWonInput
                        name={`incentiveAccrual_${m}`}
                        defaultValue={cellDefault}
                        disabled={!canEdit}
                        readOnly={!canEdit}
                        className={
                          "input w-full min-w-0 px-2 py-1 pr-6 text-sm tabular-nums " +
                          (cellHasError
                            ? "border-[var(--danger)]/60 ring-1 ring-[var(--danger)]/30"
                            : cellState === "saved"
                              ? "border-[var(--success)]/40"
                              : "")
                        }
                        placeholder={ratioActive ? `세전(자동 ${activeRatio}%)` : "—"}
                        onUserChange={(v) => onCellLiveChange(r.employeeId, m, v)}
                        onCommitValue={
                          canEdit
                            ? (v) => onCellCommit(r.employeeId, m, v)
                            : undefined
                        }
                      />
                      {memoOpen ? (
                        <div
                          className="absolute right-0 top-full z-[20] mt-1 w-72 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-card-hover)]"
                          role="dialog"
                          aria-label={`${m}월 메모`}
                        >
                          <div className="mb-1 flex items-center justify-between text-[0.7rem] text-[var(--muted)]">
                            <span>
                              <strong className="text-[var(--text)]">{r.name}</strong>{" "}
                              <span className="tabular-nums">· {year}.{m}월 메모</span>
                            </span>
                            <span className="tabular-nums">{memoDraft.length}/{MEMO_MAX_LEN}</span>
                          </div>
                          <textarea
                            ref={memoTextareaRef}
                            value={memoDraft}
                            onChange={(e) => onMemoChange(e.target.value)}
                            onKeyDown={onMemoKeyDown}
                            disabled={!canEdit}
                            readOnly={!canEdit}
                            rows={3}
                            maxLength={MEMO_MAX_LEN}
                            className="input w-full resize-y px-2 py-1 text-sm leading-snug"
                            placeholder="짧은 메모(예: 인센 사유, 정산 여부 등)"
                          />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[0.65rem] text-[var(--muted)]">
                              Enter = 저장 · Shift+Enter = 줄바꿈 · Esc = 취소
                            </span>
                            <span className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={onMemoCancel}
                                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[0.7rem] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                              >
                                취소
                              </button>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={onMemoCommit}
                                  className="rounded-md border border-[var(--accent)]/60 bg-[var(--accent)] px-2 py-1 text-[0.7rem] font-semibold text-white hover:bg-[var(--accent)]/90"
                                >
                                  저장
                                </button>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div
                  className="flex items-center justify-end px-2 py-1.5 text-sm tabular-nums text-[var(--muted)]"
                  title="직원 폼의 ‘예상 인센’ — 사복으로 줄 수 있는 한도"
                >
                  {hasCap ? fmt(expected) : "—"}
                </div>
                <div
                  className="flex items-center justify-end px-2 py-1.5 text-sm font-semibold tabular-nums text-[var(--text)]"
                  title="1~12월 발생 인센 합 (입력 즉시 갱신)"
                >
                  {accrued > 0 ? fmt(accrued) : "—"}
                </div>
                <div
                  className={
                    "flex flex-col items-end justify-center px-2 py-1.5 text-sm tabular-nums " +
                    (overflow
                      ? "text-[var(--danger)]"
                      : hasCap && remaining > 0
                        ? "text-[var(--success)]"
                        : "text-[var(--muted)]")
                  }
                  title={
                    !hasCap
                      ? "직원 폼에 ‘예상 인센’이 비어 있어 잔여를 비교할 수 없습니다."
                      : overflow
                        ? `발생 ${fmt(accrued)} − 예상 ${fmt(expected)} = ${fmt(-remaining)}원 초과. 사복 한도를 넘어 급여 포함으로 신고해야 합니다.`
                        : `예상 ${fmt(expected)} − 발생 ${fmt(accrued)} = 잔여 ${fmt(remaining)}원`
                  }
                >
                  <span className={overflow ? "font-bold" : "font-semibold"}>
                    {!hasCap ? "—" : (remaining >= 0 ? fmt(remaining) : `−${fmt(-remaining)}`)}
                  </span>
                  {overflow ? (
                    <span className="mt-0.5 text-[0.65rem] font-bold uppercase tracking-wide">
                      급여 얹기
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-center px-1 py-1 text-[0.7rem]">
                  {status === "pending" ? (
                    <span className="text-[var(--muted)]">저장 중…</span>
                  ) : status === "saved" ? (
                    <span className="font-semibold text-[var(--success)]">저장됨 ✓</span>
                  ) : status === "error" ? (
                    <span
                      className="font-semibold text-[var(--danger)]"
                      title={errMsg ?? "저장 실패"}
                    >
                      오류 !
                    </span>
                  ) : !canEdit ? (
                    <span className="text-[var(--muted)]">—</span>
                  ) : (
                    <span className="text-[var(--muted)]">자동 저장</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
