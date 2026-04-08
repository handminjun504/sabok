import { userListAllByEmailAsc } from "@/lib/pb/repository";
import { requireSession } from "@/lib/auth-context";
import { createUserFormAction } from "@/app/actions/user";
import { redirect } from "next/navigation";

export default async function UsersPage() {
  const session = await requireSession();
  if (!session.isPlatformAdmin) {
    redirect("/dashboard");
  }

  const users = await userListAllByEmailAsc();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">사용자</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">플랫폼 관리자 전용 · 전역 계정 생성</p>
      </div>

      <form action={createUserFormAction} className="surface space-y-4 p-6">
        <h2 className="text-sm font-semibold">사용자 추가</h2>
        <div>
          <label className="text-xs text-[var(--muted)]">이메일</label>
          <input name="email" type="email" required className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">이름</label>
          <input name="name" required className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">비밀번호 (8자 이상)</label>
          <input name="password" type="password" required minLength={8} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">역할</label>
          <select name="role" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
            <option value="JUNIOR">후임 (JUNIOR)</option>
            <option value="SENIOR">선임 (SENIOR)</option>
            <option value="ADMIN">관리자 (ADMIN)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input type="checkbox" name="isPlatformAdmin" className="rounded border-[var(--border)]" />
          플랫폼 관리자(전 업체·감사·사용자 관리)
        </label>
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
          추가
        </button>
      </form>

      <div className="surface overflow-x-auto p-4">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-2">이메일</th>
              <th className="py-2">이름</th>
              <th className="py-2">역할</th>
              <th className="py-2">플랫폼</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[var(--border)]">
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.name}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2">{u.isPlatformAdmin ? "예" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
