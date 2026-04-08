"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@sabok.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.오류 === "string" ? data.오류 : "로그인에 실패했습니다.");
      return;
    }
    if (data.업체선택필요 === true) {
      router.push("/dashboard/select-tenant");
    } else {
      router.push("/dashboard");
    }
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="uiverse-glow-card">
        <div className="uiverse-glow-card__bg uiverse-glow-card__bg--blur" aria-hidden />
        <div className="uiverse-glow-card__bg" aria-hidden />
        <div className="uiverse-glow-card__inner">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">사내근로복지기금 관리</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">로그인 후 대시보드로 이동합니다.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text)]">이메일</label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              type="email"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text)]">비밀번호</label>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              type="password"
              required
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button type="submit" disabled={loading} className="btn-uiverse-submit">
            {loading ? "확인 중…" : "로그인"}
          </button>
        </form>
        <p className="mt-4 text-xs text-[var(--muted)]">
          초기 계정: admin@sabok.local / senior@sabok.local / junior@sabok.local — 비밀번호는 시드 스크립트 참고
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          웹 브라우저로 접속합니다. 같은 네트워크의 다른 PC·태블릿에서 열려면 터미널에서{" "}
          <code className="rounded bg-[var(--border)] px-1">npm run dev:web</code> 후 이 컴퓨터의 IP와 포트(기본
          3000)로 접속하세요. 배포 서버에서는 <code className="rounded bg-[var(--border)] px-1">npm run start:web</code>{" "}
          또는 호스팅 환경의 공개 URL을 사용합니다.
        </p>
        </div>
      </div>
    </main>
  );
}
