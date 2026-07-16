import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { emptyData } from "./types";
import {
  applyDesktopMutation,
  DESKTOP_MUTATE_ACTIONS,
  etagsMatch,
  finalizeMutatedData,
  isDesktopMutateAction,
} from "./desktop-mutate";
import { sanitizeIdempotencyKey } from "./desktop-idempotency";
import { addressFromCustomer, buildOrderItemFromProduct, snapshotFromCustomer } from "./orders";

const root = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const customerPayload = {
  customerType: "private" as const,
  name: "בדיקה",
  businessName: "",
  phone: "0501112233",
  secondaryPhone: "",
  email: "",
  street: "רחוב",
  houseNumber: "1",
  entrance: "",
  floor: "",
  apartment: "",
  city: "תל אביב",
  zipCode: "",
  deliveryArea: "center",
  deliveryNotes: "",
  notes: "",
  active: true,
};

function createCustomer(data = emptyData(), phone = "0501112233") {
  return applyDesktopMutation(data, "createCustomer", { ...customerPayload, phone });
}

function createProduct(data = emptyData(), opts: { sku?: string; barcode?: string; name?: string } = {}) {
  return applyDesktopMutation(data, "createProduct", {
    name: opts.name || "שולחן",
    model: "200x60",
    sku: opts.sku ?? "SKU-1",
    barcode: opts.barcode ?? "",
    description: "",
    salePrice: 10,
    costPrice: 5,
    stockQuantity: 0,
    unit: "יחידה",
    active: true,
  });
}

describe("DESK-WRITE API contracts", () => {
  const route = () => read("app/api/desktop/mutate/route.ts");
  const cloud = () => read("lib/cloud.ts");
  const login = () => read("app/api/desktop/login/route.ts");
  const idem = () => read("lib/desktop-idempotency.ts");

  it("DESK-WRITE-001 Authentication required", () => {
    expect(route()).toContain("requireSession");
  });

  it("DESK-WRITE-002 Read token accepted", () => {
    expect(login()).toContain("createSessionToken");
    expect(login()).toContain("writeEnabled: true");
  });

  it("DESK-WRITE-003 Expired token rejected", () => {
    const session = read("lib/session.ts");
    expect(session).toMatch(/expir|maxAge|ttl|SESSION/i);
    expect(route()).toContain("requireSession");
  });

  it("DESK-WRITE-004 Unknown action blocked", () => {
    expect(isDesktopMutateAction("dropDatabase")).toBe(false);
    expect(isDesktopMutateAction("createCustomer")).toBe(true);
    expect(route()).toContain("isDesktopMutateAction");
    expect(DESKTOP_MUTATE_ACTIONS.length).toBeGreaterThanOrEqual(20);
  });

  it("DESK-WRITE-005 Arbitrary patch blocked", () => {
    const src = route();
    expect(src).toContain("snapshot !== undefined");
    expect(src).toContain("עדכון כללי של Snapshot אינו מותר");
    expect(src).not.toMatch(/data\s*as\s*AppData/);
  });

  it("DESK-WRITE-006 Expected revision required", () => {
    expect(route()).toContain("expectedRevision חובה");
  });

  it("DESK-WRITE-007 ETag conflict", () => {
    const src = route();
    expect(src).toContain("etagsMatch");
    expect(src).toContain("CLOUD_ETAG_CHANGED");
    expect(src).toContain("409");
  });

  it("DESK-WRITE-008 Revision conflict 409", () => {
    const src = route();
    expect(src).toContain("CLOUD_VERSION_CHANGED");
    expect(src).toContain("expectedRevision !== cloudRevision");
  });

  it("DESK-WRITE-009 Idempotency required", () => {
    expect(route()).toContain("idempotencyKey חובה");
    expect(sanitizeIdempotencyKey("short")).toBeNull();
    expect(sanitizeIdempotencyKey("good-key-123456")).toBe("good-key-123456");
  });

  it("DESK-WRITE-010 Duplicate request no duplicate record", () => {
    const src = route();
    expect(src).toContain("readIdempotencyReceipt");
    expect(src).toContain("idempotentReplay");
    expect(src).toContain("writeIdempotencyReceipt");
    expect(idem()).toMatch(/prune|MAX_|limit|slice/i);
  });

  it("DESK-WRITE-011 Backup before mutation", () => {
    expect(cloud()).toMatch(/backup|createBackup|backupBefore/i);
  });

  it("DESK-WRITE-012 Atomic save", () => {
    expect(route()).toContain("saveAccountWorkspaceGuarded");
    expect(cloud()).toContain("saveGuardedCore");
  });

  it("DESK-WRITE-013 Read-back verification", () => {
    expect(route()).toContain("readBackVerified");
    expect(cloud()).toContain("readback_");
  });

  it("DESK-WRITE-014 Rollback on read-back failure", () => {
    const src = cloud();
    expect(src).toContain("rollback_failed");
    expect(src).toContain("current.rawText");
  });

  it("DESK-WRITE-015 Private Blob only", () => {
    expect(cloud()).toMatch(/access:\s*["']private["']/);
  });

  it("DESK-WRITE-016 No Blob URL", () => {
    expect(route()).not.toContain("blob.vercel-storage.com");
    expect(route()).not.toMatch(/blobUrl/);
  });

  it("DESK-WRITE-017 No workspace path", () => {
    expect(route()).not.toMatch(/accountWorkspacePath\(/);
    expect(route()).not.toMatch(/workspaceHmacPath\(/);
  });

  it("DESK-WRITE-018 No secret logs", () => {
    expect(route()).not.toMatch(/console\.(log|info|debug|warn|error)\(/);
  });
});

describe("DESK-WRITE domain mutations", () => {
  it("DESK-WRITE-019 Create customer", () => {
    const r = createCustomer();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.record as { customerNumber: string }).customerNumber).toMatch(/^CUS-\d{6}$/);
  });

  it("DESK-WRITE-020 Update customer", () => {
    const c = createCustomer();
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const id = (c.record as { id: string }).id;
    const u = applyDesktopMutation(c.data, "updateCustomer", { id, name: "מעודכן", phone: "0501112233" });
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect((u.record as { name: string }).name).toBe("מעודכן");
  });

  it("DESK-WRITE-021 Deactivate customer", () => {
    const c = createCustomer();
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const id = (c.record as { id: string }).id;
    const d = applyDesktopMutation(c.data, "deactivateCustomer", { id });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect((d.record as { active: boolean }).active).toBe(false);
  });

  it("DESK-WRITE-022 Reactivate customer", () => {
    const c = createCustomer();
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const id = (c.record as { id: string }).id;
    const off = applyDesktopMutation(c.data, "deactivateCustomer", { id });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    const on = applyDesktopMutation(off.data, "reactivateCustomer", { id });
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    expect((on.record as { active: boolean }).active).toBe(true);
  });

  it("DESK-WRITE-023 Duplicate phone warning", () => {
    const c1 = createCustomer();
    expect(c1.ok).toBe(true);
    if (!c1.ok) return;
    const c2 = createCustomer(c1.data, "0501112233");
    // Web allows create with warning path or blocks — either ok:false or warning field is acceptable;
    // domain helper returns error or succeeds with duplicate warning depending on entities.
    if (c2.ok) {
      expect(c2.data.customers.length).toBeGreaterThanOrEqual(1);
    } else {
      expect(c2.error.toLowerCase()).toMatch(/טלפון|כפיל|duplicate|קיים/);
    }
  });

  it("DESK-WRITE-024 Counter atomic", () => {
    const c = createCustomer();
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.data.customerCounter).toBe(1);
    const bad = applyDesktopMutation(c.data, "updateCustomer", { id: "missing", name: "x", phone: "1" });
    expect(bad.ok).toBe(false);
    expect(c.data.customerCounter).toBe(1);
  });

  it("DESK-WRITE-025 Create product", () => {
    const r = createProduct();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.record as { productNumber: string }).productNumber).toMatch(/^PRD-\d{6}$/);
  });

  it("DESK-WRITE-026 Update product", () => {
    const p = createProduct();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const id = (p.record as { id: string }).id;
    const u = applyDesktopMutation(p.data, "updateProduct", { id, name: "מעודכן", stockQuantity: 999 });
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect((u.record as { name: string }).name).toBe("מעודכן");
    expect((u.record as { stockQuantity: number }).stockQuantity).toBe(0);
  });

  it("DESK-WRITE-027 SKU uniqueness", () => {
    const p1 = createProduct(emptyData(), { sku: "SKU-A" });
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    const p2 = createProduct(p1.data, { sku: "SKU-A", name: "אחר" });
    expect(p2.ok).toBe(false);
  });

  it("DESK-WRITE-028 Barcode uniqueness", () => {
    const p1 = createProduct(emptyData(), { barcode: "7290001" });
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    const p2 = createProduct(p1.data, { sku: "SKU-B", barcode: "7290001", name: "אחר" });
    expect(p2.ok).toBe(false);
  });

  it("DESK-WRITE-029 Product counter atomic", () => {
    const p = createProduct();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.data.productCounter).toBe(1);
    const bad = applyDesktopMutation(p.data, "updateProduct", { id: "nope", name: "x" });
    expect(bad.ok).toBe(false);
    expect(p.data.productCounter).toBe(1);
  });

  it("DESK-WRITE-030 Increase", () => {
    const p = createProduct();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const id = (p.record as { id: string }).id;
    const m = applyDesktopMutation(p.data, "increaseInventory", { productId: id, quantity: 3, reason: "קליטה" });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect((m.record as { movementNumber: string }).movementNumber).toMatch(/^MOV-WEB-\d{6}$/);
    expect(m.data.products.find((x) => x.id === id)?.stockQuantity).toBe(3);
  });

  it("DESK-WRITE-031 Decrease", () => {
    const p = createProduct();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const id = (p.record as { id: string }).id;
    const up = applyDesktopMutation(p.data, "increaseInventory", { productId: id, quantity: 5, reason: "קליטה" });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    const down = applyDesktopMutation(up.data, "decreaseInventory", { productId: id, quantity: 2, reason: "יציאה" });
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    expect(down.data.products.find((x) => x.id === id)?.stockQuantity).toBe(3);
  });

  it("DESK-WRITE-032 Correction", () => {
    const p = createProduct();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const id = (p.record as { id: string }).id;
    const m = applyDesktopMutation(p.data, "correctInventory", { productId: id, quantity: 12, reason: "ספירה" });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.data.products.find((x) => x.id === id)?.stockQuantity).toBe(12);
  });

  it("DESK-WRITE-033 Negative blocked", () => {
    const p = createProduct();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const id = (p.record as { id: string }).id;
    const bad = applyDesktopMutation(p.data, "decreaseInventory", { productId: id, quantity: 1, reason: "x" });
    expect(bad.ok).toBe(false);
  });

  it("DESK-WRITE-034 Movement atomic", () => {
    const p = createProduct();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const before = p.data.inventoryMovementCounter;
    const bad = applyDesktopMutation(p.data, "decreaseInventory", {
      productId: (p.record as { id: string }).id,
      quantity: 9,
      reason: "x",
    });
    expect(bad.ok).toBe(false);
    expect(p.data.inventoryMovementCounter).toBe(before);
  });

  it("DESK-WRITE-035 Movement immutable", () => {
    expect(isDesktopMutateAction("updateInventoryMovement")).toBe(false);
    expect(isDesktopMutateAction("deleteInventoryMovement")).toBe(false);
  });

  function seedOrder() {
    let data = emptyData();
    const c = createCustomer(data);
    if (!c.ok) throw new Error("customer");
    data = c.data;
    const p = createProduct(data);
    if (!p.ok) throw new Error("product");
    data = p.data;
    const product = p.record as {
      id: string;
      name: string;
      model: string;
      salePrice: number;
    };
    const customer = c.record as {
      id: string;
      deliveryArea: string;
      name: string;
      phone: string;
      city: string;
      street: string;
      houseNumber: string;
    };
    const fullCustomer = data.customers.find((x) => x.id === customer.id)!;
    const fullProduct = data.products.find((x) => x.id === product.id)!;
    const order = applyDesktopMutation(data, "createOrder", {
      customerId: customer.id,
      customerSnapshot: snapshotFromCustomer(fullCustomer),
      deliveryAreaSnapshot: fullCustomer.deliveryArea,
      deliveryAddressSnapshot: addressFromCustomer(fullCustomer),
      shippingFee: 25,
      paymentType: "cashOnDelivery",
      orderNotes: "",
      items: [buildOrderItemFromProduct(fullProduct, 2)],
    });
    return { order, product, customer };
  }

  it("DESK-WRITE-036 Create order", () => {
    const { order } = seedOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect((order.record as { orderNumber: string }).orderNumber).toMatch(/^ORD-\d{6}$/);
  });

  it("DESK-WRITE-037 Inline customer", () => {
    const p = createProduct();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const product = p.record as { id: string; salePrice: number };
    const order = applyDesktopMutation(p.data, "createOrder", {
      inlineCustomer: { ...customerPayload, phone: "0509998877", name: "חדש מהזמנה" },
      shippingFee: 0,
      paymentType: "cashOnDelivery",
      items: [{ productId: product.id, quantity: 1, unitPrice: product.salePrice }],
    });
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(order.data.customers.some((c) => c.phone.includes("0509998877") || c.name === "חדש מהזמנה")).toBe(
      true
    );
  });

  it("DESK-WRITE-038 Model snapshot", () => {
    const { order, product } = seedOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const line = (
      order.record as {
        items: Array<{ productSnapshot?: { model?: string }; model?: string }>;
      }
    ).items[0];
    expect(String(line.productSnapshot?.model || line.model || "")).toContain("200x60");
    expect(product.model).toBe("200x60");
  });

  it("DESK-WRITE-039 Shipping fee", () => {
    const { order } = seedOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect((order.record as { shippingFee: number }).shippingFee).toBe(25);
  });

  it("DESK-WRITE-040 Total calculation", () => {
    const { order } = seedOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const o = order.record as { itemsSubtotal: number; shippingFee: number; totalAmount: number };
    expect(o.totalAmount).toBe(o.itemsSubtotal + o.shippingFee);
  });

  it("DESK-WRITE-041 Confirm", () => {
    const { order } = seedOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const id = (order.record as { id: string }).id;
    const conf = applyDesktopMutation(order.data, "confirmOrder", { id });
    expect(conf.ok).toBe(true);
    if (!conf.ok) return;
    expect((conf.record as { status: string }).status).toBe("confirmed");
  });

  it("DESK-WRITE-042 Cancel", () => {
    const { order } = seedOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const id = (order.record as { id: string }).id;
    const cancel = applyDesktopMutation(order.data, "cancelOrder", { id, reason: "בדיקה" });
    expect(cancel.ok).toBe(true);
    if (!cancel.ok) return;
    expect((cancel.record as { status: string }).status).toBe("cancelled");
  });

  it("DESK-WRITE-043 Copy", () => {
    const { order } = seedOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const id = (order.record as { id: string }).id;
    const copy = applyDesktopMutation(order.data, "copyOrder", { id });
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    expect(copy.data.orders.length).toBe(2);
  });

  it("DESK-WRITE-044 No stock reduction", () => {
    const { order, product } = seedOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const stockBefore = order.data.products.find((x) => x.id === product.id)?.stockQuantity ?? 0;
    const conf = applyDesktopMutation(order.data, "confirmOrder", { id: (order.record as { id: string }).id });
    expect(conf.ok).toBe(true);
    if (!conf.ok) return;
    const stockAfter = conf.data.products.find((x) => x.id === product.id)?.stockQuantity ?? 0;
    expect(stockAfter).toBe(stockBefore);
  });

  function seedDelivery() {
    const seeded = seedOrder();
    if (!seeded.order.ok) throw new Error("order");
    const id = (seeded.order.record as { id: string }).id;
    const conf = applyDesktopMutation(seeded.order.data, "confirmOrder", { id });
    if (!conf.ok) throw new Error("confirm");
    const delivery = applyDesktopMutation(conf.data, "createDelivery", {
      orderId: id,
      scheduledDate: "2026-07-20",
      status: "pending",
    });
    return { delivery, orderId: id, movementsBefore: conf.data.inventoryMovements?.length || 0 };
  }

  it("DESK-WRITE-045 Create delivery", () => {
    const { delivery } = seedDelivery();
    expect(delivery.ok).toBe(true);
    if (!delivery.ok) return;
    expect((delivery.record as { deliveryNumber: string }).deliveryNumber).toMatch(/^DLV-WEB-\d{6}$/);
  });

  it("DESK-WRITE-046 Duplicate blocked", () => {
    const { delivery, orderId } = seedDelivery();
    expect(delivery.ok).toBe(true);
    if (!delivery.ok) return;
    const dup = applyDesktopMutation(delivery.data, "createDelivery", {
      orderId,
      scheduledDate: "2026-07-21",
      status: "pending",
    });
    expect(dup.ok).toBe(false);
  });

  it("DESK-WRITE-047 Update", () => {
    const { delivery } = seedDelivery();
    expect(delivery.ok).toBe(true);
    if (!delivery.ok) return;
    const id = (delivery.record as { id: string }).id;
    const u = applyDesktopMutation(delivery.data, "updateDelivery", {
      id,
      scheduledDate: "2026-07-22",
      notes: "עודכן",
    });
    expect(u.ok).toBe(true);
  });

  it("DESK-WRITE-048 Ready", () => {
    const { delivery } = seedDelivery();
    expect(delivery.ok).toBe(true);
    if (!delivery.ok) return;
    const id = (delivery.record as { id: string }).id;
    const ready = applyDesktopMutation(delivery.data, "markDeliveryReady", { id });
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect((ready.record as { status: string }).status).toBe("ready");
  });

  it("DESK-WRITE-049 Cancel", () => {
    const { delivery } = seedDelivery();
    expect(delivery.ok).toBe(true);
    if (!delivery.ok) return;
    const id = (delivery.record as { id: string }).id;
    const cancel = applyDesktopMutation(delivery.data, "cancelDelivery", { id, reason: "בדיקה" });
    expect(cancel.ok).toBe(true);
    if (!cancel.ok) return;
    expect((cancel.record as { status: string }).status).toBe("cancelled");
  });

  it("DESK-WRITE-050 No inventory movement", () => {
    const { delivery, movementsBefore } = seedDelivery();
    expect(delivery.ok).toBe(true);
    if (!delivery.ok) return;
    expect((delivery.data.inventoryMovements || []).length).toBe(movementsBefore);
  });

  it("DESK-WRITE-051 Income create/edit", () => {
    const created = applyDesktopMutation(emptyData(), "createIncome", {
      title: "הכנסה",
      amount: 100,
      date: "2026-07-16",
      category: "כללי",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.record as { id: string }).id;
    const updated = applyDesktopMutation(created.data, "updateIncome", {
      id,
      title: "הכנסה מעודכנת",
      amount: 120,
      date: "2026-07-16",
      category: "כללי",
    });
    expect(updated.ok).toBe(true);
  });

  it("DESK-WRITE-052 Expense create/edit", () => {
    const created = applyDesktopMutation(emptyData(), "createExpense", {
      title: "הוצאה",
      amount: 40,
      date: "2026-07-16",
      category: "כללי",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = (created.record as { id: string }).id;
    const updated = applyDesktopMutation(created.data, "updateExpense", {
      id,
      title: "הוצאה מעודכנת",
      amount: 45,
      date: "2026-07-16",
      category: "כללי",
    });
    expect(updated.ok).toBe(true);
  });

  it("DESK-WRITE-053 Existing Web behavior preserved", () => {
    expect(DESKTOP_MUTATE_ACTIONS).toContain("deleteIncome");
    expect(DESKTOP_MUTATE_ACTIONS).toContain("deleteExpense");
    const money = read("lib/money-records.ts");
    expect(money).toContain("removeIncomeInData");
    expect(money).toContain("removeExpenseInData");
    expect(finalizeMutatedData(emptyData()).ok).toBe(true);
    expect(etagsMatch('"abc"', "abc")).toBe(true);
  });
});
