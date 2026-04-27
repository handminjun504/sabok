"use client";

import { useMemo, useState } from "react";

import { MidYearChangeModal, type MidYearChangeModalProps } from "@/components/MidYearChangeModal";

type EmployeeOption = MidYearChangeModalProps["employees"][number];

type Props = Omit<MidYearChangeModalProps, "open" | "onClose" | "defaultEffectiveMonth"> & {
  defaultEffectiveMonth?: number;
  /** 버튼 라벨 커스터마이징 (기본: "연중 중도 변경") */
  label?: string;
};

/** 레벨 규칙 페이지에서 모달을 여는 단일 진입 버튼. 서버 RSC → 클라이언트 섹션 경계 분리용. */
export function MidYearChangeButton(props: Props) {
  const [open, setOpen] = useState(false);
  const { year, amountsByLevelEvent, eventKeys, eventLabels, employees, canEdit, label } = props;

  /** 기본 적용 월: 부모에서 전달받거나, 현재 월(현재 연도일 때) 또는 2월. */
  const defaultEffectiveMonth = useMemo(() => {
    if (props.defaultEffectiveMonth && props.defaultEffectiveMonth >= 1 && props.defaultEffectiveMonth <= 12) {
      return props.defaultEffectiveMonth;
    }
    const now = new Date();
    if (now.getFullYear() === year) {
      return Math.max(2, Math.min(12, now.getMonth() + 1));
    }
    return 2;
  }, [props.defaultEffectiveMonth, year]);

  /** employees 를 안정적 레퍼런스로 — props 가 매 렌더마다 새 배열일 수 있으므로 */
  const emps: EmployeeOption[] = useMemo(() => employees, [employees]);

  return (
    <>
      <button
        type="button"
        className="btn btn-outline px-3 py-2 text-sm"
        onClick={() => setOpen(true)}
      >
        {label ?? "연중 중도 변경"}
      </button>
      <MidYearChangeModal
        open={open}
        onClose={() => setOpen(false)}
        year={year}
        defaultEffectiveMonth={defaultEffectiveMonth}
        amountsByLevelEvent={amountsByLevelEvent}
        eventKeys={eventKeys}
        eventLabels={eventLabels}
        employees={emps}
        canEdit={canEdit}
      />
    </>
  );
}
