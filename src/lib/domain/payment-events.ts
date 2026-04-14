import {
  PAYMENT_EVENT,
  PAYMENT_EVENT_LABELS,
  type PaymentEventKey,
} from "@/lib/business-rules";
import type { CompanySettings, CustomPaymentEventDef } from "@/types/models";

/** 정기 지급 금액·목표 배분 시 사용하는 단위(원) — 표시가 끊어지도록 만원 단위 */
export const PAYMENT_AMOUNT_STEP = 10_000;

export function orderedBuiltinPaymentEventKeys(): PaymentEventKey[] {
  return Object.values(PAYMENT_EVENT);
}

export function customPaymentDefsForYear(
  settings: CompanySettings | null,
  year: number
): CustomPaymentEventDef[] {
  return settings?.paymentEventDefs?.[String(year)] ?? [];
}

export function allPaymentEventKeysForYear(settings: CompanySettings | null, year: number): string[] {
  const custom = customPaymentDefsForYear(settings, year);
  return [...orderedBuiltinPaymentEventKeys(), ...custom.map((c) => c.eventKey)];
}

export function paymentEventLabel(eventKey: string, customDefs: CustomPaymentEventDef[]): string {
  if (eventKey in PAYMENT_EVENT_LABELS) {
    return PAYMENT_EVENT_LABELS[eventKey as PaymentEventKey];
  }
  const c = customDefs.find((d) => d.eventKey === eventKey);
  return c?.label ?? eventKey;
}

/** `<option>` 등 한 줄 표기 — 라벨 내 `\n` 제거 */
export function paymentEventLabelSingleLine(eventKey: string, customDefs: CustomPaymentEventDef[]): string {
  return paymentEventLabel(eventKey, customDefs).replace(/\s*\n\s*/g, " ").trim();
}

export function customPaymentScheduleRows(
  settings: CompanySettings | null,
  year: number
): { eventKey: string; accrualMonth: number }[] {
  return customPaymentDefsForYear(settings, year).map((d) => ({
    eventKey: d.eventKey,
    accrualMonth: d.accrualMonth,
  }));
}

/**
 * 연간 목표액을 행사 수만큼 균등 분배. 각 금액은 step(기본 만원)의 배수이며,
 * 합계는 원 금액을 step으로 내린 값과 같습니다(최대 step−1원 미반영).
 */
export function splitAnnualTargetToNiceAmounts(
  total: number,
  eventCount: number,
  step: number = PAYMENT_AMOUNT_STEP
): number[] {
  if (eventCount <= 0) return [];
  const t = Math.floor(Math.round(total) / step) * step;
  const units = Math.floor(t / step);
  if (units === 0) return Array(eventCount).fill(0);
  const baseUnits = Math.floor(units / eventCount);
  const rem = units % eventCount;
  const out: number[] = [];
  for (let i = 0; i < eventCount; i++) {
    const u = baseUnits + (i < rem ? 1 : 0);
    out.push(u * step);
  }
  return out;
}
