"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";

import { Tabs } from "@/components/Tabs";
import { ScheduleAnnouncementPanel } from "@/components/ScheduleAnnouncementPanel";
import type { AnnouncementMode, TenantOperationMode } from "@/lib/domain/tenant-profile";
import { parseAnnouncementPanelPayloadJson } from "@/lib/domain/schedule-announcement-payload";
import type { AdditionalReserveStatus } from "@/lib/domain/vendor-reserve";

/**
 * 스케줄 페이지 탭 묶음.
 * 안내 탭 데이터는 `announcementPayloadJson` 문자열로만 받아 Flight/RSC 직렬화로 객체 필드가 비는 문제를 피한다.
 */
export function ScheduleWorkTabs({
  scheduleTab,
  monthlyNoteTab,
  reserveTab,
  levelAssignmentTab,
  adjustedSalaryAuditTab,
  announcementPayloadJson,
  announcementYear,
  announcementOperationMode,
  announcementReserveStatus,
  announcementMode,
  defaultBatchFromMonth,
  defaultBatchToMonth,
}: {
  scheduleTab: ReactNode;
  monthlyNoteTab: ReactNode;
  reserveTab: ReactNode;
  levelAssignmentTab: ReactNode;
  adjustedSalaryAuditTab: ReactNode;
  announcementPayloadJson: string;
  announcementYear: number;
  announcementOperationMode: TenantOperationMode;
  announcementReserveStatus: AdditionalReserveStatus;
  announcementMode: AnnouncementMode;
  defaultBatchFromMonth: number | null;
  defaultBatchToMonth: number | null;
}) {
  const announcementRows = useMemo(
    () => parseAnnouncementPanelPayloadJson(announcementPayloadJson),
    [announcementPayloadJson],
  );

  const announcementTab = (
    <ScheduleAnnouncementPanel
      year={announcementYear}
      rows={announcementRows}
      operationMode={announcementOperationMode}
      reserveStatus={announcementReserveStatus}
      announcementMode={announcementMode}
      defaultBatchFromMonth={defaultBatchFromMonth}
      defaultBatchToMonth={defaultBatchToMonth}
    />
  );

  return (
    <Tabs
      tabs={[
        { label: "스케줄", content: scheduleTab },
        { label: "안내", content: announcementTab },
        { label: "메모·인센", content: monthlyNoteTab },
        { label: "적립금", content: reserveTab },
        { label: "예정액", content: levelAssignmentTab },
        { label: "연봉 점검", content: adjustedSalaryAuditTab },
      ]}
    />
  );
}
