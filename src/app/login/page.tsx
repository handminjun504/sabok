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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="neu-title-gradient text-3xl font-bold tracking-tight">사내근로복지기금</h1>
          <p className="mt-2 text-base text-[var(--muted)]">관리 시스템</p>
        </div>
        <div className="login-card">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">이메일</label>
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
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">비밀번호</label>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                type="password"
                required
              />
            </div>
            {error && (
              <p className="neu-field rounded-xl px-3 py-2.5 text-[0.9375rem] leading-relaxed text-[var(--danger)] ring-2 ring-red-200/40">
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary mt-2 w-full">
              {loading ? "확인 중…" : "로그인"}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-sm leading-relaxed text-[var(--muted)]">
          초기 계정: admin@sabok.local / senior@sabok.local / junior@sabok.local
        </p>
      </div>
    </main>
  );
}
