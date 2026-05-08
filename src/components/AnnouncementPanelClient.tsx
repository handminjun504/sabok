"use client";

import { useMemo } from "react";

import { ScheduleAnnouncementPanel } from "@/components/ScheduleAnnouncementPanel";
import { parseAnnouncementPanelPayloadJson } from "@/lib/domain/schedule-announcement-payload";
import type { AnnouncementMode, TenantOperationMode } from "@/lib/domain/tenant-profile";
import type { AdditionalReserveStatus } from "@/lib/domain/vendor-reserve";

/**
 * 「월별 안내」 메뉴(`/dashboard/announcement`) 전용 클라이언트 래퍼.
 *
 * 서버에서 `encodeAnnouncementPanelPayloadJson(scheduleCardRows)` 로 만든 JSON 문자열만 받아
 * 클라이언트에서 한 번 파싱해 `ScheduleAnnouncementPanel` 에 넘긴다.
 * 객체 배열을 RSC 경계에서 직접 넘기지 않고 문자열 1개만 넘겨,
 * Flight 직렬화로 일부 필드가 비는 사고를 원천 차단한다 (스케줄 페이지의 안내 탭과 동일 패턴).
 */
export function AnnouncementPanelClient({
  year,
  payloadJson,
  operationMode,
  reserveStatus,
  announcementMode,
  defaultBatchFromMonth,
  defaultBatchToMonth,
}: {
  year: number;
  payloadJson: string;
  operationMode: TenantOperationMode;
  reserveStatus: AdditionalReserveStatus;
  announcementMode: AnnouncementMode;
  defaultBatchFromMonth: number | null;
  defaultBatchToMonth: number | null;
}) {
  const rows = useMemo(
    () => parseAnnouncementPanelPayloadJson(payloadJson),
    [payloadJson],
  );

  return (
    <ScheduleAnnouncementPanel
      year={year}
      rows={rows}
      operationMode={operationMode}
      reserveStatus={reserveStatus}
      announcementMode={announcementMode}
      defaultBatchFromMonth={defaultBatchFromMonth}
      defaultBatchToMonth={defaultBatchToMonth}
    />
  );
}
