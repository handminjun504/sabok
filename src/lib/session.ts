import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";

const COOKIE = "sabok_session";

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: Role;
  isPlatformAdmin: boolean;
  activeTenantId: string | null;
  exp: number;
};

async function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET 환경 변수를 16자 이상 설정하세요.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: Omit<SessionPayload, "exp">,
  maxAgeSec = 60 * 60 * 24 * 7
) {
  const key = await secretKey();
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const token = await new SignJWT({
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    isPlatformAdmin: payload.isPlatformAdmin,
    activeTenantId: payload.activeTenantId,
    exp,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
  return { token, exp };
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const key = await secretKey();
    const { payload } = await jwtVerify(token, key);
    const sub = String(payload.sub ?? "");
    const email = String(payload.email ?? "");
    const name = String(payload.name ?? "");
    const role = payload.role as Role;
    const exp = Number(payload.exp ?? 0);
    const isPlatformAdmin = Boolean(payload.isPlatformAdmin);
    const activeTenantIdRaw = payload.activeTenantId;
    const activeTenantId =
      activeTenantIdRaw === null || activeTenantIdRaw === undefined
        ? null
        : String(activeTenantIdRaw);
    if (!sub || !email || !role) return null;
    return { sub, email, name, role, isPlatformAdmin, activeTenantId, exp };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string, maxAgeSec: number) {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
