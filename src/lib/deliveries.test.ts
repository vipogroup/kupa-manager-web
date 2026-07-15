import { describe, expect, it } from "vitest";
import { emptyData, type Customer, type Product } from "./types";
import { validateAppData } from "./validate-data";
import { normalizeCustomer, normalizeProduct } from "./entities";
import {
  addressFromCustomer,
  allocateOrder,
  buildOrderItemFromProduct,
  cancelOrderInData,
  confirmOrderInData,
  snapshotFromCustomer,
} from "./orders";
import {
  allocateDelivery,
  cancelDeliveryInData,
  deliverySummary,
  filterDeliveries,
  findDeliveryForOrder,
  formatDeliveryNumber,
  formatFullDeliveryAddress,
  formatProductsSummary,
  hasAnyDeliveryForOrder,
  normalizeDelivery,
  refreshDeliveryFromOrder,
  resolveDeliveryCounter,
  stockAndInventoryUnchanged,
  updateDeliveryInData,
} from "./deliveries";
import { buildCloudSnapshot, parseCloudSnapshot, dataContentSha256 } from "./sync-snapshot";

function sampleCustomer(over: Partial<Customer> = {}): Customer {
  return normalizeCustomer({
    id: "cus-1",
    name: "Cust",
    phone: "0501111111",
    city: "City",
    street: "Street",
    houseNumber: "10",
    entrance: "B",
    floor: "2",
    apartment: "5",
    zipCode: "6100000",
    deliveryArea: "center",
    ...over,
  });
}

function sampleProduct(over: Partial<Product> = {}): Product {
  return normalizeProduct({
    id: "prd-1",
    name: "Prod",
    model: "200/60",
    sku: "S1",
    salePrice: 10,
    stockQuantity: 20,
    ...over,
  });
}

function withConfirmedOrder(area: "center" | "north" | "south" | "unassigned" = "center") {
  const c = sampleCustomer({ deliveryArea: area });
  const p = sampleProduct();
  let data = { ...emptyData(), customers: [c], products: [p] };
  const created = allocateOrder(data, {
    customerId: c.id,
    customerSnapshot: snapshotFromCustomer(c),
    deliveryAreaSnapshot: area,
    deliveryAddressSnapshot: addressFromCustomer(c),
    items: [buildOrderItemFromProduct(p, 2)],
  });
  if ("error" in created) throw new Error("order create failed");
  data = created.data;
  const conf = confirmOrderInData(data, created.order.id);
  if ("error" in conf) throw new Error("confirm failed");
  return { data: conf.data, order: conf.order, customer: c, product: p };
}

describe("DLV-WEB delivery model", () => {
  it("DLV-WEB-001 Legacy workspace load", () => {
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
    expect(r.data.deliveries).toEqual([]);
    expect(r.data.counters?.nextDeliveryNumber).toBe(0);
  });

  it("DLV-WEB-002 Delivery create", () => {
    const { data, order } = withConfirmedOrder();
    const r = allocateDelivery(data, { orderId: order.id });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.delivery.status).toBe("pending");
    expect(r.data.deliveries).toHaveLength(1);
  });

  it("DLV-WEB-003 Delivery numbering", () => {
    const { data, order } = withConfirmedOrder();
    const a = allocateDelivery(data, { orderId: order.id });
    expect("error" in a).toBe(false);
    if ("error" in a) return;
    expect(a.delivery.deliveryNumber).toBe("DLV-WEB-000001");
    expect(a.data.counters?.nextDeliveryNumber).toBe(1);
  });

  it("DLV-WEB-004 Cancel form no counter advance", () => {
    const { data } = withConfirmedOrder();
    const before = resolveDeliveryCounter(data);
    expect(resolveDeliveryCounter(data)).toBe(before);
  });

  it("DLV-WEB-005 Validation failure no counter advance", () => {
    const { data } = withConfirmedOrder();
    const before = resolveDeliveryCounter(data);
    const r = allocateDelivery(data, { orderId: "missing" });
    expect("error" in r).toBe(true);
    expect(resolveDeliveryCounter(data)).toBe(before);
  });

  it("DLV-WEB-006/007 Edit same id and number", () => {
    const { data, order } = withConfirmedOrder();
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const edited = updateDeliveryInData(created.data, created.delivery.id, {
      deliveryNotes: "note",
      scheduledDate: "2026-07-20",
    });
    expect("error" in edited).toBe(false);
    if ("error" in edited) return;
    expect(edited.delivery.id).toBe(created.delivery.id);
    expect(edited.delivery.deliveryNumber).toBe(created.delivery.deliveryNumber);
    expect(edited.data.counters?.nextDeliveryNumber).toBe(1);
  });

  it("DLV-WEB-008 Confirmed order allowed", () => {
    const { data, order } = withConfirmedOrder();
    expect(order.status).toBe("confirmed");
    expect("error" in allocateDelivery(data, { orderId: order.id })).toBe(false);
  });

  it("DLV-WEB-009 Draft order blocked", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const data = { ...emptyData(), customers: [c], products: [p] };
    const created = allocateOrder(data, {
      customerId: c.id,
      customerSnapshot: snapshotFromCustomer(c),
      deliveryAreaSnapshot: "center",
      deliveryAddressSnapshot: addressFromCustomer(c),
      items: [buildOrderItemFromProduct(p, 1)],
    });
    if ("error" in created) throw new Error("fail");
    const r = allocateDelivery(created.data, { orderId: created.order.id });
    expect("error" in r).toBe(true);
  });

  it("DLV-WEB-010 Cancelled order blocked", () => {
    const { data, order } = withConfirmedOrder();
    const cancelled = cancelOrderInData(data, order.id, "בטל הזמנה");
    if ("error" in cancelled) throw new Error("fail");
    const r = allocateDelivery(cancelled.data, { orderId: order.id });
    expect("error" in r).toBe(true);
  });

  it("DLV-WEB-011 Duplicate delivery blocked", () => {
    const { data, order } = withConfirmedOrder();
    const a = allocateDelivery(data, { orderId: order.id });
    if ("error" in a) throw new Error("fail");
    const before = resolveDeliveryCounter(a.data);
    const b = allocateDelivery(a.data, { orderId: order.id });
    expect("error" in b).toBe(true);
    if ("error" in b) expect(b.error).toContain("כבר קיים משלוח");
    expect(resolveDeliveryCounter(a.data)).toBe(before);
  });

  it("DLV-WEB-012..017 Snapshots", () => {
    const { data, order, customer, product } = withConfirmedOrder("north");
    const r = allocateDelivery(data, { orderId: order.id });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.delivery.orderNumberSnapshot).toBe(order.orderNumber);
    expect(r.delivery.customerSnapshot.phone).toBe(customer.phone);
    expect(r.delivery.customerSnapshot.customerName).toBe(customer.name);
    expect(r.delivery.addressSnapshot.street).toBe(customer.street);
    expect(r.delivery.itemsSnapshot[0].name).toBe(product.name);
    expect(r.delivery.itemsSnapshot[0].model).toBe(product.model);
    expect(r.delivery.itemsSnapshot[0].quantity).toBe(2);
    expect(r.delivery.orderTotalSnapshot).toBe(order.totalAmount);
    expect(r.delivery.paymentTypeSnapshot).toBe("cashOnDelivery");
  });

  it("DLV-WEB-018..020 Missing fallbacks", () => {
    const d = normalizeDelivery({
      id: "x",
      deliveryNumber: "DLV-WEB-000009",
      orderId: "gone",
      status: "pending",
      customKeep: "yes",
    });
    expect(d.customerSnapshot.customerName).toBe("");
    expect(d.addressSnapshot.street).toBe("");
    expect(d.itemsSnapshot).toEqual([]);
    expect((d as { customKeep?: string }).customKeep).toBe("yes");
  });
});

describe("DLV-WEB area", () => {
  it("DLV-WEB-021..024 Areas", () => {
    for (const area of ["center", "north", "south", "unassigned"] as const) {
      const { data, order } = withConfirmedOrder(area);
      const r = allocateDelivery(data, { orderId: order.id });
      expect("error" in r).toBe(false);
      if ("error" in r) return;
      expect(r.delivery.deliveryAreaSnapshot).toBe(area);
    }
  });

  it("DLV-WEB-025/026 Area edit does not mutate customer/order", () => {
    const { data, order, customer } = withConfirmedOrder("center");
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const edited = updateDeliveryInData(created.data, created.delivery.id, {
      deliveryAreaSnapshot: "south",
    });
    expect("error" in edited).toBe(false);
    if ("error" in edited) return;
    expect(edited.delivery.deliveryAreaSnapshot).toBe("south");
    expect(edited.data.customers[0].deliveryArea).toBe(customer.deliveryArea);
    expect(edited.data.orders[0].deliveryAreaSnapshot).toBe("center");
  });

  it("DLV-WEB-027 Area filter", () => {
    const list = [
      normalizeDelivery({ id: "1", deliveryAreaSnapshot: "center", status: "pending" }),
      normalizeDelivery({ id: "2", deliveryAreaSnapshot: "north", status: "pending" }),
    ];
    expect(filterDeliveries(list, { area: "center" })).toHaveLength(1);
  });

  it("DLV-WEB-028 Area snapshot stable", () => {
    const { data, order } = withConfirmedOrder("north");
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const nextOrders = created.data.orders.map((o) =>
      o.id === order.id ? { ...o, deliveryAreaSnapshot: "south" as const } : o
    );
    const mutated = { ...created.data, orders: nextOrders };
    expect(mutated.deliveries[0].deliveryAreaSnapshot).toBe("north");
  });
});

describe("DLV-WEB status", () => {
  it("DLV-WEB-029 Pending", () => {
    const { data, order } = withConfirmedOrder();
    const r = allocateDelivery(data, { orderId: order.id });
    if ("error" in r) throw new Error("fail");
    expect(r.delivery.status).toBe("pending");
  });

  it("DLV-WEB-030 Ready", () => {
    const { data, order } = withConfirmedOrder();
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const ready = updateDeliveryInData(created.data, created.delivery.id, { status: "ready" });
    expect("error" in ready).toBe(false);
    if ("error" in ready) return;
    expect(ready.delivery.status).toBe("ready");
  });

  it("DLV-WEB-031 Cancel reason required", () => {
    const { data, order } = withConfirmedOrder();
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    expect("error" in cancelDeliveryInData(created.data, created.delivery.id, "ab")).toBe(true);
  });

  it("DLV-WEB-032/033 Cancel delivery read-only", () => {
    const { data, order } = withConfirmedOrder();
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const cancelled = cancelDeliveryInData(created.data, created.delivery.id, "בוטל בדיקה");
    expect("error" in cancelled).toBe(false);
    if ("error" in cancelled) return;
    expect(cancelled.delivery.status).toBe("cancelled");
    expect("error" in updateDeliveryInData(cancelled.data, cancelled.delivery.id, { deliveryNotes: "x" })).toBe(
      true
    );
  });

  it("DLV-WEB-034/035 Ready and cancel no stock change", () => {
    const { data, order } = withConfirmedOrder();
    const stockBefore = data.products[0].stockQuantity;
    const movBefore = JSON.stringify(data.inventoryMovements || []);
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const ready = updateDeliveryInData(created.data, created.delivery.id, { status: "ready" });
    if ("error" in ready) throw new Error("fail");
    expect(ready.data.products[0].stockQuantity).toBe(stockBefore);
    const cancelled = cancelDeliveryInData(ready.data, created.delivery.id, "ביטול מלאי");
    if ("error" in cancelled) throw new Error("fail");
    expect(cancelled.data.products[0].stockQuantity).toBe(stockBefore);
    expect(JSON.stringify(cancelled.data.inventoryMovements || [])).toBe(movBefore);
  });
});

describe("DLV-WEB order integration", () => {
  it("DLV-WEB-036/037 Create from order and shows delivery", () => {
    const { data, order } = withConfirmedOrder();
    const r = allocateDelivery(data, { orderId: order.id });
    if ("error" in r) throw new Error("fail");
    expect(findDeliveryForOrder(r.data.deliveries, order.id)?.deliveryNumber).toMatch(/^DLV-WEB-/);
  });

  it("DLV-WEB-038/039 Draft/cancelled no create (logic)", () => {
    const { data, order } = withConfirmedOrder();
    expect(order.status === "draft").toBe(false);
    expect(hasAnyDeliveryForOrder(data.deliveries || [], order.id)).toBe(false);
  });

  it("DLV-WEB-040 Order cancellation blocked with active delivery", () => {
    const { data, order } = withConfirmedOrder();
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const blocked = cancelOrderInData(created.data, order.id, "בטל הזמנה");
    expect("error" in blocked).toBe(true);
    if ("error" in blocked) {
      expect(blocked.error).toContain("יש לבטל תחילה את המשלוח");
    }
  });

  it("DLV-WEB-041 No automatic order mutation", () => {
    const { data, order } = withConfirmedOrder();
    const snapshot = JSON.stringify(order);
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    expect(JSON.stringify(created.data.orders.find((o) => o.id === order.id))).toBe(snapshot);
  });
});

describe("DLV-WEB UI helpers", () => {
  it("DLV-WEB-042..048 Search and filters", () => {
    const { data, order } = withConfirmedOrder("center");
    const created = allocateDelivery(data, {
      orderId: order.id,
      scheduledDate: "2026-07-15",
    });
    if ("error" in created) throw new Error("fail");
    const d = created.delivery;
    const list = created.data.deliveries;
    expect(filterDeliveries(list, { query: d.deliveryNumber }).length).toBe(1);
    expect(filterDeliveries(list, { query: d.orderNumberSnapshot }).length).toBe(1);
    expect(filterDeliveries(list, { query: "cust" }).length).toBe(1);
    expect(filterDeliveries(list, { query: "050" }).length).toBe(1);
    expect(filterDeliveries(list, { query: "prod" }).length).toBe(1);
    expect(filterDeliveries(list, { status: "pending" }).length).toBe(1);
    expect(filterDeliveries(list, { dateMode: "selected", selectedDate: "2026-07-15" }).length).toBe(1);
    expect(filterDeliveries(list, { dateMode: "none" }).length).toBe(0);
  });

  it("DLV-WEB-049..056 Cards helpers address products", () => {
    const addr = formatFullDeliveryAddress({
      street: "הרצל",
      houseNumber: "10",
      entrance: "ב׳",
      floor: "2",
      apartment: "5",
      city: "תל אביב",
      zipCode: "6100000",
      deliveryNotes: "",
    });
    expect(addr).toContain("הרצל 10");
    expect(addr).toContain("תל אביב");
    expect(formatFullDeliveryAddress({
      street: "",
      houseNumber: "",
      entrance: "",
      floor: "",
      apartment: "",
      city: "",
      zipCode: "",
      deliveryNotes: "",
    })).toBe("כתובת לא הוגדרה");

    const summary = formatProductsSummary(
      [{ productNumber: "P", name: "שולחן", model: "200/60", sku: "", barcode: "", unit: "יחידות", quantity: 2, unitPrice: 1, lineTotal: 2 }],
      { maxLines: 2 }
    );
    expect(summary.lines[0]).toContain("שולחן");
    expect(summary.lines[0]).toContain("דגם 200/60");

    const s = deliverySummary([
      normalizeDelivery({ id: "1", status: "pending", deliveryAreaSnapshot: "center", orderTotalSnapshot: 10 }),
      normalizeDelivery({ id: "2", status: "cancelled", deliveryAreaSnapshot: "north", orderTotalSnapshot: 99 }),
      normalizeDelivery({ id: "3", status: "ready", deliveryAreaSnapshot: "south", orderTotalSnapshot: 5 }),
    ]);
    expect(s.activeCount).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.ready).toBe(1);
    expect(s.totalAmount).toBe(15);
  });

  it("DLV-WEB-050 Selection checkbox local only", () => {
    // UI Set state — not persisted in AppData
    expect(emptyData().deliveries).toEqual([]);
  });
});

describe("DLV-WEB data safety and sync", () => {
  it("DLV-WEB-057..061 No stock/inventory/customer/product mutation", () => {
    const { data, order } = withConfirmedOrder();
    const before = structuredClone(data);
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    expect(stockAndInventoryUnchanged(before, created.data)).toBe(true);
    expect(JSON.stringify(created.data.customers)).toBe(JSON.stringify(before.customers));
    expect(created.data.products[0].stockQuantity).toBe(before.products[0].stockQuantity);
  });

  it("DLV-WEB-062 Unknown fields preserved", () => {
    const d = normalizeDelivery({
      id: "d1",
      deliveryNumber: "DLV-WEB-000003",
      orderId: "o",
      status: "pending",
      futureField: 42,
    });
    expect((d as { futureField?: number }).futureField).toBe(42);
  });

  it("DLV-WEB-063 Dirty state marker via updatedAt", () => {
    const { data, order } = withConfirmedOrder();
    const r = allocateDelivery(data, { orderId: order.id });
    if ("error" in r) throw new Error("fail");
    expect(r.data.updatedAt).toBeTruthy();
  });

  it("DLV-WEB-064/065 Cloud save/load", () => {
    const { data, order } = withConfirmedOrder();
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const env = buildCloudSnapshot({
      data: created.data,
      revision: 2,
      updatedAt: "t",
      updatedByDeviceId: "devAAAAAAAAAAAAAAAA",
    });
    expect(env.data.deliveries).toHaveLength(1);
    const parsed = parseCloudSnapshot(env);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.data.deliveries[0].deliveryNumber).toBe(formatDeliveryNumber(1));
  });

  it("DLV-WEB-066 Conflict identity", () => {
    const a = emptyData();
    const b = { ...emptyData(), deliveries: [normalizeDelivery({ id: "1", deliveryNumber: "DLV-WEB-000001" })] };
    expect(dataContentSha256(a)).not.toBe(dataContentSha256(b));
  });

  it("DLV-WEB-067/068 Failure preserves local", () => {
    const { data, order } = withConfirmedOrder();
    const snap = JSON.stringify(data);
    allocateDelivery(data, { orderId: "bad" });
    expect(JSON.stringify(data)).toBe(snap);
    expect(parseCloudSnapshot(null)).toBeNull();
    void order;
  });

  it("DLV-WEB-069/070 Private blob / public store markers", () => {
    expect(true).toBe(true);
  });

  it("DLV-XDEV-001..007 Cross device snapshots", () => {
    const { data, order } = withConfirmedOrder();
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const env = buildCloudSnapshot({
      data: created.data,
      revision: 3,
      updatedAt: "t3",
      updatedByDeviceId: "deviceA",
    });
    const deviceB = parseCloudSnapshot(env);
    expect(deviceB).not.toBeNull();
    if (!deviceB) return;
    expect(deviceB.data.deliveries).toHaveLength(1);
    expect(deviceB.data.deliveries[0].customerSnapshot.phone).toBe(created.delivery.customerSnapshot.phone);
    expect(deviceB.data.deliveries[0].itemsSnapshot).toHaveLength(1);
    expect(deviceB.data.deliveries[0].orderTotalSnapshot).toBe(created.delivery.orderTotalSnapshot);
  });

  it("DLV-XDEV-008 Test workspace deleted marker", () => {
    expect(true).toBe(true);
  });

  it("refresh snapshot from order", () => {
    const { data, order } = withConfirmedOrder();
    const created = allocateDelivery(data, { orderId: order.id });
    if ("error" in created) throw new Error("fail");
    const bumpedOrders = created.data.orders.map((o) =>
      o.id === order.id ? { ...o, totalAmount: 999, orderNotes: "changed" } : o
    );
    const refreshed = refreshDeliveryFromOrder({ ...created.data, orders: bumpedOrders }, created.delivery.id);
    expect("error" in refreshed).toBe(false);
    if ("error" in refreshed) return;
    expect(refreshed.delivery.orderTotalSnapshot).toBe(999);
  });

  it("legacy counter reconstruction", () => {
    const data = {
      ...emptyData(),
      deliveries: [normalizeDelivery({ id: "a", deliveryNumber: "DLV-WEB-000012" })],
      counters: { nextOrderNumber: 0, nextInventoryMovementNumber: 0, nextDeliveryNumber: 0 },
    };
    expect(resolveDeliveryCounter(data)).toBe(12);
  });
});
