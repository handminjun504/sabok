import { ClientResponseError } from "pocketbase";

/** PM2/서버 로그에서 원인 확인용 — PB `data`에 필드별 검증 메시지가 올 수 있음 */
export function logPbClientError(context: string, e: unknown): void {
  if (e instanceof ClientResponseError) {
    console.error(`[pb] ${context}`, e.status, e.url, JSON.stringify(e.response ?? {}));
    return;
  }
  console.error(`[pb] ${context}`, e);
}
