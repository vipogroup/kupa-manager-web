import { nanoid } from "nanoid";
import type { AppData, Customer, DeliveryArea, OrderItem, Product } from "./types";
import { allocateCustomer, emptyCustomerDraft, normalizePhoneDigits } from "./entities";
import {
  addressFromCustomer,
  allocateOrder,
  buildOrderItemFromProduct,
  confirmOrderInData,
  snapshotFromCustomer,
  type OrderDraftInput,
} from "./orders";
import { allocateDelivery } from "./deliveries";

export const COR_STATUSES = ["New", "UnderReview", "Approved", "Rejected", "Cancelled"] as const;
export type CorStatus = (typeof COR_STATUSES)[number];

export const REQUESTED_PAYMENT_METHODS = [
  "cashOnDelivery",
  "bankTransfer",
  "bit",
  "other",
] as const;
export type RequestedPaymentMethod = (typeof REQUESTED_PAYMENT_METHODS)[number];

export type CorRequestedItem = {
  productId: string;
  productName: string;
  model: string;
  size: string;
  unitPriceSnapshot: number;
  quantity: number;
  lineTotalSnapshot: number;
  imageSnapshot: string;
  notes: string;
  [key: string]: unknown;
};

export type CustomerOrderRequest = {
  id: string;
  requestNumber: string;
  status: CorStatus;
  source: string;
  customerInput: {
    fullName: string;
    phone: string;
    secondaryPhone: string;
    email: string;
  };
  addressInput: {
    city: string;
    street: string;
    houseNumber: string;
    entrance: string;
    floor: string;
    apartment: string;
    elevator: "yes" | "no" | "unknown";
    accessNotes: string;
  };
  requestedItems: CorRequestedItem[];
  itemsSubtotalSnapshot: number;
  totalSnapshot: number;
  requestedDeliveryDate: string;
  requestedPaymentMethod: RequestedPaymentMethod;
  cashCollectionRequested: number;
  customerNotes: string;
  consentAccepted: boolean;
  consentAcceptedAt: string;
  submittedAt: string;
  reviewedAt: string;
  reviewedBy: string;
  rejectedAt: string;
  rejectedBy: string;
  rejectionReason: string;
  approvedAt: string;
  approvedBy: string;
  createdCustomerId: string;
  createdOrderId: string;
  createdDeliveryId: string;
  sourceIpHash: string;
  userAgentSummary: string;
  publicFormVersion: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

function asRec(data: AppData): Record<string, unknown> {
  return data as unknown as Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function str(v: unknown, max = 500): string {
  return String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, max);
}

export function getCustomerOrderRequests(data: AppData): CustomerOrderRequest[] {
  const raw = asRec(data).customerOrderRequests;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as CustomerOrderRequest[];
}

export function setCustomerOrderRequests(data: AppData, list: CustomerOrderRequest[]): AppData {
  return { ...data, customerOrderRequests: list } as AppData;
}

export function formatCorNumber(n: number): string {
  return `COR-${String(Math.max(0, Math.floor(n))).padStart(6, "0")}`;
}

function nextCorCounter(data: AppData): number {
  const c = data.counters as Record<string, number> | undefined;
  const fromCounter = typeof c?.nextCustomerOrderRequestNumber === "number" ? c.nextCustomerOrderRequestNumber : 0;
  let max = fromCounter;
  for (const r of getCustomerOrderRequests(data)) {
    const m = String(r.requestNumber || "").match(/^COR-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return max;
}

export function sanitizePublicItemNotes(v: unknown): string {
  return str(v, 300);
}

export function buildPublicCatalog(products: Product[]): Array<{
  id: string;
  name: string;
  model: string;
  unit: string;
  salePrice: number;
}> {
  return (products || [])
    .filter((p) => p && p.active !== false && Boolean((p as Product & { visibleOnCustomerOrderForm?: boolean }).visibleOnCustomerOrderForm))
    .map((p) => ({
      id: p.id,
      name: p.name,
      model: p.model || "",
      unit: p.unit || "יחידה",
      salePrice: roundMoney(p.salePrice || 0),
    }));
}

export type PublicSubmitInput = {
  fullName: string;
  phone: string;
  secondaryPhone?: string;
  email?: string;
  city: string;
  street: string;
  houseNumber: string;
  entrance?: string;
  floor?: string;
  apartment?: string;
  elevator?: string;
  accessNotes?: string;
  items: Array<{ productId: string; quantity: number; notes?: string }>;
  requestedDeliveryDate?: string;
  requestedPaymentMethod?: string;
  cashCollectionRequested?: number;
  customerNotes?: string;
  consentAccepted: boolean;
  honeypot?: string;
  idempotencyKey: string;
};

export function validateAndCreateOrderRequest(
  data: AppData,
  input: PublicSubmitInput,
  meta: { sourceIpHash: string; userAgentSummary: string; publicFormVersion: string }
):
  | { ok: true; data: AppData; request: CustomerOrderRequest; duplicate: boolean }
  | { ok: false; error: string; code?: string } {
  if (str(input.honeypot, 80)) {
    return { ok: false, error: "בקשה נדחתה", code: "HONEYPOT" };
  }
  if (!input.consentAccepted) {
    return { ok: false, error: "יש לאשר את תנאי השליחה", code: "CONSENT" };
  }
  const fullName = str(input.fullName, 120);
  const phoneRaw = str(input.phone, 40);
  const phoneDigits = normalizePhoneDigits(phoneRaw);
  if (!fullName) return { ok: false, error: "שם מלא חובה" };
  if (phoneDigits.length < 9 || phoneDigits.length > 15) {
    return { ok: false, error: "טלפון אינו תקין" };
  }
  const city = str(input.city, 80);
  const street = str(input.street, 120);
  const houseNumber = str(input.houseNumber, 20);
  if (!city || !street || !houseNumber) {
    return { ok: false, error: "כתובת משלוח חובה (יישוב, רחוב, מספר בית)" };
  }
  const itemsIn = Array.isArray(input.items) ? input.items : [];
  if (itemsIn.length < 1 || itemsIn.length > 30) {
    return { ok: false, error: "יש לבחור בין פריט אחד ל־30 פריטים" };
  }

  const idem = str(input.idempotencyKey, 80);
  if (!idem || idem.length < 8) {
    return { ok: false, error: "מפתח שליחה חסר", code: "IDEMPOTENCY" };
  }
  const existing = getCustomerOrderRequests(data);
  const prior = existing.find((r) => r.idempotencyKey === idem);
  if (prior) {
    return { ok: true, data, request: prior, duplicate: true };
  }

  const catalog = new Map(
    (data.products || [])
      .filter((p) => p.active !== false && Boolean((p as Product & { visibleOnCustomerOrderForm?: boolean }).visibleOnCustomerOrderForm))
      .map((p) => [p.id, p])
  );

  const requestedItems: CorRequestedItem[] = [];
  for (const row of itemsIn) {
    const productId = str(row.productId, 80);
    const qty = Math.floor(Number(row.quantity));
    if (!productId || !catalog.has(productId)) {
      return { ok: false, error: "מוצר אינו זמין להזמנה", code: "PRODUCT" };
    }
    if (!Number.isFinite(qty) || qty < 1 || qty > 999) {
      return { ok: false, error: "כמות אינה תקינה" };
    }
    const p = catalog.get(productId)!;
    const unitPrice = roundMoney(p.salePrice || 0);
    requestedItems.push({
      productId: p.id,
      productName: p.name,
      model: p.model || "",
      size: "",
      unitPriceSnapshot: unitPrice,
      quantity: qty,
      lineTotalSnapshot: roundMoney(unitPrice * qty),
      imageSnapshot: "",
      notes: sanitizePublicItemNotes(row.notes),
    });
  }

  const itemsSubtotalSnapshot = roundMoney(
    requestedItems.reduce((s, i) => s + i.lineTotalSnapshot, 0)
  );
  let pay = String(input.requestedPaymentMethod || "cashOnDelivery");
  if (!(REQUESTED_PAYMENT_METHODS as readonly string[]).includes(pay)) {
    pay = "cashOnDelivery";
  }
  let cash = roundMoney(Number(input.cashCollectionRequested));
  if (!(cash >= 0 && cash <= 1000000)) cash = itemsSubtotalSnapshot;
  if (pay === "cashOnDelivery" && cash <= 0) cash = itemsSubtotalSnapshot;

  const elevRaw = str(input.elevator, 20);
  const elevator: "yes" | "no" | "unknown" =
    elevRaw === "yes" || elevRaw === "no" ? elevRaw : "unknown";

  const next = nextCorCounter(data) + 1;
  const now = nowIso();
  const request: CustomerOrderRequest = {
    id: `cor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    requestNumber: formatCorNumber(next),
    status: "New",
    source: "publicForm",
    customerInput: {
      fullName,
      phone: phoneRaw,
      secondaryPhone: str(input.secondaryPhone, 40),
      email: str(input.email, 120),
    },
    addressInput: {
      city,
      street,
      houseNumber,
      entrance: str(input.entrance, 40),
      floor: str(input.floor, 20),
      apartment: str(input.apartment, 20),
      elevator,
      accessNotes: str(input.accessNotes, 400),
    },
    requestedItems,
    itemsSubtotalSnapshot,
    totalSnapshot: itemsSubtotalSnapshot,
    requestedDeliveryDate: str(input.requestedDeliveryDate, 32),
    requestedPaymentMethod: pay as RequestedPaymentMethod,
    cashCollectionRequested: cash,
    customerNotes: str(input.customerNotes, 1000),
    consentAccepted: true,
    consentAcceptedAt: now,
    submittedAt: now,
    reviewedAt: "",
    reviewedBy: "",
    rejectedAt: "",
    rejectedBy: "",
    rejectionReason: "",
    approvedAt: "",
    approvedBy: "",
    createdCustomerId: "",
    createdOrderId: "",
    createdDeliveryId: "",
    sourceIpHash: str(meta.sourceIpHash, 128),
    userAgentSummary: str(meta.userAgentSummary, 160),
    publicFormVersion: str(meta.publicFormVersion, 40) || "1",
    idempotencyKey: idem,
    createdAt: now,
    updatedAt: now,
  };

  const counters = {
    ...(data.counters || {
      nextOrderNumber: 0,
      nextInventoryMovementNumber: 0,
      nextDeliveryNumber: 0,
      nextDriverNumber: 0,
      nextVehicleNumber: 0,
      nextDeliveryRouteNumber: 0,
      nextRouteStopNumber: 0,
    }),
    nextCustomerOrderRequestNumber: next,
  };

  const nextData = setCustomerOrderRequests(
    { ...data, counters, updatedAt: now } as AppData,
    [request, ...existing]
  );
  return { ok: true, data: nextData, request, duplicate: false };
}

export function findCustomerMatches(data: AppData, phone: string, email?: string): Customer[] {
  const digits = normalizePhoneDigits(phone);
  const em = str(email, 120).toLowerCase();
  const byPhone = (data.customers || []).filter(
    (c) => c.active !== false && normalizePhoneDigits(c.phone || "") === digits && digits.length >= 9
  );
  if (byPhone.length > 0) return byPhone;
  if (em) {
    return (data.customers || []).filter(
      (c) => c.active !== false && String(c.email || "").trim().toLowerCase() === em
    );
  }
  return [];
}

export function startReviewCor(
  data: AppData,
  id: string,
  reviewer: string
): { data: AppData; request: CustomerOrderRequest } | { error: string } {
  const list = getCustomerOrderRequests(data);
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return { error: "בקשה לא נמצאה" };
  const cur = list[idx];
  if (cur.status === "Approved" || cur.status === "Rejected" || cur.status === "Cancelled") {
    return { error: "לא ניתן לפתוח לסקירה בקשה במצב זה" };
  }
  const now = nowIso();
  const request: CustomerOrderRequest = {
    ...cur,
    status: "UnderReview",
    reviewedAt: now,
    reviewedBy: str(reviewer, 80),
    updatedAt: now,
  };
  const next = [...list];
  next[idx] = request;
  return { data: setCustomerOrderRequests({ ...data, updatedAt: now }, next), request };
}

export function rejectCor(
  data: AppData,
  id: string,
  reason: string,
  reviewer: string
): { data: AppData; request: CustomerOrderRequest } | { error: string } {
  const rsn = str(reason, 500);
  if (rsn.length < 3) return { error: "סיבת דחייה חובה" };
  const list = getCustomerOrderRequests(data);
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return { error: "בקשה לא נמצאה" };
  const cur = list[idx];
  if (cur.status === "Approved") return { error: "בקשה מאושרת אינה ניתנת לדחייה" };
  if (cur.status === "Rejected") return { error: "הבקשה כבר נדחתה" };
  const now = nowIso();
  const request: CustomerOrderRequest = {
    ...cur,
    status: "Rejected",
    rejectedAt: now,
    rejectedBy: str(reviewer, 80),
    rejectionReason: rsn,
    updatedAt: now,
  };
  const next = [...list];
  next[idx] = request;
  return { data: setCustomerOrderRequests({ ...data, updatedAt: now }, next), request };
}

export type ApproveCorInput = {
  id: string;
  reviewer: string;
  /** Explicit customer id when multiple matches */
  selectedCustomerId?: string;
  /** Force create new even if match exists */
  forceNewCustomer?: boolean;
  shippingFee?: number;
  createDelivery?: boolean;
  scheduledDate?: string;
};

/**
 * Atomic approval: customer + order(+confirm) + optional delivery + COR status in one AppData mutation.
 */
export function approveCorAtomic(
  data: AppData,
  input: ApproveCorInput
): { data: AppData; request: CustomerOrderRequest } | { error: string } {
  const list = getCustomerOrderRequests(data);
  const idx = list.findIndex((r) => r.id === input.id);
  if (idx < 0) return { error: "בקשה לא נמצאה" };
  const cur = list[idx];
  if (cur.status === "Approved") {
    // Idempotent: already approved
    return { data, request: cur };
  }
  if (cur.status === "Rejected" || cur.status === "Cancelled") {
    return { error: "לא ניתן לאשר בקשה שנדחתה או בוטלה" };
  }
  if (!cur.requestedItems?.length) return { error: "אין פריטים בבקשה" };

  let working: AppData = { ...data };
  let customerId = "";

  const matches = findCustomerMatches(
    working,
    cur.customerInput.phone,
    cur.customerInput.email
  );
  const newCustomerInput = {
    ...emptyCustomerDraft(),
    name: cur.customerInput.fullName,
    customerType: "private" as const,
    phone: cur.customerInput.phone,
    secondaryPhone: cur.customerInput.secondaryPhone || "",
    email: cur.customerInput.email || "",
    street: cur.addressInput.street,
    houseNumber: cur.addressInput.houseNumber,
    entrance: cur.addressInput.entrance || "",
    floor: cur.addressInput.floor || "",
    apartment: cur.addressInput.apartment || "",
    city: cur.addressInput.city,
    deliveryArea: "center" as DeliveryArea,
    deliveryNotes: cur.addressInput.accessNotes || "",
    notes: `מבקשת הזמנה ${cur.requestNumber}`,
    active: true,
  };

  if (input.forceNewCustomer) {
    const created = allocateCustomer(working, newCustomerInput);
    if ("error" in created) return { error: created.error };
    working = created.data;
    customerId = created.customer.id;
  } else if (input.selectedCustomerId) {
    const found = (working.customers || []).find((c) => c.id === input.selectedCustomerId);
    if (!found) return { error: "לקוח נבחר לא נמצא" };
    customerId = found.id;
  } else if (matches.length === 1) {
    customerId = matches[0].id;
  } else if (matches.length > 1) {
    return { error: "נמצאו מספר לקוחות תואמים — יש לבחור ידנית" };
  } else {
    const created = allocateCustomer(working, newCustomerInput);
    if ("error" in created) return { error: created.error };
    working = created.data;
    customerId = created.customer.id;
  }

  const customer = (working.customers || []).find((c) => c.id === customerId);
  if (!customer) return { error: "לקוח לא נמצא לאחר התאמה" };

  const items: OrderItem[] = [];
  for (const it of cur.requestedItems) {
    const product = (working.products || []).find((p) => p.id === it.productId);
    if (product) {
      const row = buildOrderItemFromProduct(product, it.quantity, it.unitPriceSnapshot);
      items.push({ ...row, notes: it.notes || "" });
    } else {
      items.push({
        id: nanoid(),
        productId: it.productId,
        productSnapshot: {
          productNumber: "",
          name: it.productName,
          model: it.model || "",
          sku: "",
          barcode: "",
          unit: "יחידה",
        },
        quantity: it.quantity,
        unitPrice: it.unitPriceSnapshot,
        lineTotal: it.lineTotalSnapshot,
        notes: it.notes || "",
      });
    }
  }

  const draft: OrderDraftInput = {
    customerId,
    customerSnapshot: snapshotFromCustomer(customer),
    deliveryAreaSnapshot: customer.deliveryArea || "center",
    deliveryAddressSnapshot: {
      ...addressFromCustomer(customer),
      street: cur.addressInput.street || customer.street,
      houseNumber: cur.addressInput.houseNumber || customer.houseNumber,
      city: cur.addressInput.city || customer.city,
      entrance: cur.addressInput.entrance || "",
      floor: cur.addressInput.floor || "",
      apartment: cur.addressInput.apartment || "",
      deliveryNotes: cur.addressInput.accessNotes || "",
    },
    items,
    shippingFee: Math.max(0, roundMoney(Number(input.shippingFee) || 0)),
    paymentType: "cashOnDelivery",
    orderNotes: [
      `בקשה ${cur.requestNumber}`,
      cur.customerNotes,
      `תשלום מבוקש: ${cur.requestedPaymentMethod}`,
      `גבייה מבוקשת: ${cur.cashCollectionRequested}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const ord = allocateOrder(working, draft);
  if ("error" in ord) return { error: ord.error };
  working = ord.data;

  const conf = confirmOrderInData(working, ord.order.id);
  if ("error" in conf) return { error: conf.error };
  working = conf.data;

  let deliveryId = "";
  const wantDelivery = input.createDelivery !== false;
  if (wantDelivery) {
    const sched =
      str(input.scheduledDate, 32) ||
      str(cur.requestedDeliveryDate, 32) ||
      nowIso().slice(0, 10);
    const dlv = allocateDelivery(working, {
      orderId: ord.order.id,
      scheduledDate: sched,
      deliveryNotes: cur.addressInput.accessNotes || "",
    });
    if ("error" in dlv) return { error: dlv.error };
    working = dlv.data;
    deliveryId = dlv.delivery.id;
    const cashAmt = roundMoney(
      cur.cashCollectionRequested || conf.order.totalAmount || ord.order.totalAmount
    );
    const deliveries = (working.deliveries || []).map((d) => {
      if (d.id !== deliveryId) return d;
      return {
        ...d,
        orderTotalSnapshot: cashAmt,
        deliveryNotes: `COR ${cur.requestNumber} · גבייה ${cashAmt}`,
      };
    });
    working = { ...working, deliveries };
  }

  const now = nowIso();
  const request: CustomerOrderRequest = {
    ...cur,
    status: "Approved",
    approvedAt: now,
    approvedBy: str(input.reviewer, 80),
    createdCustomerId: customerId,
    createdOrderId: ord.order.id,
    createdDeliveryId: deliveryId,
    updatedAt: now,
  };
  const nextList = [...getCustomerOrderRequests(working)];
  const i2 = nextList.findIndex((r) => r.id === cur.id);
  if (i2 >= 0) nextList[i2] = request;
  else nextList.unshift(request);
  working = setCustomerOrderRequests({ ...working, updatedAt: now }, nextList);
  return { data: working, request };
}
