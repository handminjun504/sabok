"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CsvImportClient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/employees/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv; charset=utf-8" },
      body: text,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(typeof data.오류 === "string" ? data.오류 : "가져오기 실패");
      return;
    }
    const rows = Array.isArray(data.결과) ? data.결과 : [];
    const ok = rows.filter((r: { 상태: string }) => r.상태 === "저장됨").length;
    setMsg(`처리 완료: 저장 ${ok}건 / 전체 ${rows.length}행`);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-outline px-4 py-2 text-sm">
        CSV 붙여넣기 가져오기
      </button>
    );
  }

  return (
    <div className="surface fixed inset-0 z-50 m-auto h-fit max-h-[90vh] w-full max-w-2xl overflow-auto p-6">
      <h2 className="text-lg font-semibold">CSV 가져오기</h2>
      <textarea
        className="neu-field mt-3 h-52 w-full rounded-xl p-3 text-xs font-mono text-[var(--text)]"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {msg && <p className="mt-2 text-sm text-[var(--success)]">{msg}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost px-3 py-2 text-sm" onClick={() => setOpen(false)}>
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
