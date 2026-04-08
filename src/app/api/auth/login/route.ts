import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ 오류: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      userTenants: {
        orderBy: { tenant: { code: "asc" } },
        include: { tenant: true },
      },
    },
  });
  if (!user) {
    return NextResponse.json({ 오류: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ 오류: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  let activeTenantId: string | null = null;
  let effectiveRole: Role = user.role;
  const isPlatformAdmin = user.isPlatformAdmin;

  if (isPlatformAdmin) {
    effectiveRole = Role.ADMIN;
    activeTenantId = null;
  } else if (user.userTenants.length === 1) {
    activeTenantId = user.userTenants[0].tenantId;
    effectiveRole = user.userTenants[0].role;
  } else if (user.userTenants.length > 1) {
    activeTenantId = null;
    effectiveRole = user.userTenants[0].role;
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
}
