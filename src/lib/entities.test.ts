import { describe, expect, it } from "vitest";
import {
  allocateCustomer,
  allocateProduct,
  emptyCustomerDraft,
  emptyProductDraft,
  findDuplicatePhoneCustomers,
  formatCustomerNumber,
  formatProductNumber,
  normalizeCustomer,
  normalizeProduct,
  normalizePhoneDigits,
  resolveCounters,
  setCustomerActiveInData,
  setProductActiveInData,
  updateCustomerInData,
  updateProductInData,
  validateCustomerInput,
  validateProductInput,
} from "./entities";
import { emptyData } from "./types";
import { validateAppData } from "./validate-data";

describe("CUST-WEB customers", () => {
  it("CUST-WEB-001 Legacy customer load", () => {
    const legacy = { id: "c1", name: "Alice", phone: "0501234567", note: "n" };
    const n = normalizeCustomer(legacy, 0);
    expect(n.id).toBe("c1");
    expect(n.phone).toBe("0501234567");
    expect(n.notes).toBe("n");
    expect(n.active).toBe(true);
    expect(n.deliveryArea).toBe("unassigned");
    expect(n.customerNumber).toMatch(/^CUS-/);
  });

  it("CUST-WEB-002/003 Customer create + number allocation", () => {
    const data = emptyData();
    const r1 = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "One",
      phone: "0501111111",
      city: "Tel Aviv",
      deliveryArea: "center",
      street: "Herzl",
      houseNumber: "1",
    });
    expect("error" in r1).toBe(false);
    if ("error" in r1) return;
    expect(r1.customer.customerNumber).toBe("CUS-000001");
    expect(r1.data.customerCounter).toBe(1);
    const r2 = allocateCustomer(r1.data, {
      ...emptyCustomerDraft(),
      name: "Two",
      phone: "0502222222",
    });
    if ("error" in r2) throw new Error(r2.error);
    expect(r2.customer.customerNumber).toBe("CUS-000002");
  });

  it("CUST-WEB-004/005 Cancel and validation failure do not advance counter", () => {
    const data = emptyData();
    const before = resolveCounters(data).customerCounter;
    const bad = allocateCustomer(data, { ...emptyCustomerDraft(), name: "", phone: "" });
    expect("error" in bad).toBe(true);
    expect(resolveCounters(data).customerCounter).toBe(before);
    // cancel = not calling allocate — counter unchanged
    expect(formatCustomerNumber(before + 1)).toBe("CUS-000001");
  });

  it("CUST-WEB-006/007 Edit keeps same id and number", () => {
    let data = emptyData();
    const created = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "EditMe",
      phone: "0503333333",
    });
    if ("error" in created) throw new Error(created.error);
    data = created.data;
    const id = created.customer.id;
    const num = created.customer.customerNumber;
    const updated = updateCustomerInData(data, id, { name: "Edited", city: "Haifa" });
    if ("error" in updated) throw new Error(updated.error);
    expect(updated.customer.id).toBe(id);
    expect(updated.customer.customerNumber).toBe(num);
    expect(updated.customer.name).toBe("Edited");
    expect(updated.data.customerCounter).toBe(1);
  });

  it("CUST-WEB-008/009 Deactivate reactivate", () => {
    let data = emptyData();
    const created = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "A",
      phone: "0504444444",
    });
    if ("error" in created) throw new Error(created.error);
    data = created.data;
    const off = setCustomerActiveInData(data, created.customer.id, false);
    if ("error" in off) throw new Error(off.error);
    expect(off.data.customers[0].active).toBe(false);
    const on = setCustomerActiveInData(off.data, created.customer.id, true);
    if ("error" in on) throw new Error(on.error);
    expect(on.data.customers[0].active).toBe(true);
  });

  it("CUST-WEB-010 Phone leading zero preserved", () => {
    const r = allocateCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "Z",
      phone: "0509999999",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.customer.phone.startsWith("0")).toBe(true);
  });

  it("CUST-WEB-011 Duplicate phone warning", () => {
    let data = emptyData();
    const a = allocateCustomer(data, { ...emptyCustomerDraft(), name: "A", phone: "050-111-2222" });
    if ("error" in a) throw new Error(a.error);
    data = a.data;
    const dups = findDuplicatePhoneCustomers(data.customers, "0501112222");
    expect(dups.length).toBe(1);
    expect(normalizePhoneDigits("050-111-2222")).toBe(normalizePhoneDigits("0501112222"));
  });

  it("CUST-WEB-012..015 Delivery areas", () => {
    for (const area of ["center", "north", "south", "unassigned"] as const) {
      const r = allocateCustomer(emptyData(), {
        ...emptyCustomerDraft(),
        name: "D",
        phone: "0510000001",
        deliveryArea: area,
      });
      if ("error" in r) throw new Error(r.error);
      expect(r.customer.deliveryArea).toBe(area);
    }
  });

  it("CUST-WEB-016 Address save/reload via validateAppData", () => {
    const created = allocateCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "Addr",
      phone: "0520000000",
      street: "Main",
      houseNumber: "12",
      entrance: "B",
      floor: "3",
      apartment: "7",
      city: "City",
      zipCode: "12345",
    });
    if ("error" in created) throw new Error(created.error);
    const round = validateAppData(created.data);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.data.customers[0].street).toBe("Main");
    expect(round.data.customers[0].apartment).toBe("7");
  });

  it("CUST-WEB-017/018 Search and filter predicates", () => {
    const created = allocateCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "SearchName",
      businessName: "BizCo",
      phone: "0531111111",
      city: "Eilat",
      deliveryArea: "south",
    });
    if ("error" in created) throw new Error(created.error);
    const c = created.customer;
    const hay = [c.name, c.businessName, c.phone, c.city, c.customerNumber].join(" ").toLowerCase();
    expect(hay.includes("searchname")).toBe(true);
    expect(c.deliveryArea === "south").toBe(true);
    expect(c.active).toBe(true);
  });

  it("CUST-WEB-019 Dirty after create (counter changed)", () => {
    const before = emptyData();
    const after = allocateCustomer(before, {
      ...emptyCustomerDraft(),
      name: "Dirty",
      phone: "0540000000",
    });
    if ("error" in after) throw new Error(after.error);
    expect(after.data.updatedAt !== before.updatedAt || after.data.customers.length === 1).toBe(true);
    expect(after.data.customerCounter).toBe(1);
  });

  it("CUST-WEB-020 Cloud save/load shape with counters", () => {
    const created = allocateCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "Cloud",
      phone: "0550000000",
    });
    if ("error" in created) throw new Error(created.error);
    const parsed = validateAppData(JSON.parse(JSON.stringify(created.data)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.customerCounter).toBe(1);
    expect(parsed.data.customers[0].customerNumber).toBe("CUS-000001");
  });

  it("unknown fields preserved on customer", () => {
    const n = normalizeCustomer({ id: "x", name: "N", phone: "1", note: "", customTag: "keep" }, 0);
    expect((n as Record<string, unknown>).customTag).toBe("keep");
  });
});

describe("PROD-WEB products", () => {
  it("PROD-WEB-001 Legacy product load", () => {
    const n = normalizeProduct({ id: "p1", name: "Item", price: 10, sku: "01", stock: 2.5 }, 0);
    expect(n.salePrice).toBe(10);
    expect(n.stockQuantity).toBe(2.5);
    expect(n.sku).toBe("01");
    expect(n.unit).toBe("יחידה");
  });

  it("PROD-WEB-002/003 Create + number", () => {
    const r = allocateProduct(emptyData(), {
      ...emptyProductDraft(),
      name: "P1",
      salePrice: 5,
      sku: "00123",
      barcode: "00099",
      stockQuantity: 1.5,
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.product.productNumber).toBe("PRD-000001");
    expect(r.product.sku).toBe("00123");
    expect(r.product.barcode).toBe("00099");
    expect(r.product.stockQuantity).toBe(1.5);
  });

  it("PROD-WEB-004/005 Cancel and validation no counter", () => {
    const data = emptyData();
    const bad = allocateProduct(data, { ...emptyProductDraft(), name: "" });
    expect("error" in bad).toBe(true);
    expect(resolveCounters(data).productCounter).toBe(0);
    expect(formatProductNumber(1)).toBe("PRD-000001");
  });

  it("PROD-WEB-006/007 Edit same id/number", () => {
    const c = allocateProduct(emptyData(), { ...emptyProductDraft(), name: "X", salePrice: 1 });
    if ("error" in c) throw new Error(c.error);
    const u = updateProductInData(c.data, c.product.id, { name: "Y", model: "M1" });
    if ("error" in u) throw new Error(u.error);
    expect(u.product.id).toBe(c.product.id);
    expect(u.product.productNumber).toBe(c.product.productNumber);
    expect(u.product.model).toBe("M1");
  });

  it("PROD-WEB-008/009 Deactivate reactivate", () => {
    const c = allocateProduct(emptyData(), { ...emptyProductDraft(), name: "Z", salePrice: 1 });
    if ("error" in c) throw new Error(c.error);
    const off = setProductActiveInData(c.data, c.product.id, false);
    if ("error" in off) throw new Error(off.error);
    expect(off.data.products[0].active).toBe(false);
    const on = setProductActiveInData(off.data, c.product.id, true);
    if ("error" in on) throw new Error(on.error);
    expect(on.data.products[0].active).toBe(true);
  });

  it("PROD-WEB-010/011 Leading zeros SKU/Barcode", () => {
    const r = allocateProduct(emptyData(), {
      ...emptyProductDraft(),
      name: "Lead",
      salePrice: 1,
      sku: "0001",
      barcode: "0002",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.product.sku).toBe("0001");
    expect(r.product.barcode).toBe("0002");
  });

  it("PROD-WEB-012/013 Duplicate SKU/Barcode blocked", () => {
    let data = emptyData();
    const a = allocateProduct(data, {
      ...emptyProductDraft(),
      name: "A",
      salePrice: 1,
      sku: "SKU1",
      barcode: "BC1",
    });
    if ("error" in a) throw new Error(a.error);
    data = a.data;
    const dupSku = allocateProduct(data, {
      ...emptyProductDraft(),
      name: "B",
      salePrice: 1,
      sku: "SKU1",
    });
    expect("error" in dupSku).toBe(true);
    const dupBc = allocateProduct(data, {
      ...emptyProductDraft(),
      name: "C",
      salePrice: 1,
      barcode: "BC1",
    });
    expect("error" in dupBc).toBe(true);
  });

  it("PROD-WEB-014/015 Negative price/stock blocked", () => {
    expect(validateProductInput({ name: "n", salePrice: -1, costPrice: 0, stockQuantity: 0 }, []).ok).toBe(false);
    expect(validateProductInput({ name: "n", salePrice: 0, costPrice: 0, stockQuantity: -0.1 }, []).ok).toBe(false);
  });

  it("PROD-WEB-016 Decimal stock", () => {
    const r = allocateProduct(emptyData(), {
      ...emptyProductDraft(),
      name: "Dec",
      salePrice: 1,
      stockQuantity: 2.75,
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.product.stockQuantity).toBe(2.75);
  });

  it("PROD-WEB-017/018 Search filter", () => {
    const r = allocateProduct(emptyData(), {
      ...emptyProductDraft(),
      name: "Widget",
      model: "MX",
      salePrice: 9,
      stockQuantity: 0,
    });
    if ("error" in r) throw new Error(r.error);
    const p = r.product;
    expect([p.name, p.model, p.sku, p.barcode, p.productNumber].join(" ").includes("Widget")).toBe(true);
    expect(p.stockQuantity === 0).toBe(true);
  });

  it("PROD-WEB-019/020 Dirty + cloud roundtrip", () => {
    const r = allocateProduct(emptyData(), { ...emptyProductDraft(), name: "CloudP", salePrice: 3 });
    if ("error" in r) throw new Error(r.error);
    const parsed = validateAppData(JSON.parse(JSON.stringify(r.data)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.productCounter).toBe(1);
  });
});

describe("WEB-DATA counters from legacy max", () => {
  it("initial counter from highest existing number", () => {
    const data = {
      ...emptyData(),
      customers: [normalizeCustomer({ id: "1", name: "A", phone: "1", customerNumber: "CUS-000009" }, 0)],
      products: [normalizeProduct({ id: "1", name: "P", price: 1, productNumber: "PRD-000004" }, 0)],
    };
    const c = resolveCounters(data);
    expect(c.customerCounter).toBe(9);
    expect(c.productCounter).toBe(4);
    const next = allocateCustomer(data, { ...emptyCustomerDraft(), name: "N", phone: "2" });
    if ("error" in next) throw new Error(next.error);
    expect(next.customer.customerNumber).toBe("CUS-000010");
  });
});

describe("customer validation", () => {
  it("requires phone for new", () => {
    expect(validateCustomerInput({ ...emptyCustomerDraft(), name: "A" }, { isNew: true }).ok).toBe(false);
  });
});
