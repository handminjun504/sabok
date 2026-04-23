"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ImportRow = { row: number; employeeCode: string; 상태: string; 메시지?: string };

export function CsvImportClient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportRow[] | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFileName(null);
    setText("");
    setResults(null);
    setErrMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);
    setErrMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => setText((ev.target?.result as string) ?? "");
    reader.readAsText(file, "utf-8");
  }

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    setResults(null);
    setErrMsg(null);
    const res = await fetch("/api/employees/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv; charset=utf-8" },
      body: text,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErrMsg(typeof data.오류 === "string" ? data.오류 : "가져오기 실패");
      return;
    }
    const rows: ImportRow[] = Array.isArray(data.결과) ? data.결과 : [];
    setResults(rows);
    router.refresh();
  }

  function handleClose() {
    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-outline px-4 py-2 text-sm">
        CSV 가져오기
      </button>
    );
  }

  const saved = results?.filter((r) => r.상태 === "저장됨").length ?? 0;
  const skipped = results?.filter((r) => r.상태 !== "저장됨").length ?? 0;

  return (
    <div className="surface fixed inset-0 z-50 m-auto h-fit max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl p-6 shadow-xl">
      <h2 className="text-lg font-semibold">CSV 직원 등록</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        .csv 파일을 선택하거나 아래 영역에 CSV 텍스트를 직접 붙여넣으세요.
      </p>

      {/* 파일 선택 */}
      <div
        className="neu-field mt-4 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 hover:opacity-80"
        onClick={() => fileInputRef.current?.click()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <span className="text-sm">
          {fileName ? (
            <span className="font-medium text-[var(--text)]">{fileName}</span>
          ) : (
            <span className="text-[var(--muted)]">파일 선택 (*.csv)</span>
          )}
        </span>
        {fileName && (
          <button
            type="button"
            className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--text)]"
            onClick={(e) => { e.stopPropagation(); reset(); }}
          >
            ✕
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* 또는 텍스트 직접 입력 */}
      <p className="mt-3 text-xs text-[var(--muted)]">또는 직접 붙여넣기</p>
      <textarea
        className="neu-field mt-1 h-32 w-full rounded-xl p-3 text-xs font-mono text-[var(--text)]"
        placeholder={"CODE,이름,직급,기존연봉,조정급여,사복지급분,레벨\n1,홍길동,과장,60000000,60000000,1200000,3"}
        value={text}
        onChange={(e) => { setText(e.target.value); setFileName(null); }}
      />

      {/* 에러 */}
      {errMsg && <p className="mt-2 text-sm text-[var(--error)]">{errMsg}</p>}

      {/* 결과 테이블 */}
      {results && (
        <div className="mt-3">
          <p className="text-sm font-medium">
            처리 완료 — 저장 <span className="text-[var(--success)]">{saved}건</span>
            {skipped > 0 && <span className="ml-2 text-[var(--warn)]">건너뜀 {skipped}건</span>}
          </p>
          {skipped > 0 && (
            <div className="neu-field mt-2 max-h-36 overflow-auto rounded-xl p-2 text-xs font-mono">
              {results
                .filter((r) => r.상태 !== "저장됨")
                .map((r) => (
                  <div key={r.row} className="text-[var(--warn)]">
                    {r.row}행 [{r.employeeCode}] {r.메시지}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost px-3 py-2 text-sm" onClick={handleClose}>
          닫기
        </button>
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={run}
          className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "처리 중…" : "가져오기"}
        </button>
      </div>
    </div>
  );
}
