"use client";

import type { PaymentScheduleDemoInput } from "@/lib/validations/payment-schedule-demo";

export type StoredPaymentScheduleDemo = {
  id: string;
  savedAt: string;
  payload: PaymentScheduleDemoInput;
};

const STORAGE_KEY = "fm-towers:payment-schedule-demos:v1";

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

export function loadPaymentScheduleDemos(): StoredPaymentScheduleDemo[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is StoredPaymentScheduleDemo => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    return typeof e.id === "string" && typeof e.savedAt === "string" && e.payload != null;
  });
}

export function savePaymentScheduleDemo(payload: PaymentScheduleDemoInput): StoredPaymentScheduleDemo {
  const entry: StoredPaymentScheduleDemo = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ps-${Date.now()}`,
    savedAt: new Date().toISOString(),
    payload: { ...payload, rows: payload.rows.map((row) => ({ ...row })) },
  };
  const list = loadPaymentScheduleDemos();
  list.unshift(entry);
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 40)));
  return entry;
}

export function clearPaymentScheduleDemos() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
