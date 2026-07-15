import { nanoid } from "nanoid";
import {
  AppData,
  Customer,
  CustomerSnapshot,
  DeliveryAddressSnapshot,
  DeliveryArea,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductSnapshot,
  emptyData,
} from "./types";

const DELIVERY_AREAS: DeliveryArea[] = ["unassigned", "center", "north", "south"];

export const ORDER_STATUSES: OrderStatus[] = ["draft", "confirmed", "cancelled"];

export const orderStatusLabel: Record<OrderStatus, string> = {
  draft: "טיוטה",
  confirmed: "מאושרת",
  cancelled: "מבוטלת",
};

export const paymentTypeLabel = {
  cashOnDelivery: "מזומן לשליח",
} as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function stamp(): string {
  return new Date().toISOString();
}

function finiteNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Round money to 2 decimals (avoids float drift in totals). */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcLineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice);
}

export function calcOrderTotal(items: OrderItem[]): number {
  return roundMoney(items.reduce((acc, it) => acc + (Number.isFinite(it.lineTotal) ? it.lineTotal : 0), 0));
}

export function formatOrderNumber(n: number): string {
  return `ORD-${String(Math.max(0, Math.floor(n))).padStart(6, "0")}`;
}

export function parseOrderNumber(value: string): number {
  const m = String(value || "")
    .trim()
    .match(/^ORD-(\d+)$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function maxOrderNumber(orders: Order[]): number {
  let max = 0;
  for (const o of orders || []) max = Math.max(max, parseOrderNumber(o.orderNumber || ""));
  return max;
}

/** Last allocated order number from counters + existing orders. */
export function resolveOrderCounter(data: AppData): number {
  const fromCounter = data.counters?.nextOrderNumber ?? 0;
  return Math.max(fromCounter, maxOrderNumber(data.orders || []));
}

export function emptyCustomerSnapshot(): CustomerSnapshot {
  return {
    customerNumber: "",
    customerName: "",
    businessName: "",
    phone: "",
    secondaryPhone: "",
    email: "",
    street: "",
    houseNumber: "",
    entrance: "",
    floor: "",
    apartment: "",
    city: "",
    zipCode: "",
    deliveryArea: "unassigned",
    deliveryNotes: "",
  };
}

export function emptyAddressSnapshot(): DeliveryAddressSnapshot {
  return {
    street: "",
    houseNumber: "",
    entrance: "",
    floor: "",
    apartment: "",
    city: "",
    zipCode: "",
    deliveryNotes: "",
  };
}

export function emptyProductSnapshot(): ProductSnapshot {
  return {
    productNumber: "",
    name: "",
    model: "",
    sku: "",
    barcode: "",
    unit: "יחידה",
  };
}

export function snapshotFromCustomer(c: Customer): CustomerSnapshot {
  return {
    customerNumber: c.customerNumber || "",
    customerName: c.name || "",
    businessName: c.businessName || "",
    phone: c.phone || "",
    secondaryPhone: c.secondaryPhone || "",
    email: c.email || "",
    street: c.street || "",
    houseNumber: c.houseNumber || "",
    entrance: c.entrance || "",
    floor: c.floor || "",
    apartment: c.apartment || "",
    city: c.city || "",
    zipCode: c.zipCode || "",
    deliveryArea: DELIVERY_AREAS.includes(c.deliveryArea) ? c.deliveryArea : "unassigned",
    deliveryNotes: c.deliveryNotes || "",
  };
}

export function addressFromCustomer(c: Customer): DeliveryAddressSnapshot {
  return {
    street: c.street || "",
    houseNumber: c.houseNumber || "",
    entrance: c.entrance || "",
    floor: c.floor || "",
    apartment: c.apartment || "",
    city: c.city || "",
    zipCode: c.zipCode || "",
    deliveryNotes: c.deliveryNotes || "",
  };
}

export function snapshotFromProduct(p: Product): ProductSnapshot {
  return {
    productNumber: p.productNumber || "",
    name: p.name || "",
    model: p.model || "",
    sku: p.sku || "",
    barcode: p.barcode || "",
    unit: p.unit || "יחידה",
  };
}

export function formatAddressText(a: DeliveryAddressSnapshot): string {
  const parts = [
    [a.street, a.houseNumber].filter(Boolean).join(" "),
    a.entrance ? `כניסה ${a.entrance}` : "",
    a.floor ? `קומה ${a.floor}` : "",
    a.apartment ? `דירה ${a.apartment}` : "",
    a.city,
    a.zipCode,
  ].filter(Boolean);
  return parts.join(", ") || "—";
}

function normalizeArea(v: unknown): DeliveryArea {
  return DELIVERY_AREAS.includes(v as DeliveryArea) ? (v as DeliveryArea) : "unassigned";
}

function normalizeStatus(v: unknown): OrderStatus {
  return ORDER_STATUSES.includes(v as OrderStatus) ? (v as OrderStatus) : "draft";
}

export function normalizeCustomerSnapshot(raw: unknown): CustomerSnapshot {
  const o = asRecord(raw) || {};
  const base = emptyCustomerSnapshot();
  return {
    ...base,
    customerNumber: str(o.customerNumber),
    customerName: str(o.customerName, str(o.name)),
    businessName: str(o.businessName),
    phone: str(o.phone),
    secondaryPhone: str(o.secondaryPhone),
    email: str(o.email),
    street: str(o.street),
    houseNumber: str(o.houseNumber),
    entrance: str(o.entrance),
    floor: str(o.floor),
    apartment: str(o.apartment),
    city: str(o.city),
    zipCode: str(o.zipCode),
    deliveryArea: normalizeArea(o.deliveryArea),
    deliveryNotes: str(o.deliveryNotes),
  };
}

export function normalizeAddressSnapshot(raw: unknown): DeliveryAddressSnapshot {
  const o = asRecord(raw) || {};
  return {
    street: str(o.street),
    houseNumber: str(o.houseNumber),
    entrance: str(o.entrance),
    floor: str(o.floor),
    apartment: str(o.apartment),
    city: str(o.city),
    zipCode: str(o.zipCode),
    deliveryNotes: str(o.deliveryNotes),
  };
}

export function normalizeProductSnapshot(raw: unknown): ProductSnapshot {
  const o = asRecord(raw) || {};
  return {
    productNumber: str(o.productNumber),
    name: str(o.name),
    model: str(o.model),
    sku: str(o.sku),
    barcode: str(o.barcode),
    unit: str(o.unit, "יחידה") || "יחידה",
  };
}

export function normalizeOrderItem(raw: unknown, index = 0): OrderItem {
  const o = asRecord(raw) || {};
  const known = new Set([
    "id",
    "productId",
    "productSnapshot",
    "quantity",
    "unitPrice",
    "lineTotal",
    "notes",
  ]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!known.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype") extras[k] = v;
  }
  const quantity = Math.max(0, finiteNum(o.quantity, 0));
  const unitPrice = Math.max(0, finiteNum(o.unitPrice, 0));
  const lineTotal = calcLineTotal(quantity, unitPrice);
  const item: OrderItem = {
    id: str(o.id) || `legacy-item-${index + 1}`,
    productId: str(o.productId),
    productSnapshot: normalizeProductSnapshot(o.productSnapshot),
    quantity,
    unitPrice,
    lineTotal,
    notes: str(o.notes),
  };
  return { ...extras, ...item } as OrderItem;
}

export function normalizeOrder(raw: unknown, index = 0): Order {
  const o = asRecord(raw) || {};
  const known = new Set([
    "id",
    "orderNumber",
    "status",
    "customerId",
    "customerSnapshot",
    "items",
    "totalAmount",
    "paymentType",
    "deliveryAreaSnapshot",
    "deliveryAddressSnapshot",
    "orderNotes",
    "cancellationReason",
    "createdAt",
    "updatedAt",
    "confirmedAt",
    "cancelledAt",
  ]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!known.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype") extras[k] = v;
  }
  const items = Array.isArray(o.items) ? o.items.map((it, i) => normalizeOrderItem(it, i)) : [];
  const totalAmount = calcOrderTotal(items);
  const now = stamp();
  const order: Order = {
    id: str(o.id) || `legacy-ord-${index + 1}`,
    orderNumber: str(o.orderNumber) || formatOrderNumber(index + 1),
    status: normalizeStatus(o.status),
    customerId: str(o.customerId),
    customerSnapshot: normalizeCustomerSnapshot(o.customerSnapshot),
    items,
    totalAmount,
    paymentType: "cashOnDelivery",
    deliveryAreaSnapshot: normalizeArea(o.deliveryAreaSnapshot),
    deliveryAddressSnapshot: normalizeAddressSnapshot(o.deliveryAddressSnapshot),
    orderNotes: str(o.orderNotes),
    cancellationReason: str(o.cancellationReason),
    createdAt: str(o.createdAt, now),
    updatedAt: str(o.updatedAt, now),
    confirmedAt: str(o.confirmedAt),
    cancelledAt: str(o.cancelledAt),
  };
  return { ...extras, ...order } as Order;
}

export function normalizeOrdersInData(data: AppData): AppData {
  const orders = Array.isArray(data.orders) ? data.orders.map((o, i) => normalizeOrder(o, i)) : [];
  const nextOrderNumber = resolveOrderCounter({ ...data, orders });
  return {
    ...data,
    orders,
    counters: {
      nextInventoryMovementNumber: data.counters?.nextInventoryMovementNumber ?? 0,
      ...(data.counters || {}),
      nextOrderNumber,
    },
  };
}

export type OrderItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
};

export type OrderDraftInput = {
  customerId: string;
  customerSnapshot: CustomerSnapshot;
  deliveryAreaSnapshot: DeliveryArea;
  deliveryAddressSnapshot: DeliveryAddressSnapshot;
  items: OrderItem[];
  orderNotes?: string;
  paymentType?: "cashOnDelivery";
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateOrderDraft(input: OrderDraftInput): ValidationResult {
  if (!input.customerId && !input.customerSnapshot.customerName && !input.customerSnapshot.businessName) {
    return { ok: false, error: "יש לבחור לקוח" };
  }
  if (!input.customerId) return { ok: false, error: "יש לבחור לקוח" };
  if (!input.items || input.items.length === 0) return { ok: false, error: "יש להוסיף לפחות מוצר אחד" };
  for (const it of input.items) {
    if (!(it.quantity > 0) || !Number.isFinite(it.quantity)) {
      return { ok: false, error: "כמות חייבת להיות גדולה מ-0" };
    }
    if (!(it.unitPrice >= 0) || !Number.isFinite(it.unitPrice)) {
      return { ok: false, error: "מחיר יחידה אינו תקין" };
    }
    if (!Number.isFinite(it.lineTotal) || Number.isNaN(it.lineTotal)) {
      return { ok: false, error: "סכום שורה אינו תקין" };
    }
  }
  const total = calcOrderTotal(input.items);
  if (!Number.isFinite(total) || Number.isNaN(total)) return { ok: false, error: "סכום הזמנה אינו תקין" };
  return { ok: true };
}

export function buildOrderItemFromProduct(product: Product, quantity: number, unitPrice?: number): OrderItem {
  const q = quantity > 0 && Number.isFinite(quantity) ? quantity : 1;
  const price = unitPrice !== undefined ? unitPrice : Math.max(0, product.salePrice || 0);
  const safePrice = Number.isFinite(price) && price >= 0 ? price : 0;
  return {
    id: nanoid(),
    productId: product.id,
    productSnapshot: snapshotFromProduct(product),
    quantity: q,
    unitPrice: safePrice,
    lineTotal: calcLineTotal(q, safePrice),
    notes: "",
  };
}

export function allocateOrder(
  data: AppData,
  input: OrderDraftInput
): { data: AppData; order: Order } | { error: string } {
  const v = validateOrderDraft(input);
  if (!v.ok) return { error: v.error };
  const items = input.items.map((it) => ({
    ...it,
    lineTotal: calcLineTotal(it.quantity, it.unitPrice),
  }));
  const last = resolveOrderCounter(data);
  const next = last + 1;
  const now = stamp();
  const order = normalizeOrder({
    id: nanoid(),
    orderNumber: formatOrderNumber(next),
    status: "draft",
    customerId: input.customerId,
    customerSnapshot: input.customerSnapshot,
    items,
    totalAmount: calcOrderTotal(items),
    paymentType: "cashOnDelivery",
    deliveryAreaSnapshot: input.deliveryAreaSnapshot,
    deliveryAddressSnapshot: input.deliveryAddressSnapshot,
    orderNotes: input.orderNotes || "",
    cancellationReason: "",
    createdAt: now,
    updatedAt: now,
    confirmedAt: "",
    cancelledAt: "",
  });
  return {
    order,
    data: {
      ...data,
      orders: [order, ...(data.orders || [])],
      counters: {
        nextInventoryMovementNumber: data.counters?.nextInventoryMovementNumber ?? 0,
        ...(data.counters || {}),
        nextOrderNumber: next,
      },
      updatedAt: now,
    },
  };
}

export function updateOrderInData(
  data: AppData,
  id: string,
  patch: Partial<OrderDraftInput> & { status?: OrderStatus }
): { data: AppData; order: Order } | { error: string } {
  const existing = (data.orders || []).find((o) => o.id === id);
  if (!existing) return { error: "הזמנה לא נמצאה" };
  if (existing.status === "cancelled") return { error: "לא ניתן לערוך הזמנה מבוטלת" };

  const draft: OrderDraftInput = {
    customerId: patch.customerId ?? existing.customerId,
    customerSnapshot: patch.customerSnapshot ?? existing.customerSnapshot,
    deliveryAreaSnapshot: patch.deliveryAreaSnapshot ?? existing.deliveryAreaSnapshot,
    deliveryAddressSnapshot: patch.deliveryAddressSnapshot ?? existing.deliveryAddressSnapshot,
    items: patch.items ?? existing.items,
    orderNotes: patch.orderNotes ?? existing.orderNotes,
  };
  const v = validateOrderDraft(draft);
  if (!v.ok) return { error: v.error };

  const items = draft.items.map((it) => ({
    ...it,
    lineTotal: calcLineTotal(it.quantity, it.unitPrice),
  }));
  const now = stamp();
  const order = normalizeOrder({
    ...existing,
    customerId: draft.customerId,
    customerSnapshot: draft.customerSnapshot,
    deliveryAreaSnapshot: draft.deliveryAreaSnapshot,
    deliveryAddressSnapshot: draft.deliveryAddressSnapshot,
    items,
    totalAmount: calcOrderTotal(items),
    orderNotes: draft.orderNotes || "",
    status: existing.status,
    orderNumber: existing.orderNumber,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
  });
  return {
    order,
    data: {
      ...data,
      orders: data.orders.map((o) => (o.id === id ? order : o)),
      updatedAt: now,
    },
  };
}

export function confirmOrderInData(
  data: AppData,
  id: string
): { data: AppData; order: Order } | { error: string } {
  const existing = (data.orders || []).find((o) => o.id === id);
  if (!existing) return { error: "הזמנה לא נמצאה" };
  if (existing.status === "cancelled") return { error: "לא ניתן לאשר הזמנה מבוטלת" };
  if (existing.status === "confirmed") return { data, order: existing };
  const v = validateOrderDraft({
    customerId: existing.customerId,
    customerSnapshot: existing.customerSnapshot,
    deliveryAreaSnapshot: existing.deliveryAreaSnapshot,
    deliveryAddressSnapshot: existing.deliveryAddressSnapshot,
    items: existing.items,
    orderNotes: existing.orderNotes,
  });
  if (!v.ok) return { error: v.error };
  const now = stamp();
  const order = { ...existing, status: "confirmed" as const, confirmedAt: now, updatedAt: now };
  return {
    order,
    data: {
      ...data,
      orders: data.orders.map((o) => (o.id === id ? order : o)),
      updatedAt: now,
    },
  };
}

export function cancelOrderInData(
  data: AppData,
  id: string,
  reason: string
): { data: AppData; order: Order } | { error: string } {
  const existing = (data.orders || []).find((o) => o.id === id);
  if (!existing) return { error: "הזמנה לא נמצאה" };
  if (existing.status === "cancelled") return { error: "ההזמנה כבר מבוטלת" };
  const r = String(reason || "").trim();
  if (r.length < 3) return { error: "יש להזין סיבת ביטול (לפחות 3 תווים)" };
  const now = stamp();
  const order = {
    ...existing,
    status: "cancelled" as const,
    cancellationReason: r,
    cancelledAt: now,
    updatedAt: now,
  };
  return {
    order,
    data: {
      ...data,
      orders: data.orders.map((o) => (o.id === id ? order : o)),
      updatedAt: now,
    },
  };
}

/** Prepare a draft copy (no counter advance until allocateOrder/save). */
export function buildCopiedOrderDraft(source: Order): OrderDraftInput {
  return {
    customerId: source.customerId,
    customerSnapshot: { ...source.customerSnapshot },
    deliveryAreaSnapshot: source.deliveryAreaSnapshot,
    deliveryAddressSnapshot: { ...source.deliveryAddressSnapshot },
    items: source.items.map((it) => ({
      ...it,
      id: nanoid(),
      productSnapshot: { ...it.productSnapshot },
      lineTotal: calcLineTotal(it.quantity, it.unitPrice),
    })),
    orderNotes: source.orderNotes || "",
    paymentType: "cashOnDelivery",
  };
}

export function findDuplicateProductLine(items: OrderItem[], productId: string): OrderItem | undefined {
  return items.find((it) => it.productId === productId);
}

export function stockUnchangedProof(before: Product[], after: Product[]): boolean {
  if (before.length !== after.length) return false;
  for (let i = 0; i < before.length; i++) {
    if (before[i].id !== after[i].id) return false;
    if (before[i].stockQuantity !== after[i].stockQuantity) return false;
  }
  return true;
}

export function blankOrdersWorkspace(): AppData {
  return emptyData();
}
