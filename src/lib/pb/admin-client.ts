import PocketBase from "pocketbase";

let instance: PocketBase | null = null;

export function getPbBaseUrl(): string {
  const url = process.env.POCKETBASE_URL?.trim();
  if (!url) {
    throw new Error("POCKETBASE_URL 환경 변수를 설정하세요.");
  }
  return url.replace(/\/$/, "");
}

/**
 * Server-only: Admin 인증된 PocketBase 클라이언트(요청 간 재사용).
 */
export async function getAdminPb(): Promise<PocketBase> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL?.trim();
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || password === undefined || password === "") {
    throw new Error("POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD 를 설정하세요.");
  }

  if (!instance) {
    instance = new PocketBase(getPbBaseUrl());
  }

  const pb = instance;
  if (!pb.authStore.isValid) {
    await pb.admins.authWithPassword(email, password);
  }
  return pb;
}
