"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import {
  saveQuarterlyEmployeeConfigAction,
  type QState,
} from "@/app/actions/quarterly";
import { Alert } from "@/components/ui/Alert";

/**
 * “직원별 분기 항목 추가” 폼 — 서버 액션 결과(성공/경고/오류)를 즉시 화면에 보여 주기 위해
 * server component 의 raw form 대신 useActionState 로 감싼다.
 *
 * 자식 입력(select·체크박스·금액)은 그대로 server component 에서 렌더해 children 으로 받는다.
 */
export function QuarterlyEmployeeConfigForm({ children }: { children: ReactNode }) {
  const [state, formAction, pending] = useActionState<QState, FormData>(
    saveQuarterlyEmployeeConfigAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  /** 성공 시 금액 칸 정도는 비워주는 게 자연스럽지만, 직원·항목·지급월은 유지(연속 입력 시 편의). */
  useEffect(() => {
    if (state?.성공 && formRef.current) {
      const amount = formRef.current.querySelector<HTMLInputElement>('input[name="amount"]');
      if (amount) amount.value = "";
    }
  }, [state?.성공]);

  return (
    <div className="space-y-3">
      {state?.오류 ? (
        <Alert tone="danger" assertive>
          {state.오류}
        </Alert>
      ) : null}
      {state?.경고 ? (
        <Alert tone="warn" title="저장은 됐지만 확인이 필요합니다">
          {state.경고}
        </Alert>
      ) : null}
      {state?.성공 && !state?.경고 ? (
        <Alert tone="success">분기 항목이 저장되었습니다.</Alert>
      ) : null}
      <form
        ref={formRef}
        action={formAction}
        className="mx-auto flex max-w-2xl flex-col items-center gap-4"
        aria-busy={pending}
      >
        {children}
      </form>
    </div>
  );
}
