"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "SENIOR", "JUNIOR"]),
});

export type UserState = { 오류?: string; 성공?: boolean } | null;

export async function createUserFormAction(formData: FormData): Promise<void> {
  await createUserAction(null, formData);
}

export async function createUserAction(_: UserState, formData: FormData): Promise<UserState> {
  const session = await getSession();
  if (!session) return { 오류: "로그인이 필요합니다." };
  if (!session.isPlatformAdmin) {
    return { 오류: "플랫폼 관리자만 전역 사용자를 생성할 수 있습니다." };
  }

  const parsed = schema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { 오류: "입력을 확인하세요." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const isPlatformAdmin = formData.get("isPlatformAdmin") === "on";

  try {
    await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role as Role,
        isPlatformAdmin,
      },
    });
  } catch {
    return { 오류: "이메일이 이미 존재합니다." };
  }

  await writeAudit({
    userId: session.sub,
    tenantId: null,
    action: "CREATE_USER",
    entity: "User",
    entityId: parsed.data.email,
  });
  revalidatePath("/dashboard/users");
  return { 성공: true };
}
