/**
 * GL 서버 MCP 연동 스텁(Phase 7)
 * 실제 MCP 호출·전표 생성은 인터페이스 계약 확정 후 여기에 연결합니다.
 */

import { glSyncJobCreate } from "@/lib/pb/repository";

export type GlSyncRequest = {
  tenantId: string;
  고객사코드: string;
  고객사명: string;
  기준연도: number;
  기준월?: number;
  직원코드목록?: string[];
};

export type GlSyncResult = {
  성공: boolean;
  메시지: string;
  작업Id: string;
};

export async function enqueueGlSyncJob(request: GlSyncRequest): Promise<GlSyncResult> {
  const job = await glSyncJobCreate({
    tenantId: request.tenantId,
    status: "pending",
    payload: JSON.parse(JSON.stringify(request)),
  });
  return {
    성공: true,
    메시지: "GL 동기화 요청이 큐에 등록되었습니다. MCP 연결 후 처리됩니다.",
    작업Id: job.id,
  };
}
