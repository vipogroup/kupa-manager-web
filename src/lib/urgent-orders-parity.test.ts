import { describe, expect, it } from "vitest";
import { emptyData, type AppData } from "./types";
import { validateAppData } from "./validate-data";
import { mergeAppDataPreserveUnknown } from "./cloud-contract";
import { applyDesktopMutation } from "./desktop-mutate";
import { getOrderPayments } from "./order-payments-cloud";

/** Server-side protect logic mirrored from sync/route.ts */
function protectCollections(
  baseRec: Record<string, unknown>,
  rawData: Record<string, unknown>,
  validatedOverlay: Record<string, unknown>
): Record<string, unknown> {
  const mergedRec = mergeAppDataPreserveUnknown(baseRec, validatedOverlay);
  const keys = [
    "orders",
    "customers",
    "deliveries",
    "products",
    "orderPayments",
    "drivers",
    "vehicles",
    "deliveryRoutes",
  ];
  for (const key of keys) {
    if (!(key in rawData) && key in baseRec) {
      mergedRec[key] = baseRec[key];
      continue;
    }
    if (
      key in rawData &&
      Array.isArray(rawData[key]) &&
      (rawData[key] as unknown[]).length === 0 &&
      Array.isArray(baseRec[key]) &&
      (baseRec[key] as unknown[]).length > 0
    ) {
      mergedRec[key] = baseRec[key];
    }
  }
  return mergedRec;
}

describe("Urgent order parity — cloud safety", () => {
  it("URGENT-001 empty orders array must not wipe cloud orders", () => {
    const base = {
      ...emptyData(),
      orders: [{ id: "ord-1", orderNumber: "ORD-1", status: "draft" }],
      customers: [{ id: "c1", name: "A", customerType: "private", active: true }],
      products: [{ id: "p1", name: "P", salePrice: 10, active: true }],
    } as unknown as AppData;
    const raw = {
      version: 1,
      incomes: [],
      expenses: [],
      customers: base.customers,
      products: base.products,
      orders: [],
      updatedAt: new Date().toISOString(),
    };
    const v = validateAppData(raw);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const merged = protectCollections(
      base as unknown as Record<string, unknown>,
      raw,
      v.data as unknown as Record<string, unknown>
    );
    expect((merged.orders as unknown[]).length).toBe(1);
    expect((merged.orders as { id: string }[])[0].id).toBe("ord-1");
  });

  it("URGENT-002 omitted orders key keeps cloud orders", () => {
    const base = {
      ...emptyData(),
      orders: [{ id: "ord-2", orderNumber: "ORD-2", status: "confirmed" }],
    } as unknown as AppData;
    const raw = {
      version: 1,
      incomes: [],
      expenses: [],
      customers: [],
      products: [],
      updatedAt: new Date().toISOString(),
    };
    const v = validateAppData(raw);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const merged = protectCollections(
      base as unknown as Record<string, unknown>,
      raw,
      v.data as unknown as Record<string, unknown>
    );
    expect((merged.orders as unknown[]).length).toBe(1);
  });

  it("URGENT-003 createOrderPayment + preserve on unrelated update", () => {
    let data = emptyData();
    const c = applyDesktopMutation(data, "createCustomer", {
      name: "SYNC-LIVE-TEST-CUSTOMER",
      customerType: "private",
      phone: "0500000001",
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    data = c.data;
    const cust = c.record as { id: string };
    const p = applyDesktopMutation(data, "createProduct", {
      name: "SYNC-LIVE-TEST-PRODUCT",
      model: "SLT",
      sku: "SLT-SKU-1",
      barcode: "",
      description: "",
      salePrice: 50,
      costPrice: 20,
      stockQuantity: 0,
      unit: "יחידה",
      active: true,
    });
    if (!p.ok) throw new Error("createProduct: " + p.error);
    expect(p.ok).toBe(true);
    data = p.data;
    const prod = p.record as { id: string };
    const o = applyDesktopMutation(data, "createOrder", {
      customerId: cust.id,
      items: [{ productId: prod.id, quantity: 2, unitPrice: 50 }],
      shippingFee: 10,
      paymentType: "cashOnDelivery",
      internalNotes: "SYNC-LIVE-TEST-ORDER",
    });
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    data = o.data;
    const ord = o.record as { id: string; totalAmount?: number };
    const pay = applyDesktopMutation(data, "createOrderPayment", {
      orderId: ord.id,
      amount: 30,
      paymentMethod: "cash",
      notes: "SYNC-LIVE-TEST-PAYMENT",
    });
    expect(pay.ok).toBe(true);
    if (!pay.ok) return;
    data = pay.data;
    expect(getOrderPayments(data).length).toBe(1);
    const updCust = applyDesktopMutation(data, "updateCustomer", {
      id: cust.id,
      notes: "SYNC-LIVE-TEST-CUSTOMER-UPDATED",
    });
    expect(updCust.ok).toBe(true);
    if (!updCust.ok) return;
    expect(getOrderPayments(updCust.data).length).toBe(1);
    expect(getOrderPayments(updCust.data)[0].notes).toBe("SYNC-LIVE-TEST-PAYMENT");
    expect(getOrderPayments(updCust.data)[0].orderId).toBe(ord.id);
  });
});

