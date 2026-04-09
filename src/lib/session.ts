import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/lib/role";

const COOKIE = "sabok_session";

/** 내부망 HTTP(http://IP:포트) 배포 시 production이라도 Secure 쿠키는 브라우저가 안 보냄 → 로그인 루프. HTTPS 앞단이면 COOKIE_SECURE=1 */
function secureCookieFlag(): boolean {
  const v = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return false;
}

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: Role;
  isPlatformAdmin: boolean;
  /** true면 활성 테넌트 전환·업무 데이터 접근 가능. 플랫폼 메뉴(업체/사용자 CRUD 등)는 isPlatformAdmin 전용. */
  accessAllTenants: boolean;
  activeTenantId: string | null;
  exp: number;
};

/** 플랫폼 관리자 또는 아웃소싱 대리 운영(전 업체 업무 접근). */
export function canAccessAnyTenant(s: SessionPayload): boolean {
  return s.isPlatformAdmin || s.accessAllTenants;
}

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
    accessAllTenants: payload.accessAllTenants,
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
    const accessAllTenants = Boolean(payload.accessAllTenants);
    const activeTenantIdRaw = payload.activeTenantId;
    const activeTenantId =
      activeTenantIdRaw === null || activeTenantIdRaw === undefined
        ? null
        : String(activeTenantIdRaw);
    if (!sub || !email || !role) return null;
    return { sub, email, name, role, isPlatformAdmin, accessAllTenants, activeTenantId, exp };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string, maxAgeSec: number) {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookieFlag(),
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
