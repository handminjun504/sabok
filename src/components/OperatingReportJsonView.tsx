"use client";

import { useState } from "react";
import type { SpecOperatingReportJson } from "@/types/models";

type Props = {
  json: SpecOperatingReportJson;
  fileName?: string;
};

/** 스펙 JSON 뷰 — 텍스트로 보고 복사·다운로드 가능. 출력 단위는 천원. */
export function OperatingReportJsonView({ json, fileName = "operating-report.json" }: Props) {
  const text = JSON.stringify(json, null, 2);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("[OperatingReportJsonView] clipboard failed", e);
    }
  };

  const onDownload = () => {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text)]">스펙 JSON 출력 (단위: 천원)</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)]"
          >
            {copied ? "복사됨!" : "복사"}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            JSON 다운로드
          </button>
        </div>
      </header>
      <pre className="max-h-[640px] overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface-hover)] p-3 text-[11px] leading-snug font-mono text-[var(--text)]">
        {text}
      </pre>
    </section>
  );
}
