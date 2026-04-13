"use client";

import { useState } from "react";

/**
 * `<a href="/api/...">` 직링크 다운로드는 HTTP 환경에서 브라우저가
 * "insecure connection / HTTPS 권장" 경고를 띄우는 경우가 있어,
 * 같은 출처 fetch → Blob → 다운로드로 처리한다.
 * (근본적으로 공인 배포는 HTTPS 권장.)
 */
export function EmployeeCsvExportButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/employees/export", { credentials: "same-origin" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(typeof data.오류 === "string" ? data.오류 : `오류 (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1]?.trim() || "sabok-employees-sheet.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="btn btn-outline px-4 py-2 text-sm disabled:opacity-50"
      >
        {busy ? "준비 중…" : "조사표 형식 CSV 내려받기"}
      </button>
      {err ? <p className="text-xs text-[var(--danger)]">{err}</p> : null}
    </div>
  );
}
