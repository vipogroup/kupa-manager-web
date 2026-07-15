import { nanoid } from "nanoid";
import {
  AppData,
  CustomerSnapshot,
  Delivery,
  DeliveryAddressSnapshot,
  DeliveryArea,
  DeliveryItemSnapshot,
  DeliveryStatus,
  Order,
  PaymentType,
  emptyData,
} from "./types";
import {
  emptyAddressSnapshot,
  emptyCustomerSnapshot,
  formatAddressText,
  normalizeAddressSnapshot,
  normalizeCustomerSnapshot,
  roundMoney,
} from "./orders";

export const DELIVERY_STATUSES: DeliveryStatus[] = ["pending", "ready", "cancelled"];
export const DELIVERY_AREAS: DeliveryArea[] = ["unassigned", "center", "north", "south"];

export const deliveryStatusLabel: Record<DeliveryStatus, string> = {
  pending: "ממתין",
  ready: "מוכן",
  cancelled: "מבוטל",
};

export const deliveryAreaLabelHe: Record<DeliveryArea, string> = {
  unassigned: "לא הוגדר",
  center: "מרכז",
  north: "צפון",
  south: "דרום",
};

export { formatAddressText };

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

function normalizeArea(v: unknown): DeliveryArea {
  return DELIVERY_AREAS.includes(v as DeliveryArea) ? (v as DeliveryArea) : "unassigned";
}

function normalizeStatus(v: unknown): DeliveryStatus {
  return DELIVERY_STATUSES.includes(v as DeliveryStatus) ? (v as DeliveryStatus) : "pending";
}

export function formatDeliveryNumber(n: number): string {
  return `DLV-WEB-${String(Math.max(0, Math.floor(n))).padStart(6, "0")}`;
}

export function parseDeliveryNumber(value: string): number {
  const m = String(value || "")
    .trim()
    .match(/^DLV-WEB-(\d+)$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function maxDeliveryNumber(deliveries: Delivery[]): number {
  let max = 0;
  for (const d of deliveries || []) max = Math.max(max, parseDeliveryNumber(d.deliveryNumber || ""));
  return max;
}

export function resolveDeliveryCounter(data: AppData): number {
  const fromCounter = data.counters?.nextDeliveryNumber ?? 0;
  return Math.max(fromCounter, maxDeliveryNumber(data.deliveries || []));
}

export function emptyItemSnapshot(): DeliveryItemSnapshot {
  return {
    productNumber: "",
    name: "",
    model: "",
    sku: "",
    barcode: "",
    unit: "יחידה",
    quantity: 0,
    unitPrice: 0,
    lineTotal: 0,
  };
}

export function normalizeItemSnapshot(raw: unknown): DeliveryItemSnapshot {
  const o = asRecord(raw) || {};
  const nested = asRecord(o.productSnapshot) || {};
  const qty = Math.max(0, finiteNum(o.quantity, 0));
  const unitPrice = Math.max(0, finiteNum(o.unitPrice, 0));
  const lineTotal = roundMoney(finiteNum(o.lineTotal, qty * unitPrice));
  return {
    productNumber: str(o.productNumber, str(nested.productNumber)),
    name: str(o.name, str(nested.name)),
    model: str(o.model, str(nested.model)),
    sku: str(o.sku, str(nested.sku)),
    barcode: str(o.barcode, str(nested.barcode)),
    unit: str(o.unit, str(nested.unit, "יחידה")) || "יחידה",
    quantity: qty,
    unitPrice,
    lineTotal,
  };
}

export function itemsSnapshotFromOrder(order: Order): DeliveryItemSnapshot[] {
  return (order.items || []).map((it) => ({
    productNumber: it.productSnapshot?.productNumber || "",
    name: it.productSnapshot?.name || "",
    model: it.productSnapshot?.model || "",
    sku: it.productSnapshot?.sku || "",
    barcode: it.productSnapshot?.barcode || "",
    unit: it.productSnapshot?.unit || "יחידה",
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    lineTotal: it.lineTotal,
  }));
}

export function formatFullDeliveryAddress(a: DeliveryAddressSnapshot | null | undefined): string {
  if (!a) return "כתובת לא הוגדרה";
  const streetLine = [str(a.street).trim(), str(a.houseNumber).trim()].filter(Boolean).join(" ");
  const parts = [
    streetLine,
    str(a.entrance).trim() ? `כניסה ${str(a.entrance).trim()}` : "",
    str(a.floor).trim() ? `קומה ${str(a.floor).trim()}` : "",
    str(a.apartment).trim() ? `דירה ${str(a.apartment).trim()}` : "",
    str(a.city).trim(),
    str(a.zipCode).trim(),
  ].filter(Boolean);
  if (parts.length === 0) return "כתובת לא הוגדרה";
  return parts.join(", ").replace(/\s+/g, " ").trim();
}

export function formatDeliveryItemLine(it: DeliveryItemSnapshot): string {
  const name = str(it.name).trim() || "מוצר";
  const model = str(it.model).trim();
  const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
  const unit = str(it.unit).trim() || "יחידה";
  const modelPart = model ? ` — דגם ${model}` : "";
  return `${name}${modelPart} × ${qty} ${unit}`;
}

export function formatProductsSummary(
  items: DeliveryItemSnapshot[],
  opts?: { maxLines?: number }
): { lines: string[]; moreCount: number; fullText: string } {
  const all = (items || []).map(formatDeliveryItemLine);
  const max = opts?.maxLines;
  if (max !== undefined && max >= 0 && all.length > max) {
    return {
      lines: all.slice(0, max),
      moreCount: all.length - max,
      fullText: all.join("\n"),
    };
  }
  return { lines: all, moreCount: 0, fullText: all.join("\n") };
}

export function normalizeDelivery(raw: unknown, index = 0): Delivery {
  const o = asRecord(raw) || {};
  const known = new Set([
    "id",
    "deliveryNumber",
    "orderId",
    "orderNumberSnapshot",
    "status",
    "scheduledDate",
    "deliveryAreaSnapshot",
    "customerSnapshot",
    "addressSnapshot",
    "itemsSnapshot",
    "itemsSubtotalSnapshot",
    "shippingFeeSnapshot",
    "orderTotalSnapshot",
    "paymentTypeSnapshot",
    "deliveryNotes",
    "cancellationReason",
    "createdAt",
    "updatedAt",
    "cancelledAt",
  ]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!known.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype") {
      extras[k] = v;
    }
  }
  const itemsRaw = Array.isArray(o.itemsSnapshot) ? o.itemsSnapshot : [];
  const itemsSnapshot = itemsRaw.map((it) => normalizeItemSnapshot(it));
  const scheduledRaw = str(o.scheduledDate).trim();
  const scheduledDate = /^\d{4}-\d{2}-\d{2}$/.test(scheduledRaw) ? scheduledRaw : "";
  const paymentType: PaymentType =
    o.paymentTypeSnapshot === "cashOnDelivery" ? "cashOnDelivery" : "cashOnDelivery";

  const itemsSubtotalFromLines = roundMoney(
    itemsSnapshot.reduce((a, it) => a + (Number.isFinite(it.lineTotal) ? it.lineTotal : 0), 0)
  );
  const hasItemsSubtotal = o.itemsSubtotalSnapshot !== undefined && o.itemsSubtotalSnapshot !== null;
  const itemsSubtotalSnapshot = hasItemsSubtotal
    ? roundMoney(Math.max(0, finiteNum(o.itemsSubtotalSnapshot, 0)))
    : itemsSubtotalFromLines;
  const hasShip = o.shippingFeeSnapshot !== undefined && o.shippingFeeSnapshot !== null;
  const shippingFeeSnapshot = hasShip
    ? roundMoney(Math.max(0, finiteNum(o.shippingFeeSnapshot, 0)))
    : 0;
  const hasTotal = o.orderTotalSnapshot !== undefined && o.orderTotalSnapshot !== null;
  const orderTotalSnapshot = hasTotal
    ? roundMoney(Math.max(0, finiteNum(o.orderTotalSnapshot, 0)))
    : roundMoney(itemsSubtotalSnapshot + shippingFeeSnapshot);

  const delivery: Delivery = {
    id: str(o.id) || `legacy-dlv-${index + 1}`,
    deliveryNumber: str(o.deliveryNumber) || formatDeliveryNumber(index + 1),
    orderId: str(o.orderId),
    orderNumberSnapshot: str(o.orderNumberSnapshot),
    status: normalizeStatus(o.status),
    scheduledDate,
    deliveryAreaSnapshot: normalizeArea(o.deliveryAreaSnapshot),
    customerSnapshot: normalizeCustomerSnapshot(o.customerSnapshot || emptyCustomerSnapshot()),
    addressSnapshot: normalizeAddressSnapshot(o.addressSnapshot || emptyAddressSnapshot()),
    itemsSnapshot,
    itemsSubtotalSnapshot,
    shippingFeeSnapshot,
    orderTotalSnapshot,
    paymentTypeSnapshot: paymentType,
    deliveryNotes: str(o.deliveryNotes),
    cancellationReason: str(o.cancellationReason),
    createdAt: str(o.createdAt, stamp()),
    updatedAt: str(o.updatedAt, stamp()),
    cancelledAt: str(o.cancelledAt),
  };
  return { ...extras, ...delivery } as Delivery;
}

export function normalizeDeliveriesInData(data: AppData): AppData {
  const deliveries = Array.isArray(data.deliveries)
    ? data.deliveries.map((d, i) => normalizeDelivery(d, i))
    : [];
  const nextDeliveryNumber = resolveDeliveryCounter({ ...data, deliveries });
  return {
    ...data,
    deliveries,
    counters: {
      nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
      nextInventoryMovementNumber: data.counters?.nextInventoryMovementNumber ?? 0,
      ...(data.counters || {}),
      nextDeliveryNumber,
    },
  };
}

export function findDeliveryForOrder(deliveries: Delivery[], orderId: string): Delivery | undefined {
  return (deliveries || []).find((d) => d.orderId === orderId);
}

export function hasAnyDeliveryForOrder(deliveries: Delivery[], orderId: string): boolean {
  return Boolean(findDeliveryForOrder(deliveries, orderId));
}

export function hasActiveDeliveryForOrder(deliveries: Delivery[], orderId: string): boolean {
  return (deliveries || []).some((d) => d.orderId === orderId && d.status !== "cancelled");
}

export type DeliveryCreateInput = {
  orderId: string;
  scheduledDate?: string;
  deliveryAreaSnapshot?: DeliveryArea;
  deliveryNotes?: string;
};

export type DeliveryUpdateInput = {
  scheduledDate?: string;
  deliveryAreaSnapshot?: DeliveryArea;
  deliveryNotes?: string;
  status?: DeliveryStatus;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

function normalizeScheduledDate(raw: string | undefined): { ok: true; value: string } | { ok: false; error: string } {
  const s = String(raw || "").trim();
  if (!s) return { ok: true, value: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: "תאריך משלוח אינו תקין" };
  return { ok: true, value: s };
}

export function validateDeliveryCreate(data: AppData, input: DeliveryCreateInput): ValidationResult {
  const order = (data.orders || []).find((o) => o.id === input.orderId);
  if (!order) return { ok: false, error: "יש לבחור הזמנה מאושרת" };
  if (order.status === "draft") return { ok: false, error: "ניתן ליצור משלוח רק מהזמנה מאושרת" };
  if (order.status === "cancelled") return { ok: false, error: "לא ניתן ליצור משלוח מהזמנה מבוטלת" };
  if (order.status !== "confirmed") return { ok: false, error: "ניתן ליצור משלוח רק מהזמנה מאושרת" };
  if (hasAnyDeliveryForOrder(data.deliveries || [], order.id)) {
    return { ok: false, error: "כבר קיים משלוח להזמנה הזאת." };
  }
  const date = normalizeScheduledDate(input.scheduledDate);
  if (!date.ok) return date;
  if (input.deliveryAreaSnapshot && !DELIVERY_AREAS.includes(input.deliveryAreaSnapshot)) {
    return { ok: false, error: "אזור משלוח אינו תקין" };
  }
  return { ok: true };
}

export type ApplyDeliveryResult =
  | { data: AppData; delivery: Delivery }
  | { error: string };

/** Pure: create delivery from confirmed order. Does not mutate stock/inventory/orders. */
export function allocateDelivery(data: AppData, input: DeliveryCreateInput): ApplyDeliveryResult {
  const v = validateDeliveryCreate(data, input);
  if (!v.ok) return { error: v.error };
  const order = (data.orders || []).find((o) => o.id === input.orderId)!;
  const date = normalizeScheduledDate(input.scheduledDate);
  if (!date.ok) return { error: date.error };

  const counter = resolveDeliveryCounter(data);
  const next = counter + 1;
  const now = stamp();
  const area = input.deliveryAreaSnapshot
    ? normalizeArea(input.deliveryAreaSnapshot)
    : normalizeArea(order.deliveryAreaSnapshot);

  const delivery: Delivery = {
    id: nanoid(),
    deliveryNumber: formatDeliveryNumber(next),
    orderId: order.id,
    orderNumberSnapshot: order.orderNumber || "",
    status: "pending",
    scheduledDate: date.value,
    deliveryAreaSnapshot: area,
    customerSnapshot: { ...order.customerSnapshot },
    addressSnapshot: { ...order.deliveryAddressSnapshot },
    itemsSnapshot: itemsSnapshotFromOrder(order),
    itemsSubtotalSnapshot: roundMoney(Math.max(0, order.itemsSubtotal ?? 0)),
    shippingFeeSnapshot: roundMoney(Math.max(0, order.shippingFee ?? 0)),
    orderTotalSnapshot: roundMoney(Math.max(0, order.totalAmount || 0)),
    paymentTypeSnapshot: "cashOnDelivery",
    deliveryNotes: String(input.deliveryNotes || "").trim(),
    cancellationReason: "",
    createdAt: now,
    updatedAt: now,
    cancelledAt: "",
  };

  return {
    delivery,
    data: {
      ...data,
      deliveries: [delivery, ...(data.deliveries || [])],
      counters: {
        nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
        nextInventoryMovementNumber: data.counters?.nextInventoryMovementNumber ?? 0,
        ...(data.counters || {}),
        nextDeliveryNumber: next,
      },
      updatedAt: now,
    },
  };
}

export function updateDeliveryInData(
  data: AppData,
  id: string,
  patch: DeliveryUpdateInput
): ApplyDeliveryResult {
  const existing = (data.deliveries || []).find((d) => d.id === id);
  if (!existing) return { error: "משלוח לא נמצא" };
  if (existing.status === "cancelled") return { error: "משלוח מבוטל אינו ניתן לעריכה" };

  const date = normalizeScheduledDate(
    patch.scheduledDate !== undefined ? patch.scheduledDate : existing.scheduledDate
  );
  if (!date.ok) return { error: date.error };

  let status = existing.status;
  if (patch.status !== undefined) {
    if (!DELIVERY_STATUSES.includes(patch.status)) return { error: "סטטוס אינו תקין" };
    if (patch.status === "cancelled") {
      return { error: "יש להשתמש בפעולת ביטול לביטול משלוח" };
    }
    status = patch.status;
  }

  if (patch.deliveryAreaSnapshot !== undefined && !DELIVERY_AREAS.includes(patch.deliveryAreaSnapshot)) {
    return { error: "אזור משלוח אינו תקין" };
  }

  const now = stamp();
  const delivery: Delivery = {
    ...existing,
    scheduledDate: date.value,
    deliveryAreaSnapshot:
      patch.deliveryAreaSnapshot !== undefined
        ? normalizeArea(patch.deliveryAreaSnapshot)
        : existing.deliveryAreaSnapshot,
    deliveryNotes:
      patch.deliveryNotes !== undefined ? String(patch.deliveryNotes).trim() : existing.deliveryNotes,
    status,
    deliveryNumber: existing.deliveryNumber,
    id: existing.id,
    orderId: existing.orderId,
    orderNumberSnapshot: existing.orderNumberSnapshot,
    customerSnapshot: existing.customerSnapshot,
    addressSnapshot: existing.addressSnapshot,
    itemsSnapshot: existing.itemsSnapshot,
    itemsSubtotalSnapshot: existing.itemsSubtotalSnapshot,
    shippingFeeSnapshot: existing.shippingFeeSnapshot,
    orderTotalSnapshot: existing.orderTotalSnapshot,
    paymentTypeSnapshot: "cashOnDelivery",
    createdAt: existing.createdAt,
    updatedAt: now,
    cancelledAt: existing.cancelledAt,
  };

  return {
    delivery,
    data: {
      ...data,
      deliveries: (data.deliveries || []).map((d) => (d.id === id ? delivery : d)),
      updatedAt: now,
    },
  };
}

export function cancelDeliveryInData(
  data: AppData,
  id: string,
  reason: string
): ApplyDeliveryResult {
  const existing = (data.deliveries || []).find((d) => d.id === id);
  if (!existing) return { error: "משלוח לא נמצא" };
  if (existing.status === "cancelled") return { error: "המשלוח כבר מבוטל" };
  const r = String(reason || "").trim();
  if (r.length < 3) return { error: "יש להזין סיבת ביטול (לפחות 3 תווים)" };
  const now = stamp();
  const delivery: Delivery = {
    ...existing,
    status: "cancelled",
    cancellationReason: r,
    cancelledAt: now,
    updatedAt: now,
  };
  return {
    delivery,
    data: {
      ...data,
      deliveries: (data.deliveries || []).map((d) => (d.id === id ? delivery : d)),
      updatedAt: now,
    },
  };
}

/** Explicit refresh of snapshots from current order — no auto refresh. */
export function refreshDeliveryFromOrder(
  data: AppData,
  id: string
): ApplyDeliveryResult {
  const existing = (data.deliveries || []).find((d) => d.id === id);
  if (!existing) return { error: "משלוח לא נמצא" };
  if (existing.status === "cancelled") return { error: "משלוח מבוטל אינו ניתן לרענון" };
  const order = (data.orders || []).find((o) => o.id === existing.orderId);
  if (!order) return { error: "ההזמנה המקורית לא נמצאה — נשארו פרטי ה-Snapshot" };

  const now = stamp();
  const delivery: Delivery = {
    ...existing,
    orderNumberSnapshot: order.orderNumber || existing.orderNumberSnapshot,
    customerSnapshot: { ...order.customerSnapshot },
    addressSnapshot: { ...order.deliveryAddressSnapshot },
    itemsSnapshot: itemsSnapshotFromOrder(order),
    itemsSubtotalSnapshot: roundMoney(Math.max(0, order.itemsSubtotal ?? 0)),
    shippingFeeSnapshot: roundMoney(Math.max(0, order.shippingFee ?? 0)),
    orderTotalSnapshot: roundMoney(Math.max(0, order.totalAmount || 0)),
    paymentTypeSnapshot: "cashOnDelivery",
    // keep delivery's own area/date/notes/status
    updatedAt: now,
  };
  return {
    delivery,
    data: {
      ...data,
      deliveries: (data.deliveries || []).map((d) => (d.id === id ? delivery : d)),
      updatedAt: now,
    },
  };
}

export type DeliveryFilterArea = "all" | DeliveryArea;
export type DeliveryFilterStatus = "all" | DeliveryStatus;
export type DeliveryFilterDate = "all" | "today" | "none" | "selected";

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function filterDeliveries(
  deliveries: Delivery[],
  opts: {
    query?: string;
    area?: DeliveryFilterArea;
    status?: DeliveryFilterStatus;
    dateMode?: DeliveryFilterDate;
    selectedDate?: string;
  }
): Delivery[] {
  const q = String(opts.query || "")
    .trim()
    .toLowerCase();
  const area = opts.area || "all";
  const status = opts.status || "all";
  const dateMode = opts.dateMode || "all";
  const selectedDate = String(opts.selectedDate || "").trim();
  const today = todayISODate();

  return (deliveries || []).filter((d) => {
    if (area !== "all" && d.deliveryAreaSnapshot !== area) return false;
    if (status !== "all" && d.status !== status) return false;
    if (dateMode === "today" && d.scheduledDate !== today) return false;
    if (dateMode === "none" && d.scheduledDate) return false;
    if (dateMode === "selected") {
      if (!selectedDate || d.scheduledDate !== selectedDate) return false;
    }
    if (!q) return true;
    const itemHay = (d.itemsSnapshot || [])
      .map((it) => [it.name, it.model, it.sku, it.productNumber].join(" "))
      .join(" ");
    const hay = [
      d.deliveryNumber,
      d.orderNumberSnapshot,
      d.customerSnapshot?.customerName,
      d.customerSnapshot?.businessName,
      d.customerSnapshot?.phone,
      d.customerSnapshot?.secondaryPhone,
      d.addressSnapshot?.city,
      itemHay,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function deliverySummary(deliveries: Delivery[]) {
  const list = deliveries || [];
  const active = list.filter((d) => d.status !== "cancelled");
  const byArea = (a: DeliveryArea) => active.filter((d) => d.deliveryAreaSnapshot === a).length;
  const pending = active.filter((d) => d.status === "pending").length;
  const ready = active.filter((d) => d.status === "ready").length;
  const totalAmount = roundMoney(
    active.reduce((acc, d) => acc + (Number.isFinite(d.orderTotalSnapshot) ? d.orderTotalSnapshot : 0), 0)
  );
  return {
    activeCount: active.length,
    center: byArea("center"),
    north: byArea("north"),
    south: byArea("south"),
    unassigned: byArea("unassigned"),
    pending,
    ready,
    totalAmount,
  };
}

export function formatScheduledDateDisplay(iso: string): string {
  if (!iso) return "לא נקבע";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(new Date(y, m - 1, d));
  } catch {
    return iso;
  }
}

export function customerDisplayName(c: CustomerSnapshot): string {
  return str(c.businessName).trim() || str(c.customerName).trim() || "לקוח";
}

/** Proof helper: products/inventory/orders stock unchanged across delivery ops. */
export function stockAndInventoryUnchanged(
  before: AppData,
  after: AppData
): boolean {
  if ((before.products || []).length !== (after.products || []).length) return false;
  for (let i = 0; i < (before.products || []).length; i++) {
    if (before.products[i].id !== after.products[i].id) return false;
    if (before.products[i].stockQuantity !== after.products[i].stockQuantity) return false;
  }
  if (JSON.stringify(before.inventoryMovements || []) !== JSON.stringify(after.inventoryMovements || [])) {
    return false;
  }
  return true;
}

export function blankDeliveriesWorkspace(): AppData {
  return emptyData();
}
