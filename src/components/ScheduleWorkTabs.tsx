"use client";

import { Tabs } from "@/components/Tabs";
import { ScheduleAnnouncementPanel } from "@/components/ScheduleAnnouncementPanel";
import type { ScheduleCardRow } from "@/components/ScheduleEmployeeCards";
import type { AnnouncementMode, TenantOperationMode } from "@/lib/domain/tenant-profile";
import type { AdditionalReserveStatus } from "@/lib/domain/vendor-reserve";
import type { ReactNode } from "react";

/**
 * 스케줄 페이지 탭 묶음.
 * 안내 탭은 서버에서 `<ScheduleAnnouncementPanel rows={...} />` 를 미리 만들어 `Tabs.content` 에 넣으면
 * RSC→클라 직렬화 과정에서 `rows`(및 그 안의 급여분 배열)가 누락될 수 있어,
 * **클라이언트 안에서** `announcementRows` 를 받아 패널을 조립한다.
 */
export function ScheduleWorkTabs({
  scheduleTab,
  monthlyNoteTab,
  reserveTab,
  levelAssignmentTab,
  adjustedSalaryAuditTab,
  announcementRows,
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
  announcementRows: ScheduleCardRow[];
  announcementYear: number;
  announcementOperationMode: TenantOperationMode;
  announcementReserveStatus: AdditionalReserveStatus;
  announcementMode: AnnouncementMode;
  defaultBatchFromMonth: number | null;
  defaultBatchToMonth: number | null;
}) {
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
