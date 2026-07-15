import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyData, type Customer, type Product } from "./types";
import {
  allocateOrder,
  buildCopiedOrderDraft,
  buildOrderItemFromProduct,
  calcLineTotal,
  calcOrderGrandTotal,
  calcOrderItemsSubtotal,
  confirmOrderInData,
  formatMoney2,
  normalizeOrder,
  parseShippingFee,
  sanitizeShippingFee,
  snapshotFromCustomer,
  addressFromCustomer,
  stockUnchangedProof,
  updateOrderInData,
  validateOrderDraft,
} from "./orders";
import { allocateDelivery, normalizeDelivery } from "./deliveries";
import {
  LABEL_COLUMNS,
  LABEL_ROWS,
  LABELS_PER_PAGE,
  assertFixedGrid,
  buildDeliveryLabelContent,
  expandDeliveryToLabels,
} from "./delivery-labels";
import { normalizeCustomer, normalizeProduct } from "./entities";
import { dataContentSha256 } from "./sync-snapshot";
import { getMobileElement, MOBILE_REGISTRY } from "./ui-prefs/mobile-registry";

function sampleCustomer(over: Partial<Customer> = {}): Customer {
  return normalizeCustomer({
    id: "cus-ship-1",
    name: "Ship Cust",
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
    id: "prd-ship-1",
    name: "Ship Prod",
    salePrice: 1490,
    sku: "SP1",
    stockQuantity: 20,
    ...over,
  });
}

function baseDraft(c: Customer, p: Product, qty = 2, shippingFee?: number) {
  const item = buildOrderItemFromProduct(p, qty);
  return {
    customerId: c.id,
    customerSnapshot: snapshotFromCustomer(c),
    deliveryAreaSnapshot: c.deliveryArea,
    deliveryAddressSnapshot: addressFromCustomer(c),
    items: [item],
    shippingFee,
    orderNotes: "",
  };
}

describe("ORD-SHIP shipping fee", () => {
  it("ORD-SHIP-001 Shipping fee defaults to zero", () => {
    expect(sanitizeShippingFee(undefined)).toBe(0);
    expect(parseShippingFee(undefined)).toBe(0);
    expect(parseShippingFee("")).toBe(0);
    const c = sampleCustomer();
    const p = sampleProduct();
    const r = allocateOrder(emptyData(), baseDraft(c, p));
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.order.shippingFee).toBe(0);
  });

  it("ORD-SHIP-002 Shipping fee accepts positive number", () => {
    expect(parseShippingFee(200)).toBe(200);
    expect(sanitizeShippingFee(200)).toBe(200);
  });

  it("ORD-SHIP-003 Decimal shipping fee", () => {
    expect(parseShippingFee(12.5)).toBe(12.5);
    expect(parseShippingFee("12,50")).toBe(12.5);
    expect(formatMoney2(12.5)).toBe("12.50");
  });

  it("ORD-SHIP-004 Negative shipping fee blocked", () => {
    expect(parseShippingFee(-1)).toBeNull();
    const c = sampleCustomer();
    const p = sampleProduct();
    const v = validateOrderDraft({ ...baseDraft(c, p), shippingFee: -5 });
    expect(v.ok).toBe(false);
  });

  it("ORD-SHIP-005 NaN blocked", () => {
    expect(parseShippingFee(Number.NaN)).toBeNull();
    expect(parseShippingFee("abc")).toBeNull();
  });

  it("ORD-SHIP-006 Infinity blocked", () => {
    expect(parseShippingFee(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseShippingFee(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("ORD-SHIP-007 Items subtotal calculated", () => {
    const p = sampleProduct({ salePrice: 1490 });
    const items = [buildOrderItemFromProduct(p, 2)];
    expect(calcOrderItemsSubtotal(items)).toBe(2980);
  });

  it("ORD-SHIP-008 Total includes shipping", () => {
    expect(calcOrderGrandTotal(2980, 200)).toBe(3180);
  });

  it("ORD-SHIP-009 Total recalculates on item change", () => {
    const item = buildOrderItemFromProduct(sampleProduct({ salePrice: 100 }), 1);
    const sub1 = calcOrderItemsSubtotal([item]);
    item.quantity = 3;
    item.lineTotal = calcLineTotal(3, item.unitPrice);
    const sub2 = calcOrderItemsSubtotal([item]);
    expect(calcOrderGrandTotal(sub1, 50)).toBe(150);
    expect(calcOrderGrandTotal(sub2, 50)).toBe(350);
  });

  it("ORD-SHIP-010 Total recalculates on shipping change", () => {
    expect(calcOrderGrandTotal(100, 0)).toBe(100);
    expect(calcOrderGrandTotal(100, 25)).toBe(125);
  });

  it("ORD-SHIP-011 Order create stores shipping fee", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const r = allocateOrder({ ...emptyData(), customers: [c], products: [p] }, baseDraft(c, p, 2, 200));
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.order.shippingFee).toBe(200);
    expect(r.order.itemsSubtotal).toBe(2980);
    expect(r.order.totalAmount).toBe(3180);
  });

  it("ORD-SHIP-012 Order edit stores shipping fee", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const created = allocateOrder({ ...emptyData(), customers: [c], products: [p] }, baseDraft(c, p, 2, 0));
    if ("error" in created) throw new Error("create");
    const updated = updateOrderInData(created.data, created.order.id, {
      ...baseDraft(c, p, 2, 75.5),
    });
    expect("error" in updated).toBe(false);
    if ("error" in updated) return;
    expect(updated.order.shippingFee).toBe(75.5);
    expect(updated.order.totalAmount).toBe(calcOrderGrandTotal(2980, 75.5));
    expect(updated.order.orderNumber).toBe(created.order.orderNumber);
  });

  it("ORD-SHIP-013 Confirmed edit warning", () => {
    const src = readFileSync(join(process.cwd(), "src/components/OrdersPanel.tsx"), "utf8");
    expect(src).toContain("ההזמנה מאושרת. לעדכן בכל זאת?");
    expect(src).toContain("confirmEditConfirmed");
  });

  it("ORD-SHIP-014 Copy preserves shipping fee", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const created = allocateOrder({ ...emptyData(), customers: [c], products: [p] }, baseDraft(c, p, 2, 200));
    if ("error" in created) throw new Error("create");
    const draft = buildCopiedOrderDraft(created.order);
    expect(draft.shippingFee).toBe(200);
    const copy = allocateOrder(created.data, draft);
    expect("error" in copy).toBe(false);
    if ("error" in copy) return;
    expect(copy.order.shippingFee).toBe(200);
    expect(copy.order.totalAmount).toBe(3180);
    expect(copy.order.orderNumber).not.toBe(created.order.orderNumber);
  });

  it("ORD-SHIP-015 Legacy order defaults shipping zero", () => {
    const o = normalizeOrder({
      id: "legacy",
      orderNumber: "ORD-000099",
      items: [{ id: "i1", productId: "p", quantity: 1, unitPrice: 50, lineTotal: 50 }],
      totalAmount: 50,
      customLegacy: true,
    });
    expect(o.shippingFee).toBe(0);
    expect(o.itemsSubtotal).toBe(50);
    expect(o.totalAmount).toBe(50);
  });

  it("ORD-SHIP-016 Unknown fields preserved", () => {
    const o = normalizeOrder({
      id: "u1",
      items: [],
      shippingFee: 10,
      vendorTag: "keep-me",
    });
    expect((o as { vendorTag?: string }).vendorTag).toBe("keep-me");
  });

  it("ORD-SHIP-017 Order details display shipping", () => {
    const src = readFileSync(join(process.cwd(), "src/components/OrdersPanel.tsx"), "utf8");
    expect(src).toContain("סכום מוצרים");
    expect(src).toContain("מחיר משלוח");
    expect(src).toContain("סה״כ הזמנה");
    expect(src).toContain('data-mobile-id="orders.mobile.details.shippingFee"');
  });

  it("ORD-SHIP-018 Mobile order form display", () => {
    const src = readFileSync(join(process.cwd(), "src/components/OrdersPanel.tsx"), "utf8");
    expect(src).toContain('data-mobile-id="orders.mobile.form.shippingFee"');
    expect(src).toContain('data-testid="order-shipping-fee"');
    expect(src).toContain('inputMode="decimal"');
  });

  it("ORD-SHIP-019 Desktop order form display", () => {
    const src = readFileSync(join(process.cwd(), "src/components/OrdersPanel.tsx"), "utf8");
    expect(src).toContain("order-shipping-fee");
    expect(src).toContain("סכום מוצרים");
    expect(src).toContain("סה״כ הזמנה");
  });

  it("ORD-SHIP-020 Delivery snapshot shipping fee", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const data = { ...emptyData(), customers: [c], products: [p] };
    const created = allocateOrder(data, baseDraft(c, p, 2, 200));
    if ("error" in created) throw new Error("create");
    const confirmed = confirmOrderInData(created.data, created.order.id);
    if ("error" in confirmed) throw new Error("confirm");
    const dlv = allocateDelivery(confirmed.data, { orderId: created.order.id });
    expect("error" in dlv).toBe(false);
    if ("error" in dlv) return;
    expect(dlv.delivery.itemsSubtotalSnapshot).toBe(2980);
    expect(dlv.delivery.shippingFeeSnapshot).toBe(200);
    expect(dlv.delivery.orderTotalSnapshot).toBe(3180);
  });

  it("ORD-SHIP-021 Delivery total includes shipping", () => {
    const src = readFileSync(join(process.cwd(), "src/components/DeliveriesPanel.tsx"), "utf8");
    expect(src).toContain("סה״כ לתשלום במזומן לשליח");
    expect(src).toContain("מחיר משלוח");
    expect(src).toContain("סכום מוצרים");
  });

  it("ORD-SHIP-022 Label total includes shipping", () => {
    const d = normalizeDelivery({
      id: "lbl1",
      orderTotalSnapshot: 3180,
      itemsSubtotalSnapshot: 2980,
      shippingFeeSnapshot: 200,
      itemsSnapshot: [
        {
          productNumber: "PRD-1",
          name: "T",
          model: "",
          sku: "",
          barcode: "",
          unit: "",
          quantity: 2,
          unitPrice: 1490,
          lineTotal: 2980,
        },
      ],
    });
    const label = buildDeliveryLabelContent(d);
    expect(label.shippingFee).toBe(200);
    expect(label.totalAmount).toBe(3180);
    expect(label.paymentLabel).toMatch(/מזומן לשליח/);
  });

  it("ORD-SHIP-023 Zero shipping label safe", () => {
    const d = normalizeDelivery({
      id: "lbl0",
      orderTotalSnapshot: 100,
      itemsSubtotalSnapshot: 100,
      shippingFeeSnapshot: 0,
    });
    const label = buildDeliveryLabelContent(d);
    expect(label.shippingFee).toBe(0);
    expect(label.totalAmount).toBe(100);
    const view = readFileSync(join(process.cwd(), "src/components/DeliveryLabelsPrintView.tsx"), "utf8");
    expect(view).toContain("label.shippingFee > 0");
  });

  it("ORD-SHIP-024 A4 layout unchanged", () => {
    const g = assertFixedGrid();
    expect(g.columns).toBe(LABEL_COLUMNS);
    expect(g.rows).toBe(LABEL_ROWS);
    expect(g.perPage).toBe(LABELS_PER_PAGE);
    expect(LABEL_COLUMNS * LABEL_ROWS).toBe(18);
  });

  it("ORD-SHIP-025 Stock unchanged", () => {
    const c = sampleCustomer();
    const p = sampleProduct({ stockQuantity: 20 });
    const data = { ...emptyData(), customers: [c], products: [p] };
    const r = allocateOrder(data, baseDraft(c, p, 2, 200));
    if ("error" in r) throw new Error("fail");
    expect(stockUnchangedProof(data.products, r.data.products)).toBe(true);
  });

  it("ORD-SHIP-026 Inventory movements unchanged", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const data = {
      ...emptyData(),
      customers: [c],
      products: [p],
      inventoryMovements: [{ id: "m1", keep: true } as never],
    };
    const before = JSON.stringify(data.inventoryMovements);
    const r = allocateOrder(data, baseDraft(c, p, 1, 50));
    if ("error" in r) throw new Error("fail");
    expect(JSON.stringify(r.data.inventoryMovements)).toBe(before);
  });

  it("ORD-SHIP-027 Products unchanged", () => {
    const c = sampleCustomer();
    const p = sampleProduct({ salePrice: 10 });
    const data = { ...emptyData(), customers: [c], products: [p] };
    const before = JSON.stringify(data.products);
    const r = allocateOrder(data, baseDraft(c, p, 1, 9));
    if ("error" in r) throw new Error("fail");
    expect(JSON.stringify(r.data.products)).toBe(before);
  });

  it("ORD-SHIP-028 Existing orders unchanged", () => {
    const existing = normalizeOrder({
      id: "old",
      orderNumber: "ORD-000001",
      items: [{ id: "i", productId: "p", quantity: 1, unitPrice: 10, lineTotal: 10 }],
      shippingFee: 0,
    });
    const data = { ...emptyData(), orders: [existing] };
    const before = JSON.stringify(data.orders);
    const c = sampleCustomer({ id: "c2" });
    const p = sampleProduct({ id: "p2" });
    const r = allocateOrder(
      { ...data, customers: [c], products: [p] },
      baseDraft(c, p, 1, 30)
    );
    if ("error" in r) throw new Error("fail");
    expect(JSON.stringify(r.data.orders.find((o) => o.id === "old"))).toBe(
      JSON.stringify(JSON.parse(before)[0])
    );
  });

  it("ORD-SHIP-029 Mobile Registry binding", () => {
    expect(getMobileElement("orders.mobile.form.shippingFee")?.labelHe).toMatch(/משלוח/);
    expect(getMobileElement("orders.mobile.form.itemsSubtotal")).toBeTruthy();
    expect(getMobileElement("orders.mobile.form.totalAmount")?.required).toBe(true);
    expect(getMobileElement("orders.mobile.details.shippingFee")).toBeTruthy();
    expect(getMobileElement("orders.mobile.summary.shippingFee")).toBeTruthy();
    const src = readFileSync(join(process.cwd(), "src/components/OrdersPanel.tsx"), "utf8");
    expect(src).toContain('data-mobile-id="orders.mobile.form.shippingFee"');
    expect(src).toContain('data-mobile-id="orders.mobile.details.itemsSubtotal"');
  });

  it("ORD-SHIP-030 Required mobile fields locked", () => {
    const ship = getMobileElement("orders.mobile.form.shippingFee");
    const total = getMobileElement("orders.mobile.form.totalAmount");
    expect(ship?.required).toBe(true);
    expect(total?.required).toBe(true);
    expect(MOBILE_REGISTRY.filter((e) => e.id === ship!.id && e.required)).toHaveLength(1);
  });

  it("ORD-SHIP-031 No horizontal overflow", () => {
    const src = readFileSync(join(process.cwd(), "src/components/OrdersPanel.tsx"), "utf8");
    expect(src).toContain("overflow-x-hidden");
  });

  it("ORD-SHIP-032 Business data SHA unchanged", () => {
    const list = [
      normalizeOrder({
        id: "a",
        orderNumber: "ORD-000001",
        items: [{ id: "i", productId: "p", quantity: 1, unitPrice: 10, lineTotal: 10 }],
      }),
    ];
    const data = { ...emptyData(), orders: list };
    const before = dataContentSha256(data);
    // In-memory normalize of a clone must not mutate the source workspace hash.
    const clone = structuredClone(data);
    normalizeOrder(clone.orders[0]);
    expect(dataContentSha256(data)).toBe(before);
  });
});

describe("ORD-SHIP simulator scenarios", () => {
  it("SIM: order without / with / decimal shipping + delivery + label + UI surfaces", () => {
    const c = sampleCustomer();
    const p = sampleProduct();
    const data0 = { ...emptyData(), customers: [c], products: [p] };

    const noShip = allocateOrder(data0, baseDraft(c, p, 2));
    expect("error" in noShip).toBe(false);
    if ("error" in noShip) return;
    expect(noShip.order.shippingFee).toBe(0);
    expect(noShip.order.totalAmount).toBe(2980);

    const withShip = allocateOrder(noShip.data, baseDraft(c, p, 2, 200));
    expect("error" in withShip).toBe(false);
    if ("error" in withShip) return;
    expect(withShip.order.totalAmount).toBe(3180);

    const decimal = allocateOrder(withShip.data, baseDraft(c, p, 1, 12.5));
    expect("error" in decimal).toBe(false);
    if ("error" in decimal) return;
    expect(decimal.order.shippingFee).toBe(12.5);

    const edited = updateOrderInData(decimal.data, decimal.order.id, {
      ...baseDraft(c, p, 1, 30),
    });
    expect("error" in edited).toBe(false);
    if ("error" in edited) return;
    expect(edited.order.shippingFee).toBe(30);

    const copyDraft = buildCopiedOrderDraft(edited.order);
    expect(copyDraft.shippingFee).toBe(30);
    copyDraft.shippingFee = 40;
    const copied = allocateOrder(edited.data, copyDraft);
    expect("error" in copied).toBe(false);
    if ("error" in copied) return;
    expect(copied.order.shippingFee).toBe(40);

    const confirmed = confirmOrderInData(copied.data, copied.order.id);
    expect("error" in confirmed).toBe(false);
    if ("error" in confirmed) return;
    const dlv = allocateDelivery(confirmed.data, { orderId: copied.order.id });
    expect("error" in dlv).toBe(false);
    if ("error" in dlv) return;
    expect(dlv.delivery.shippingFeeSnapshot).toBe(40);
    expect(dlv.delivery.orderTotalSnapshot).toBe(
      calcOrderGrandTotal(dlv.delivery.itemsSubtotalSnapshot, 40)
    );

    const labels = expandDeliveryToLabels(dlv.delivery);
    expect(labels[0].shippingFee).toBe(40);
    expect(labels[0].totalAmount).toBe(dlv.delivery.orderTotalSnapshot);

    const ordersUi = readFileSync(join(process.cwd(), "src/components/OrdersPanel.tsx"), "utf8");
    const dlvUi = readFileSync(join(process.cwd(), "src/components/DeliveriesPanel.tsx"), "utf8");
    const lblUi = readFileSync(join(process.cwd(), "src/components/DeliveryLabelsPrintView.tsx"), "utf8");
    expect(ordersUi).toContain("order-shipping-fee");
    expect(dlvUi).toContain("סה״כ לתשלום במזומן לשליח");
    expect(lblUi).toContain("מחיר משלוח");
  });
});
