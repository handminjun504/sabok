import { ClientResponseError } from "pocketbase";

/** PM2/서버 로그에서 원인 확인용 — PB `data`에 필드별 검증 메시지가 올 수 있음 */
export function logPbClientError(context: string, e: unknown): void {
  if (e instanceof ClientResponseError) {
    console.error(`[pb] ${context}`, e.status, e.url, JSON.stringify(e.response ?? {}));
    return;
  }
  console.error(`[pb] ${context}`, e);
}

type PbFieldErr = { message?: string };

/**
 * create/update 실패 시 UI에 보여줄 문장. PB는 상위 message만 "Failed to create record." 로 두는 경우가 많고,
 * 실제 이유는 response.data.{필드}.message 에 있음.
 */
export function pocketBaseRecordErrorMessage(e: ClientResponseError): string {
  const r = e.response as { message?: string; data?: Record<string, unknown> } | undefined;
  const data = r?.data;
  if (data && typeof data === "object") {
    const parts: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val === "object" && typeof (val as PbFieldErr).message === "string") {
        parts.push(`${key}: ${(val as PbFieldErr).message}`);
      }
    }
    if (parts.length > 0) return parts.join(" · ");
  }
  const top = r?.message;
  if (top && top !== "Failed to create record." && top !== "Failed to update record." && top !== "Something went wrong.") {
    return top;
  }
  return e.message || "PocketBase가 요청을 거절했습니다.";
}

/**
 * PB Nonempty 검증이 0·false 를 거절할 때 흔한 메시지. UI에 스키마 수정 안내를 덧붙일 때 사용.
 */
export function pocketBaseNonemptyBlankHint(detail: string): string {
  if (!detail.includes("Cannot be blank") && !detail.includes("Missing required value")) {
    return "";
  }
  return (
    " · Nonempty: number·bool에 required=true이면 0·false가 거절됩니다. " +
    "`amount`는 직원뿐 아니라 분기 직원 설정·레벨 행사 금액·레벨5 오버라이드에도 있습니다. " +
    "직원: `npm run pb:fix-employees-schema` · 분기: `npm run pb:fix-quarterly-schema` · 레벨 규칙: `npm run pb:fix-level-rules-schema` · 레벨5: `npm run pb:fix-level5-schema`. " +
    "그래도 동일하면 POCKETBASE_URL이 앱·스크립트·PB Admin이 가리키는 인스턴스와 같은지, PB 훅·규칙을 확인하세요. (저장 실패 시 서버 로그에 PB 응답이 기록됩니다.)"
  );
}
