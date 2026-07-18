import type { AppData, Customer, Product } from "./types";
import {
  allocateCustomer,
  allocateProduct,
  setCustomerActiveInData,
  setProductActiveInData,
  updateCustomerInData,
  updateProductInData,
  type CustomerInput,
  type ProductInput,
} from "./entities";
import {
  addressFromCustomer,
  allocateOrder,
  buildCopiedOrderDraft,
  buildOrderItemFromProduct,
  cancelOrderInData,
  confirmOrderInData,
  snapshotFromCustomer,
  updateOrderInData,
  type OrderDraftInput,
} from "./orders";
import { applyInventoryMovement, type MovementCreateInput } from "./inventory";
import {
  allocateDelivery,
  cancelDeliveryInData,
  updateDeliveryInData,
  type DeliveryCreateInput,
  type DeliveryUpdateInput,
} from "./deliveries";
import {
  addExpenseInData,
  addIncomeInData,
  removeExpenseInData,
  removeIncomeInData,
  updateExpenseInData,
  updateIncomeInData,
  type MoneyInput,
} from "./money-records";
import { validateAppData } from "./validate-data";
import {
  allocateDeliveryRoute,
  allocateDriver,
  allocateVehicle,
  cancelDeliveryRouteInData,
  reorderRouteStopsInData,
  setDriverActiveInData,
  setVehicleActiveInData,
  updateDeliveryRouteInData,
  updateDriverInData,
  updateVehicleInData,
} from "./phase9a-fleet";
import { CLOUD_CONTRACT_VERSION } from "./cloud-contract";
import { createOrderPaymentInData, voidOrderPaymentInData } from "./order-payments-cloud";
import {
  approveCorAtomic,
  rejectCor,
  startReviewCor,
} from "./customer-order-requests";

/** Explicit allowlist — never accept arbitrary AppData patches. */
export const DESKTOP_MUTATE_ACTIONS = [
  "createCustomer",
  "updateCustomer",
  "deactivateCustomer",
  "reactivateCustomer",
  "createProduct",
  "updateProduct",
  "deactivateProduct",
  "reactivateProduct",
  "increaseInventory",
  "decreaseInventory",
  "correctInventory",
  "createOrder",
  "updateOrder",
  "confirmOrder",
  "cancelOrder",
  "copyOrder",
  "createDelivery",
  "updateDelivery",
  "markDeliveryReady",
  "returnDeliveryToPending",
  "cancelDelivery",
  "createIncome",
  "updateIncome",
  "deleteIncome",
  "createExpense",
  "updateExpense",
  "deleteExpense",
  "createDriver",
  "updateDriver",
  "deactivateDriver",
  "reactivateDriver",
  "createVehicle",
  "updateVehicle",
  "deactivateVehicle",
  "reactivateVehicle",
  "createDeliveryRoute",
  "updateDeliveryRoute",
  "cancelDeliveryRoute",
  "reorderRouteStops",
  "createOrderPayment",
  "voidOrderPayment",
  "startReviewCustomerOrderRequest",
  "approveCustomerOrderRequest",
  "rejectCustomerOrderRequest",
] as const;

export type DesktopMutateAction = (typeof DESKTOP_MUTATE_ACTIONS)[number];

export function isDesktopMutateAction(v: unknown): v is DesktopMutateAction {
  return typeof v === "string" && (DESKTOP_MUTATE_ACTIONS as readonly string[]).includes(v);
}

export type ApplyDesktopMutationResult =
  | {
      ok: true;
      data: AppData;
      record: unknown;
      recordKind: string;
    }
  | { ok: false; error: string };

function asRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function requireId(payload: Record<string, unknown>): string | null {
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  return id || null;
}

function normalizeDesktopOrderDraft(
  data: AppData,
  payload: Record<string, unknown>
): { ok: true; data: AppData; draft: OrderDraftInput } | { ok: false; error: string } {
  let working = data;
  let customerId = typeof payload.customerId === "string" ? payload.customerId.trim() : "";

  const inline =
    (payload.newCustomer && typeof payload.newCustomer === "object" && !Array.isArray(payload.newCustomer)
      ? (payload.newCustomer as Record<string, unknown>)
      : null) ||
    (payload.inlineCustomer && typeof payload.inlineCustomer === "object" && !Array.isArray(payload.inlineCustomer)
      ? (payload.inlineCustomer as Record<string, unknown>)
      : null);

  if (inline && typeof inline.phone === "string" && inline.phone.trim()) {
    const created = allocateCustomer(working, inline as unknown as CustomerInput);
    if ("error" in created) return { ok: false, error: created.error };
    working = created.data;
    customerId = created.customer.id;
  }

  if (!customerId) return { ok: false, error: "יש לבחור לקוח" };
  const customer = (working.customers || []).find((c) => c.id === customerId);
  if (!customer) return { ok: false, error: "לקוח לא נמצא" };

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) return { ok: false, error: "יש להוסיף לפחות מוצר אחד" };

  const items = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "פריט הזמנה אינו תקין" };
    }
    const row = raw as Record<string, unknown>;
    const productId = typeof row.productId === "string" ? row.productId.trim() : "";
    if (!productId) return { ok: false, error: "מוצר חובה בשורת הזמנה" };
    const product = (working.products || []).find((x) => x.id === productId);
    if (!product) return { ok: false, error: "מוצר לא נמצא" };
    const quantity = Number(row.quantity);
    const unitPrice = row.unitPrice !== undefined ? Number(row.unitPrice) : undefined;
    items.push(buildOrderItemFromProduct(product, quantity, unitPrice));
  }

  const draft: OrderDraftInput = {
    customerId,
    customerSnapshot:
      payload.customerSnapshot && typeof payload.customerSnapshot === "object"
        ? (payload.customerSnapshot as OrderDraftInput["customerSnapshot"])
        : snapshotFromCustomer(customer),
    deliveryAreaSnapshot:
      (payload.deliveryAreaSnapshot as OrderDraftInput["deliveryAreaSnapshot"]) ||
      customer.deliveryArea,
    deliveryAddressSnapshot:
      payload.deliveryAddressSnapshot && typeof payload.deliveryAddressSnapshot === "object"
        ? (payload.deliveryAddressSnapshot as OrderDraftInput["deliveryAddressSnapshot"])
        : addressFromCustomer(customer),
    items,
    shippingFee: payload.shippingFee !== undefined ? Number(payload.shippingFee) : 0,
    orderNotes:
      typeof payload.orderNotes === "string"
        ? payload.orderNotes
        : typeof payload.notes === "string"
          ? payload.notes
          : "",
    paymentType: "cashOnDelivery",
  };

  return { ok: true, data: working, draft };
}

/**
 * Apply one allowlisted desktop mutation in memory.
 * Counters advance only inside successful domain allocate helpers.
 */
export function applyDesktopMutation(
  data: AppData,
  actionType: DesktopMutateAction,
  payload: unknown
): ApplyDesktopMutationResult {
  const p = asRecord(payload);

  switch (actionType) {
    case "createCustomer": {
      const r = allocateCustomer(data, p as unknown as CustomerInput);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.customer, recordKind: "customer" };
    }
    case "updateCustomer": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה לקוח חובה" };
      const patch = { ...p };
      delete patch.id;
      const r = updateCustomerInData(data, id, patch as Partial<Customer>);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.customer, recordKind: "customer" };
    }
    case "deactivateCustomer":
    case "reactivateCustomer": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה לקוח חובה" };
      const r = setCustomerActiveInData(data, id, actionType === "reactivateCustomer");
      if ("error" in r) return { ok: false, error: r.error };
      const customer = r.data.customers.find((c) => c.id === id) || null;
      return { ok: true, data: r.data, record: customer, recordKind: "customer" };
    }
    case "createProduct": {
      const r = allocateProduct(data, p as unknown as ProductInput);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.product, recordKind: "product" };
    }
    case "updateProduct": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה מוצר חובה" };
      const patch = { ...p };
      delete patch.id;
      delete patch.stockQuantity;
      const r = updateProductInData(data, id, patch as Partial<Product>);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.product, recordKind: "product" };
    }
    case "deactivateProduct":
    case "reactivateProduct": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה מוצר חובה" };
      const r = setProductActiveInData(data, id, actionType === "reactivateProduct");
      if ("error" in r) return { ok: false, error: r.error };
      const product = r.data.products.find((x) => x.id === id) || null;
      return { ok: true, data: r.data, record: product, recordKind: "product" };
    }
    case "increaseInventory":
    case "decreaseInventory":
    case "correctInventory": {
      const movementType =
        actionType === "increaseInventory"
          ? "increase"
          : actionType === "decreaseInventory"
            ? "decrease"
            : "correction";
      const input: MovementCreateInput = {
        productId: String(p.productId || ""),
        movementType,
        quantity: Number(p.quantity),
        reason: typeof p.reason === "string" ? p.reason : undefined,
        notes: typeof p.notes === "string" ? p.notes : undefined,
      };
      const r = applyInventoryMovement(data, input);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.movement, recordKind: "inventoryMovement" };
    }
    case "createOrder": {
      const normalized = normalizeDesktopOrderDraft(data, p);
      if (!normalized.ok) return { ok: false, error: normalized.error };
      const r = allocateOrder(normalized.data, normalized.draft);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.order, recordKind: "order" };
    }
    case "updateOrder": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה הזמנה חובה" };
      const normalized = normalizeDesktopOrderDraft(data, p);
      if (!normalized.ok) return { ok: false, error: normalized.error };
      const r = updateOrderInData(normalized.data, id, normalized.draft);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.order, recordKind: "order" };
    }
    case "confirmOrder": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה הזמנה חובה" };
      const r = confirmOrderInData(data, id);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.order, recordKind: "order" };
    }
    case "cancelOrder": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה הזמנה חובה" };
      const reason = String(p.reason || p.cancellationReason || "");
      const r = cancelOrderInData(data, id, reason);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.order, recordKind: "order" };
    }
    case "copyOrder": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה הזמנה חובה" };
      const source = (data.orders || []).find((o) => o.id === id);
      if (!source) return { ok: false, error: "הזמנה לא נמצאה" };
      const draft = buildCopiedOrderDraft(source);
      const r = allocateOrder(data, draft);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.order, recordKind: "order" };
    }
    case "createDelivery": {
      const r = allocateDelivery(data, p as unknown as DeliveryCreateInput);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.delivery, recordKind: "delivery" };
    }
    case "updateDelivery": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה משלוח חובה" };
      const patch = { ...p };
      delete patch.id;
      const r = updateDeliveryInData(data, id, patch as DeliveryUpdateInput);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.delivery, recordKind: "delivery" };
    }
    case "markDeliveryReady": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה משלוח חובה" };
      const r = updateDeliveryInData(data, id, { status: "ready" });
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.delivery, recordKind: "delivery" };
    }
    case "returnDeliveryToPending": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה משלוח חובה" };
      const r = updateDeliveryInData(data, id, { status: "pending" });
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.delivery, recordKind: "delivery" };
    }
    case "cancelDelivery": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה משלוח חובה" };
      const reason = String(p.reason || p.cancellationReason || "");
      const r = cancelDeliveryInData(data, id, reason);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.delivery, recordKind: "delivery" };
    }
    case "createIncome": {
      const r = addIncomeInData(data, p as unknown as MoneyInput);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.record, recordKind: "income" };
    }
    case "updateIncome": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה הכנסה חובה" };
      const input = { ...p };
      delete input.id;
      const r = updateIncomeInData(data, id, input as unknown as MoneyInput);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.record, recordKind: "income" };
    }
    case "deleteIncome": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה הכנסה חובה" };
      const r = removeIncomeInData(data, id);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: { id }, recordKind: "income" };
    }
    case "createExpense": {
      const r = addExpenseInData(data, p as unknown as MoneyInput);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.record, recordKind: "expense" };
    }
    case "updateExpense": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה הוצאה חובה" };
      const input = { ...p };
      delete input.id;
      const r = updateExpenseInData(data, id, input as unknown as MoneyInput);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.record, recordKind: "expense" };
    }
    case "deleteExpense": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה הוצאה חובה" };
      const r = removeExpenseInData(data, id);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: { id }, recordKind: "expense" };
    }
    case "createDriver": {
      const r = allocateDriver(data, p);
      if ("error" in r) return { ok: false, error: r.error };
      return {
        ok: true,
        data: { ...r.data, cloudContractVersion: CLOUD_CONTRACT_VERSION },
        record: r.driver,
        recordKind: "driver",
      };
    }
    case "updateDriver": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה נהג חובה" };
      const patch = { ...p };
      delete patch.id;
      const r = updateDriverInData(data, id, patch);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.driver, recordKind: "driver" };
    }
    case "deactivateDriver":
    case "reactivateDriver": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה נהג חובה" };
      const r = setDriverActiveInData(data, id, actionType === "reactivateDriver");
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.driver, recordKind: "driver" };
    }
    case "createVehicle": {
      const r = allocateVehicle(data, p);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.vehicle, recordKind: "vehicle" };
    }
    case "updateVehicle": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה רכב חובה" };
      const patch = { ...p };
      delete patch.id;
      const r = updateVehicleInData(data, id, patch);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.vehicle, recordKind: "vehicle" };
    }
    case "deactivateVehicle":
    case "reactivateVehicle": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה רכב חובה" };
      const r = setVehicleActiveInData(data, id, actionType === "reactivateVehicle");
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.vehicle, recordKind: "vehicle" };
    }
    case "createDeliveryRoute": {
      const r = allocateDeliveryRoute(data, p);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.route, recordKind: "deliveryRoute" };
    }
    case "updateDeliveryRoute": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה מסלול חובה" };
      const patch = { ...p };
      delete patch.id;
      const r = updateDeliveryRouteInData(data, id, patch);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.route, recordKind: "deliveryRoute" };
    }
    case "cancelDeliveryRoute": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה מסלול חובה" };
      const r = cancelDeliveryRouteInData(data, id, String(p.reason || ""));
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.route, recordKind: "deliveryRoute" };
    }
    case "reorderRouteStops": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה מסלול חובה" };
      const ordered = Array.isArray(p.orderedStopIds)
        ? p.orderedStopIds.map((x) => String(x))
        : [];
      const r = reorderRouteStopsInData(data, id, ordered);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, data: r.data, record: r.route, recordKind: "deliveryRoute" };
    }
    case "createOrderPayment": {
      const r = createOrderPaymentInData(data, p);
      if ("error" in r) return { ok: false, error: r.error };
      return {
        ok: true,
        data: { ...r.data, cloudContractVersion: CLOUD_CONTRACT_VERSION },
        record: r.payment,
        recordKind: "orderPayment",
      };
    }
    case "voidOrderPayment": {
      const r = voidOrderPaymentInData(data, p);
      if ("error" in r) return { ok: false, error: r.error };
      return {
        ok: true,
        data: { ...r.data, cloudContractVersion: CLOUD_CONTRACT_VERSION },
        record: r.payment,
        recordKind: "orderPayment",
      };
    }
    case "startReviewCustomerOrderRequest": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה בקשה חובה" };
      const r = startReviewCor(data, id, String(p.reviewer || "manager"));
      if ("error" in r) return { ok: false, error: r.error };
      return {
        ok: true,
        data: { ...r.data, cloudContractVersion: CLOUD_CONTRACT_VERSION },
        record: r.request,
        recordKind: "customerOrderRequest",
      };
    }
    case "approveCustomerOrderRequest": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה בקשה חובה" };
      const r = approveCorAtomic(data, {
        id,
        reviewer: String(p.reviewer || "manager"),
        selectedCustomerId: typeof p.selectedCustomerId === "string" ? p.selectedCustomerId : undefined,
        forceNewCustomer: p.forceNewCustomer === true,
        shippingFee: typeof p.shippingFee === "number" ? p.shippingFee : undefined,
        createDelivery: p.createDelivery !== false,
        scheduledDate: typeof p.scheduledDate === "string" ? p.scheduledDate : undefined,
      });
      if ("error" in r) return { ok: false, error: r.error };
      return {
        ok: true,
        data: { ...r.data, cloudContractVersion: CLOUD_CONTRACT_VERSION },
        record: r.request,
        recordKind: "customerOrderRequest",
      };
    }
    case "rejectCustomerOrderRequest": {
      const id = requireId(p);
      if (!id) return { ok: false, error: "מזהה בקשה חובה" };
      const r = rejectCor(data, id, String(p.reason || ""), String(p.reviewer || "manager"));
      if ("error" in r) return { ok: false, error: r.error };
      return {
        ok: true,
        data: { ...r.data, cloudContractVersion: CLOUD_CONTRACT_VERSION },
        record: r.request,
        recordKind: "customerOrderRequest",
      };
    }
    default:
      return { ok: false, error: "פעולה אינה נתמכת" };
  }
}

export function finalizeMutatedData(data: AppData): { ok: true; data: AppData } | { ok: false; error: string } {
  const validated = validateAppData(data);
  if (!validated.ok) return { ok: false, error: "נתונים לאחר הפעולה אינם תקינים" };
  return { ok: true, data: validated.data };
}

export function normalizeEtag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.replace(/^W\//i, "").replace(/^"|"$/g, "");
}

export function etagsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeEtag(a);
  const nb = normalizeEtag(b);
  if (!na || !nb) return false;
  return na === nb;
}
