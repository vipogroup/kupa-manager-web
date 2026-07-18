import type { AppData } from "./types";

export type CloudOrderPayment = {
  id: string;
  paymentNumber?: string;
  orderId: string;
  orderNumberSnapshot?: string;
  customerId?: string;
  customerNumberSnapshot?: string;
  customerNameSnapshot?: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string;
  payerName?: string;
  notes?: string;
  status: "recorded" | "voided";
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

function asRec(data: AppData): Record<string, unknown> {
  return data as unknown as Record<string, unknown>;
}

export function getOrderPayments(data: AppData): CloudOrderPayment[] {
  const raw = asRec(data).orderPayments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as CloudOrderPayment[];
}

export function setOrderPayments(data: AppData, payments: CloudOrderPayment[]): AppData {
  return { ...data, orderPayments: payments } as AppData;
}

function nowIso(): string {
  return new Date().toISOString();
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function createOrderPaymentInData(
  data: AppData,
  payload: Record<string, unknown>
): { data: AppData; payment: CloudOrderPayment } | { error: string } {
  const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";
  if (!orderId) return { error: "מזהה הזמנה חובה" };
  const amount = roundMoney(Number(payload.amount));
  if (!(amount > 0)) return { error: "סכום תשלום חייב להיות חיובי" };

  const orders = data.orders || [];
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { error: "הזמנה לא נמצאה" };
  if (order.status === "cancelled") return { error: "לא ניתן לרשום תשלום להזמנה מבוטלת" };

  const id =
    typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : `PAY-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const list = getOrderPayments(data);
  if (list.some((p) => p.id === id)) return { error: "מזהה תשלום כפול" };

  const now = nowIso();
  const payment: CloudOrderPayment = {
    ...payload,
    id,
    paymentNumber:
      typeof payload.paymentNumber === "string" && payload.paymentNumber.trim()
        ? payload.paymentNumber.trim()
        : id,
    orderId,
    orderNumberSnapshot: order.orderNumber || "",
    customerId: order.customerId || "",
    customerNameSnapshot: order.customerSnapshot?.customerName || "",
    paymentDate:
      typeof payload.paymentDate === "string" && payload.paymentDate.trim()
        ? payload.paymentDate.trim()
        : now.slice(0, 10),
    amount,
    paymentMethod:
      typeof payload.paymentMethod === "string" && payload.paymentMethod.trim()
        ? payload.paymentMethod.trim()
        : "cash",
    referenceNumber: typeof payload.referenceNumber === "string" ? payload.referenceNumber : "",
    payerName: typeof payload.payerName === "string" ? payload.payerName : "",
    notes: typeof payload.notes === "string" ? payload.notes : "",
    status: "recorded",
    createdAt: now,
    updatedAt: now,
  };

  return { data: setOrderPayments(data, [...list, payment]), payment };
}

export function voidOrderPaymentInData(
  data: AppData,
  payload: Record<string, unknown>
): { data: AppData; payment: CloudOrderPayment } | { error: string } {
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return { error: "מזהה תשלום חובה" };
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!reason) return { error: "סיבת ביטול חובה" };

  const list = getOrderPayments(data);
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return { error: "תשלום לא נמצא" };
  const current = list[idx];
  if (current.status === "voided") return { error: "התשלום כבר מבוטל" };

  const now = nowIso();
  const payment: CloudOrderPayment = {
    ...current,
    status: "voided",
    voidedAt: now,
    voidReason: reason,
    updatedAt: now,
  };
  const next = [...list];
  next[idx] = payment;
  return { data: setOrderPayments(data, next), payment };
}
