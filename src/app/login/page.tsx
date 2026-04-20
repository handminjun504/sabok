"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

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
    <main className="relative flex min-h-screen flex-col lg:flex-row">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      {/* 좌측 — 브랜드/소개 */}
      <section className="relative flex flex-1 flex-col justify-center px-6 py-12 lg:px-12 xl:px-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 120% 80% at 18% 18%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 52%), radial-gradient(ellipse 100% 70% at 82% 58%, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 48%)",
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
            <li className="flex gap-2">
              <span className="text-[var(--accent)]" aria-hidden>
                ✓
              </span>
              조사표·운영보고·급여포함신고까지 일관된 톤
            </li>
          </ul>
        </div>
      </section>

      {/* 우측 — 로그인 카드 */}
      <section className="flex flex-1 items-center justify-center bg-[color:var(--bg-soft)] px-4 py-10 lg:border-l lg:border-[var(--border)] lg:bg-[var(--surface)] lg:py-16">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <p className="page-eyebrow">Sign in</p>
            <h2 className="mt-2 neu-title-gradient text-2xl font-bold tracking-tight">사내근로복지기금</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">관리 시스템</p>
          </div>
          <div className="login-card">
            <p className="mb-5 hidden text-sm font-semibold text-[var(--text)] lg:block">로그인</p>
            <form onSubmit={onSubmit} className="space-y-4" aria-busy={loading}>
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  이메일
                </label>
                <input
                  id="login-email"
                  className="input text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  type="email"
                  required
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  비밀번호
                </label>
                <input
                  id="login-password"
                  className="input text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  type="password"
                  required
                />
              </div>
              {error ? (
                <Alert tone="danger" assertive>
                  {error}
                </Alert>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary mt-2 w-full text-sm"
                aria-label={loading ? "로그인 확인 중" : "로그인"}
              >
                {loading ? (
                  <>
                    <span className="spinner border-white/40 border-t-white" aria-hidden />
                    확인 중…
                  </>
                ) : (
                  "로그인"
                )}
              </button>
            </form>
          </div>
          <p className="mt-4 text-center text-xs text-[var(--muted)]">
            계정 문의는 관리자에게 연락하세요.
          </p>
        </div>
      </section>
    </main>
  );
}
