import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function POST() {
  const s = await getSession();
  await clearSessionCookie();
  if (s) {
    await writeAudit({
      userId: s.sub,
      action: "LOGOUT",
      entity: "User",
      entityId: s.sub,
    });
  }
  return NextResponse.json({ 성공: true });
}
