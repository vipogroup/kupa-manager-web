import { describe, expect, it } from "vitest";
import { emptyData } from "./types";
import { allocateProduct } from "./entities";
import {
  approveCorAtomic,
  buildPublicCatalog,
  rejectCor,
  validateAndCreateOrderRequest,
} from "./customer-order-requests";

describe("Customer Order Requests", () => {
  it("COR-001 public catalog only visible products", () => {
    let data = emptyData();
    const p1 = allocateProduct(data, {
      name: "Visible",
      model: "A",
      sku: "V1",
      barcode: "",
      description: "",
      salePrice: 10,
      costPrice: 1,
      stockQuantity: 0,
      unit: "יחידה",
      active: true,
      visibleOnCustomerOrderForm: true,
    });
    expect("error" in p1).toBe(false);
    if ("error" in p1) return;
    data = p1.data;
    const p2 = allocateProduct(data, {
      name: "Hidden",
      model: "B",
      sku: "H1",
      barcode: "",
      description: "",
      salePrice: 20,
      costPrice: 1,
      stockQuantity: 0,
      unit: "יחידה",
      active: true,
      visibleOnCustomerOrderForm: false,
    });
    expect("error" in p2).toBe(false);
    if ("error" in p2) return;
    data = p2.data;
    const cat = buildPublicCatalog(data.products);
    expect(cat.length).toBe(1);
    expect(cat[0].name).toBe("Visible");
  });

  it("COR-002 submit + approve atomic creates order/delivery", () => {
    let data = emptyData();
    const p = allocateProduct(data, {
      name: "שולחן",
      model: "200",
      sku: "T1",
      barcode: "",
      description: "",
      salePrice: 100,
      costPrice: 40,
      stockQuantity: 0,
      unit: "יחידה",
      active: true,
      visibleOnCustomerOrderForm: true,
    });
    if ("error" in p) throw new Error(p.error);
    data = p.data;

    const sub = validateAndCreateOrderRequest(
      data,
      {
        fullName: "CUSTOMER-FORM-LIVE-TEST",
        phone: "0501234567",
        city: "חיפה",
        street: "הרצל",
        houseNumber: "1",
        items: [{ productId: p.product.id, quantity: 2 }],
        consentAccepted: true,
        idempotencyKey: "idem-cor-002-aaaaaaaa",
        requestedPaymentMethod: "cashOnDelivery",
        cashCollectionRequested: 200,
      },
      { sourceIpHash: "abc", userAgentSummary: "test", publicFormVersion: "1" }
    );
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    data = sub.data;
    expect(sub.request.requestNumber).toMatch(/^COR-\d{6}$/);

    const dup = validateAndCreateOrderRequest(
      data,
      {
        fullName: "CUSTOMER-FORM-LIVE-TEST",
        phone: "0501234567",
        city: "חיפה",
        street: "הרצל",
        houseNumber: "1",
        items: [{ productId: p.product.id, quantity: 2 }],
        consentAccepted: true,
        idempotencyKey: "idem-cor-002-aaaaaaaa",
      },
      { sourceIpHash: "abc", userAgentSummary: "test", publicFormVersion: "1" }
    );
    expect(dup.ok && dup.duplicate).toBe(true);

    const appr = approveCorAtomic(data, {
      id: sub.request.id,
      reviewer: "tester",
      createDelivery: true,
      scheduledDate: "2026-07-20",
    });
    expect("error" in appr).toBe(false);
    if ("error" in appr) return;
    expect(appr.request.status).toBe("Approved");
    expect(appr.request.createdOrderId).toBeTruthy();
    expect(appr.request.createdDeliveryId).toBeTruthy();
    expect(appr.request.createdCustomerId).toBeTruthy();
    expect((appr.data.orders || []).length).toBe(1);
    expect((appr.data.deliveries || []).length).toBe(1);
    expect((appr.data.customers || []).length).toBe(1);

    const again = approveCorAtomic(appr.data, { id: sub.request.id, reviewer: "tester" });
    expect("error" in again).toBe(false);
    if ("error" in again) return;
    expect((again.data.orders || []).length).toBe(1);
  });

  it("COR-003 reject does not create order", () => {
    let data = emptyData();
    const p = allocateProduct(data, {
      name: "כיסא",
      model: "",
      sku: "C1",
      barcode: "",
      description: "",
      salePrice: 50,
      costPrice: 10,
      stockQuantity: 0,
      unit: "יחידה",
      active: true,
      visibleOnCustomerOrderForm: true,
    });
    if ("error" in p) throw new Error(p.error);
    data = p.data;
    const sub = validateAndCreateOrderRequest(
      data,
      {
        fullName: "Test",
        phone: "0529999888",
        city: "א",
        street: "ב",
        houseNumber: "3",
        items: [{ productId: p.product.id, quantity: 1 }],
        consentAccepted: true,
        idempotencyKey: "idem-cor-003-bbbbbbbb",
      },
      { sourceIpHash: "x", userAgentSummary: "t", publicFormVersion: "1" }
    );
    if (!sub.ok) throw new Error(sub.error);
    const rej = rejectCor(sub.data, sub.request.id, "לא זמין", "mgr");
    expect("error" in rej).toBe(false);
    if ("error" in rej) return;
    expect(rej.request.status).toBe("Rejected");
    expect((rej.data.orders || []).length).toBe(0);
  });

  it("COR-004 honeypot and consent", () => {
    const data = emptyData();
    const bad = validateAndCreateOrderRequest(
      data,
      {
        fullName: "A",
        phone: "0501111111",
        city: "c",
        street: "s",
        houseNumber: "1",
        items: [],
        consentAccepted: false,
        idempotencyKey: "idem-x",
        honeypot: "spam",
      },
      { sourceIpHash: "x", userAgentSummary: "t", publicFormVersion: "1" }
    );
    expect(bad.ok).toBe(false);
  });

  it("COR-005 reject without reason fails; approve after reject blocked", () => {
    let data = emptyData();
    const p = allocateProduct(data, {
      name: "מוצר",
      model: "",
      sku: "X1",
      barcode: "",
      description: "",
      salePrice: 10,
      costPrice: 1,
      stockQuantity: 0,
      unit: "יחידה",
      active: true,
      visibleOnCustomerOrderForm: true,
    });
    if ("error" in p) throw new Error(p.error);
    data = p.data;
    const sub = validateAndCreateOrderRequest(
      data,
      {
        fullName: "Test",
        phone: "0502222333",
        city: "תל אביב",
        street: "דיזנגוף",
        houseNumber: "10",
        items: [{ productId: p.product.id, quantity: 1 }],
        consentAccepted: true,
        idempotencyKey: "idem-cor-005-cccccccc",
      },
      { sourceIpHash: "x", userAgentSummary: "t", publicFormVersion: "1" }
    );
    if (!sub.ok) throw new Error(sub.error);
    const noReason = rejectCor(sub.data, sub.request.id, "ab", "mgr");
    expect("error" in noReason).toBe(true);
    const rej = rejectCor(sub.data, sub.request.id, "מלאי חסר", "mgr");
    if ("error" in rej) throw new Error(rej.error);
    const appr = approveCorAtomic(rej.data, { id: sub.request.id, reviewer: "mgr" });
    expect("error" in appr).toBe(true);
  });

  it("COR-006 sanitizes script-like notes and preserves snapshots if product later hidden", () => {
    let data = emptyData();
    const p = allocateProduct(data, {
      name: "ספה",
      model: "L",
      sku: "S1",
      barcode: "",
      description: "",
      salePrice: 999,
      costPrice: 100,
      stockQuantity: 0,
      unit: "יחידה",
      active: true,
      visibleOnCustomerOrderForm: true,
    });
    if ("error" in p) throw new Error(p.error);
    data = p.data;
    const sub = validateAndCreateOrderRequest(
      data,
      {
        fullName: "CUSTOMER-FORM-LIVE-TEST-SNAP",
        phone: "0503333444",
        city: "ירושלים",
        street: "יפו",
        houseNumber: "5",
        items: [{ productId: p.product.id, quantity: 1, notes: '<script>alert(1)</script>hello' }],
        consentAccepted: true,
        idempotencyKey: "idem-cor-006-dddddddd",
        customerNotes: "<b>hi</b>",
      },
      { sourceIpHash: "x", userAgentSummary: "t", publicFormVersion: "1" }
    );
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    expect(sub.request.requestedItems[0].notes).not.toContain("<script>");
    expect(sub.request.customerNotes).not.toContain("<b>");
    // Hide product — snapshot must remain approvable
    data = {
      ...sub.data,
      products: sub.data.products.map((x) =>
        x.id === p.product.id ? { ...x, visibleOnCustomerOrderForm: false, active: false } : x
      ),
    };
    const appr = approveCorAtomic(data, { id: sub.request.id, reviewer: "mgr", createDelivery: false });
    expect("error" in appr).toBe(false);
    if ("error" in appr) return;
    expect(appr.request.status).toBe("Approved");
    expect(appr.data.orders?.[0]?.items?.[0]?.productSnapshot.name).toBe("ספה");
  });
});
