import { describe, expect, it } from "vitest";
import { emptyData, type Customer, type Product } from "./types";
import { validateAppData } from "./validate-data";
import {
  allocateOrder,
  buildCopiedOrderDraft,
  buildOrderItemFromProduct,
  calcLineTotal,
  calcOrderTotal,
  cancelOrderInData,
  confirmOrderInData,
  findDuplicateProductLine,
  formatOrderNumber,
  normalizeOrder,
  resolveOrderCounter,
  roundMoney,
  snapshotFromCustomer,
  addressFromCustomer,
  stockUnchangedProof,
  updateOrderInData,
  validateOrderDraft,
} from "./orders";
import { normalizeCustomer, normalizeProduct } from "./entities";

function sampleCustomer(over: Partial<Customer> = {}): Customer {
  return normalizeCustomer({
    id: "cus-1",
    name: "Cust",
    phone: "0501111111",
    city: "City",
    deliveryArea: "center",
    street: "St",
    houseNumber: "1",
    ...over,
  });
}

function sampleProduct(over: Partial<Product> = {}): Product {
  return normalizeProduct({
    id: "prd-1",
    name: "Prod",
    salePrice: 10,
    sku: "01",
    stockQuantity: 5,
    ...over,
  });
}

function draftFrom(c: Customer, p: Product, qty = 2, price?: number) {
  const item = buildOrderItemFromProduct(p, qty, price);
  return {
    customerId: c.id,
    customerSnapshot: snapshotFromCustomer(c),
    deliveryAreaSnapshot: c.deliveryArea,
    deliveryAddressSnapshot: addressFromCustomer(c),
    items: [item],
    orderNotes: "",
  };
}

describe("ORD-WEB orders foundation", () => {
  it("ORD-WEB-001 Legacy workspace without orders", () => {
    const legacy = {
      version: 1 as const,
      updatedAt: "t",
      incomes: [],
      expenses: [],
      customers: [],
      products: [],
    };
    const r = validateAppData(legacy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.orders).toEqual([]);
    expect(r.data.counters?.nextOrderNumber).toBe(0);
  });

  it("ORD-WEB-002/003 Create + number allocation", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const data = { ...emptyData(), customers: [c], products: [p] };
    const r = allocateOrder(data, draftFrom(c, p));
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.order.orderNumber).toBe("ORD-000001");
    expect(r.data.counters?.nextOrderNumber).toBe(1);
    expect(r.order.paymentType).toBe("cashOnDelivery");
  });

  it("ORD-WEB-004/005 Cancel form / validation no counter", () => {
    const data = emptyData();
    const before = resolveOrderCounter(data);
    const bad = allocateOrder(data, {
      customerId: "",
      customerSnapshot: snapshotFromCustomer(sampleCustomer()),
      deliveryAreaSnapshot: "unassigned",
      deliveryAddressSnapshot: addressFromCustomer(sampleCustomer()),
      items: [],
    });
    expect("error" in bad).toBe(true);
    expect(resolveOrderCounter(data)).toBe(before);
    expect(formatOrderNumber(1)).toBe("ORD-000001");
  });

  it("ORD-WEB-006/007 Edit same id and number", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    let data = { ...emptyData(), customers: [c], products: [p] };
    const created = allocateOrder(data, draftFrom(c, p));
    if ("error" in created) throw new Error(created.error);
    data = created.data;
    const updated = updateOrderInData(data, created.order.id, {
      orderNotes: "note",
      items: created.order.items,
    });
    if ("error" in updated) throw new Error(updated.error);
    expect(updated.order.id).toBe(created.order.id);
    expect(updated.order.orderNumber).toBe(created.order.orderNumber);
    expect(data.counters?.nextOrderNumber).toBe(1);
  });

  it("ORD-WEB-008/009 Item and customer required", () => {
    const c = sampleCustomer();
    expect(
      validateOrderDraft({
        customerId: "",
        customerSnapshot: snapshotFromCustomer(c),
        deliveryAreaSnapshot: "center",
        deliveryAddressSnapshot: addressFromCustomer(c),
        items: [],
      }).ok
    ).toBe(false);
    expect(
      validateOrderDraft({
        customerId: c.id,
        customerSnapshot: snapshotFromCustomer(c),
        deliveryAreaSnapshot: "center",
        deliveryAddressSnapshot: addressFromCustomer(c),
        items: [],
      }).ok
    ).toBe(false);
  });

  it("ORD-WEB-010/011 Quantity rules", () => {
    expect(calcLineTotal(0, 10)).toBe(0);
    expect(calcLineTotal(1.5, 10)).toBe(15);
    const p = sampleProduct();
    const item = buildOrderItemFromProduct(p, 2.5, 4);
    expect(item.quantity).toBe(2.5);
    expect(item.lineTotal).toBe(10);
  });

  it("ORD-WEB-012/013/014/015 Price and totals safe", () => {
    expect(calcLineTotal(3, 3.33)).toBe(9.99);
    expect(Number.isFinite(calcOrderTotal([{ lineTotal: 1.1 } as never, { lineTotal: 2.2 } as never]))).toBe(true);
    expect(Number.isNaN(roundMoney(Number.NaN))).toBe(false);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("ORD-WEB-016/017/018 Snapshots", () => {
    const c = sampleCustomer({ businessName: "Biz", secondaryPhone: "1" });
    const p = sampleProduct({ model: "M", barcode: "00" });
    const created = allocateOrder(
      { ...emptyData(), customers: [c], products: [p] },
      draftFrom(c, p)
    );
    if ("error" in created) throw new Error(created.error);
    expect(created.order.customerSnapshot.phone).toBe(c.phone);
    expect(created.order.deliveryAddressSnapshot.street).toBe(c.street);
    expect(created.order.items[0].productSnapshot.sku).toBe(p.sku);
  });

  it("ORD-WEB-019/020 Missing customer/product fallback via normalize", () => {
    const o = normalizeOrder({
      id: "o1",
      orderNumber: "ORD-000007",
      status: "draft",
      customerId: "missing",
      items: [{ id: "i1", productId: "missing", quantity: 1, unitPrice: 5 }],
    });
    expect(o.customerSnapshot.customerName).toBe("");
    expect(o.items[0].productSnapshot.name).toBe("");
    expect(o.totalAmount).toBe(5);
  });

  it("ORD-WEB-021..026 Status actions", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    let data = { ...emptyData(), customers: [c], products: [p] };
    const created = allocateOrder(data, draftFrom(c, p));
    if ("error" in created) throw new Error(created.error);
    data = created.data;
    const conf = confirmOrderInData(data, created.order.id);
    if ("error" in conf) throw new Error(conf.error);
    expect(conf.order.status).toBe("confirmed");
    expect(conf.order.confirmedAt).toBeTruthy();
    data = conf.data;
    const badCancel = cancelOrderInData(data, created.order.id, "ab");
    expect("error" in badCancel).toBe(true);
    const cancelled = cancelOrderInData(data, created.order.id, "not needed");
    if ("error" in cancelled) throw new Error(cancelled.error);
    expect(cancelled.order.status).toBe("cancelled");
    const editCancelled = updateOrderInData(cancelled.data, created.order.id, { orderNotes: "x" });
    expect("error" in editCancelled).toBe(true);
  });

  it("ORD-WEB-027..031 Copy order", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    let data = { ...emptyData(), customers: [c], products: [p] };
    const created = allocateOrder(data, draftFrom(c, p));
    if ("error" in created) throw new Error(created.error);
    data = created.data;
    const draft = buildCopiedOrderDraft(created.order);
    expect(draft.items[0].id).not.toBe(created.order.items[0].id);
    const copied = allocateOrder(data, draft);
    if ("error" in copied) throw new Error(copied.error);
    expect(copied.order.id).not.toBe(created.order.id);
    expect(copied.order.orderNumber).toBe("ORD-000002");
    expect(copied.order.status).toBe("draft");
    expect(copied.order.cancellationReason).toBe("");
    // cancel form = not calling allocate again
    expect(resolveOrderCounter(data)).toBe(1);
  });

  it("ORD-WEB-032 Duplicate product warning helper", () => {
    const p = sampleProduct();
    const item = buildOrderItemFromProduct(p, 1);
    expect(findDuplicateProductLine([item], p.id)?.id).toBe(item.id);
  });

  it("ORD-WEB-033/034 Snapshots not rewritten by live entity change", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const created = allocateOrder(
      { ...emptyData(), customers: [c], products: [p] },
      draftFrom(c, p)
    );
    if ("error" in created) throw new Error(created.error);
    const snapPhone = created.order.customerSnapshot.phone;
    const snapSku = created.order.items[0].productSnapshot.sku;
    c.phone = "0509999999";
    p.sku = "CHANGED";
    expect(created.order.customerSnapshot.phone).toBe(snapPhone);
    expect(created.order.items[0].productSnapshot.sku).toBe(snapSku);
  });

  it("ORD-WEB-049/050/051 No stock/customer/product mutation on order", () => {
    const c = sampleCustomer();
    const p = sampleProduct({ stockQuantity: 9 });
    const beforeProducts = [structuredClone(p)];
    const beforeCustomers = [structuredClone(c)];
    const created = allocateOrder(
      { ...emptyData(), customers: [c], products: [p] },
      draftFrom(c, p)
    );
    if ("error" in created) throw new Error(created.error);
    expect(stockUnchangedProof(beforeProducts, created.data.products)).toBe(true);
    expect(created.data.customers[0].phone).toBe(beforeCustomers[0].phone);
    expect(created.data.products[0].stockQuantity).toBe(9);
  });

  it("ORD-WEB-052 Unknown fields preserved", () => {
    const o = normalizeOrder({
      id: "x",
      orderNumber: "ORD-000003",
      customFlag: "keep",
      items: [],
    });
    expect((o as Record<string, unknown>).customFlag).toBe("keep");
  });

  it("ORD-WEB-053 Dirty implied by counter/updatedAt change", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const before = emptyData();
    const after = allocateOrder({ ...before, customers: [c], products: [p] }, draftFrom(c, p));
    if ("error" in after) throw new Error(after.error);
    expect(after.data.counters?.nextOrderNumber).toBe(1);
  });

  it("search/filter helpers", () => {
    const c = sampleCustomer({ name: "Alpha", phone: "050222", city: "NorthCity", deliveryArea: "north" });
    const p = sampleProduct({ name: "Widget", model: "X1", sku: "SKU9" });
    const created = allocateOrder(
      { ...emptyData(), customers: [c], products: [p] },
      draftFrom(c, p)
    );
    if ("error" in created) throw new Error(created.error);
    const o = created.order;
    const hay = [
      o.orderNumber,
      o.customerSnapshot.customerName,
      o.customerSnapshot.phone,
      o.customerSnapshot.city,
      o.items.map((i) => i.productSnapshot.name).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    expect(hay.includes("alpha")).toBe(true);
    expect(hay.includes("widget")).toBe(true);
    expect(o.status === "draft").toBe(true);
    expect(o.deliveryAreaSnapshot === "north").toBe(true);
  });

  it("counter from highest existing ORD", () => {
    const data = {
      ...emptyData(),
      orders: [normalizeOrder({ id: "1", orderNumber: "ORD-000009", items: [] })],
    };
    expect(resolveOrderCounter(data)).toBe(9);
  });
});
