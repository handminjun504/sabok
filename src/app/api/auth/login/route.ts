import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role, parseRole } from "@/lib/role";
import { userLoadWithTenantsByEmail } from "@/lib/pb/repository";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function isPbUnreachable(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /fetch failed|ECONNREFUSED|ECONNRESET|socket|network|502|503|aborted|timed out/i.test(
    e.message + (e as Error & { cause?: Error }).cause?.message
  );
}

function isSessionSecretError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("SESSION_SECRET");
}

function isPbConfigError(e: unknown): boolean {
  return e instanceof Error && /POCKETBASE_/i.test(e.message);
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ 오류: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const { email, password } = parsed.data;
    const user = await userLoadWithTenantsByEmail(email);
    if (!user) {
      return NextResponse.json({ 오류: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ 오류: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    let activeTenantId: string | null = null;
    let effectiveRole: Role = parseRole(user.role);
    const isPlatformAdmin = user.isPlatformAdmin;

    if (isPlatformAdmin) {
      effectiveRole = Role.ADMIN;
      activeTenantId = null;
    } else if (user.userTenants.length === 1) {
      activeTenantId = user.userTenants[0].tenantId;
      effectiveRole = parseRole(user.userTenants[0].role);
    } else if (user.userTenants.length > 1) {
      activeTenantId = null;
      effectiveRole = parseRole(user.userTenants[0].role);
    } else {
      return NextResponse.json(
        { 오류: "소속된 업체가 없습니다. 운영 관리자에게 업체 배정을 요청하세요." },
        { status: 403 }
      );
    }

    const maxAge = 60 * 60 * 24 * 7;
    const { token, exp } = await createSessionToken(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: effectiveRole,
        isPlatformAdmin,
        activeTenantId,
      },
      maxAge
    );
    await setSessionCookie(token, maxAge);
    await writeAudit({
      userId: user.id,
      tenantId: activeTenantId,
      action: "LOGIN",
      entity: "User",
      entityId: user.id,
    });
    return NextResponse.json({
      성공: true,
      만료: exp,
      업체선택필요: activeTenantId === null,
      사용자: { 이메일: user.email, 이름: user.name, 역할: effectiveRole },
    });
  } catch (e) {
    console.error("[api/auth/login]", e);
    if (isSessionSecretError(e)) {
      return NextResponse.json(
        {
          오류:
            "서버 세션 설정이 없습니다. 배포 환경에 SESSION_SECRET을 16자 이상으로 설정한 뒤 앱을 재시작하세요.",
        },
        { status: 500 }
      );
    }
    if (isPbConfigError(e)) {
      return NextResponse.json(
        {
          오류:
            "PocketBase 관리자 설정이 없습니다. POCKETBASE_URL·POCKETBASE_ADMIN_EMAIL·POCKETBASE_ADMIN_PASSWORD 를 확인하세요.",
        },
        { status: 500 }
      );
    }
    if (isPbUnreachable(e)) {
      return NextResponse.json(
        {
          오류:
            "PocketBase에 연결할 수 없습니다. POCKETBASE_URL·네트워크·PB 기동 여부를 확인한 뒤 다시 시도하세요.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { 오류: "로그인 처리 중 서버 오류가 발생했습니다. 잠시 후 다시 시도하세요." },
      { status: 500 }
    );
  }
}
