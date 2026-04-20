import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * 미들웨어는 Edge runtime 에서 실행되므로 모듈 초기화 시점에 throw 하면 매 요청 500 이 떨어진다.
 * 대신 명시적으로 한 번만 경고를 찍어 운영자가 인지할 수 있도록 한다.
 */
let warnedMissingSecret = false;
function checkSecret(secret: string | undefined): secret is string {
  if (secret && secret.length >= 16) return true;
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.error(
      "[sabok/middleware] SESSION_SECRET 가 설정되지 않았거나 16자 미만입니다. 모든 /dashboard 요청이 /login 으로 리다이렉트됩니다.",
    );
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("sabok_session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (!checkSecret(secret) || !token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
