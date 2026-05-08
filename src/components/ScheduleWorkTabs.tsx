"use client";

import type { ReactNode } from "react";

import { Tabs } from "@/components/Tabs";

/**
 * 스케줄 페이지 탭 묶음.
 * 「안내」 탭은 별도 메뉴(`/dashboard/announcement`) 로 분리되었음 — 본 컴포넌트는 금액 입력·표시 탭만 다룬다.
 */
export function ScheduleWorkTabs({
  scheduleTab,
  monthlyNoteTab,
  monthlySchedulesTab,
  reserveTab,
  levelAssignmentTab,
  adjustedSalaryAuditTab,
}: {
  scheduleTab: ReactNode;
  monthlyNoteTab: ReactNode;
  monthlySchedulesTab: ReactNode;
  reserveTab: ReactNode;
  levelAssignmentTab: ReactNode;
  adjustedSalaryAuditTab: ReactNode;
}) {
  return (
    <Tabs
      tabs={[
        { label: "스케줄", content: scheduleTab },
        { label: "메모·인센", content: monthlyNoteTab },
        { label: "대표반환·배우자·알아서", content: monthlySchedulesTab },
        { label: "적립금", content: reserveTab },
        { label: "예정액", content: levelAssignmentTab },
        { label: "연봉 점검", content: adjustedSalaryAuditTab },
      ]}
    />
  );
}
