"use client";

import { useTransition } from "react";
import { deleteQuarterlyEmployeeConfigFormAction } from "@/app/actions/quarterly";

/**
 * 분기 지원 “설정 목록” 한 행의 삭제 버튼.
 * confirm 으로 사고 방지, useTransition 으로 중복 클릭 방지.
 */
export function QuarterlyConfigDeleteButton({
  configId,
  description,
}: {
  configId: string;
  /** 확인 모달에 띄울 설명 — “직원 / 항목 / 금액” 등 한 줄 요약 */
  description: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        if (
          !window.confirm(
            `이 분기 설정을 삭제할까요?\n\n${description}\n\n되돌릴 수 없습니다.`,
          )
        ) {
          return;
        }
        startTransition(() => {
          deleteQuarterlyEmployeeConfigFormAction(formData);
        });
      }}
    >
      <input type="hidden" name="configId" value={configId} />
      <button
        type="submit"
        disabled={pending}
        className="btn btn-danger text-xs px-2.5 py-1 disabled:opacity-50"
      >
        {pending ? "삭제 중…" : "삭제"}
      </button>
    </form>
  );
}
