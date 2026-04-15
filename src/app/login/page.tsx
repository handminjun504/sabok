"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section className="relative flex flex-1 flex-col justify-center px-6 py-12 lg:px-12 xl:px-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5] lg:rounded-br-[3rem]"
          style={{
            background:
              "radial-gradient(ellipse 120% 80% at 18% 18%, rgba(196, 92, 51, 0.14) 0%, transparent 52%), radial-gradient(ellipse 100% 70% at 82% 58%, rgba(214, 115, 74, 0.1) 0%, transparent 48%)",
          }}
        />
        <div className="relative max-w-lg">
          <p className="page-eyebrow">Fund management</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">
            사내근로복지기금
            <span className="mt-1 block text-2xl font-bold text-[var(--muted)] sm:text-3xl">운영을 한곳에서</span>
          </h1>
          <p className="page-hero-sub mt-5">
            직원·정기지급·분기 지원·스케줄까지, 복지기금 업무를 단계별로 정리해 두었습니다. 로그인 후 거래처를 선택하면 업무 메뉴가 열립니다.
          </p>
          <ul className="mt-8 space-y-3 text-sm font-medium text-[var(--muted)]">
            <li className="flex gap-2">
              <span className="text-[var(--accent)]" aria-hidden>
                ✓
              </span>
              업체별 데이터 분리 · 권한에 맞는 메뉴
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--accent)]" aria-hidden>
                ✓
              </span>
              레벨·분기·월별 지급 흐름을 한 화면에서
            </li>
          </ul>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center px-4 py-10 lg:border-l lg:border-[var(--border)] lg:bg-[var(--surface)] lg:py-16">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <p className="page-eyebrow">Sign in</p>
            <h2 className="mt-2 neu-title-gradient text-2xl font-bold tracking-tight">사내근로복지기금</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">관리 시스템</p>
          </div>
          <div className="login-card">
            <p className="mb-5 hidden text-sm font-semibold text-[var(--text)] lg:block">로그인</p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">이메일</label>
                <input
                  className="input text-sm"
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
                  className="input text-sm"
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
              <button type="submit" disabled={loading} className="btn btn-primary mt-2 w-full text-sm">
                {loading ? "확인 중…" : "로그인"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
