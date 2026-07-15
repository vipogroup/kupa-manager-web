import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyData, type Customer, type Product } from "./types";
import {
  allocateOrder,
  buildCopiedOrderDraft,
  buildOrderItemFromProduct,
  formatProductModelDisplay,
  normalizeProductSearchText,
  productMatchesSearchQuery,
  snapshotFromCustomer,
  addressFromCustomer,
  snapshotFromProduct,
  stockUnchangedProof,
} from "./orders";
import { normalizeCustomer, normalizeProduct } from "./entities";
import { getMobileElement } from "./ui-prefs/mobile-registry";
import { dataContentSha256 } from "./sync-snapshot";

function sampleCustomer(): Customer {
  return normalizeCustomer({
    id: "cus-m1",
    name: "Model Cust",
    phone: "0501111111",
    city: "City",
    deliveryArea: "center",
    street: "St",
    houseNumber: "1",
  });
}

function sampleProduct(over: Partial<Product> = {}): Product {
  return normalizeProduct({
    id: "prd-m1",
    name: "שולחן",
    model: "200/60",
    salePrice: 100,
    sku: "TBL-200",
    barcode: "729000111",
    stockQuantity: 8,
    ...over,
  });
}

describe("ORD-MODEL product picker model/size", () => {
  it("ORD-MODEL-001 format shows מידה/דגם", () => {
    expect(formatProductModelDisplay("200×60")).toBe("מידה/דגם: 200×60");
  });

  it("ORD-MODEL-002 empty model falls back to product number", () => {
    expect(formatProductModelDisplay("", { productNumber: "PRD-000009" })).toBe("מס׳ מוצר: PRD-000009");
  });

  it("ORD-MODEL-003 empty model falls back to SKU", () => {
    expect(formatProductModelDisplay("", { sku: "SKU9" })).toBe("מק״ט: SKU9");
  });

  it("ORD-MODEL-004 star/x/× search normalization", () => {
    expect(normalizeProductSearchText("200×60")).toBe("200*60");
    expect(normalizeProductSearchText("200x60")).toBe("200*60");
    expect(normalizeProductSearchText("200X60")).toBe("200*60");
    expect(normalizeProductSearchText("200*60")).toBe("200*60");
  });

  it("ORD-MODEL-005 search by model with alternate multiplier", () => {
    const p = sampleProduct({ model: "200×60" });
    expect(productMatchesSearchQuery(p, "200x60")).toBe(true);
    expect(productMatchesSearchQuery(p, "200*60")).toBe(true);
    expect(productMatchesSearchQuery(p, "200×60")).toBe(true);
  });

  it("ORD-MODEL-006 search by SKU and barcode preserved", () => {
    const p = sampleProduct();
    expect(productMatchesSearchQuery(p, "TBL-200")).toBe(true);
    expect(productMatchesSearchQuery(p, "729000111")).toBe(true);
    expect(productMatchesSearchQuery(p, "nosuch")).toBe(false);
  });

  it("ORD-MODEL-007 same name different models distinguishable", () => {
    const a = formatProductModelDisplay("200/60");
    const b = formatProductModelDisplay("180/80");
    expect(a).not.toBe(b);
    expect(a).toContain("200/60");
    expect(b).toContain("180/80");
  });

  it("ORD-MODEL-008 snapshot preserves model", () => {
    const p = sampleProduct({ model: "90x200" });
    const snap = snapshotFromProduct(p);
    expect(snap.model).toBe("90x200");
    const item = buildOrderItemFromProduct(p, 1);
    expect(item.productSnapshot.model).toBe("90x200");
  });

  it("ORD-MODEL-009 order stores model in snapshot; products/stock unchanged", () => {
    const c = sampleCustomer();
    const p = sampleProduct({ model: "120×80", stockQuantity: 8 });
    const data = { ...emptyData(), customers: [c], products: [p] };
    const beforeSha = dataContentSha256(data);
    const draft = {
      customerId: c.id,
      customerSnapshot: snapshotFromCustomer(c),
      deliveryAreaSnapshot: c.deliveryArea,
      deliveryAddressSnapshot: addressFromCustomer(c),
      items: [buildOrderItemFromProduct(p, 1)],
      shippingFee: 0,
    };
    const r = allocateOrder(data, draft);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.order.items[0].productSnapshot.model).toBe("120×80");
    expect(stockUnchangedProof(data.products, r.data.products)).toBe(true);
    expect(JSON.stringify(r.data.products)).toBe(JSON.stringify(data.products));
    // Creating an order changes workspace SHA (orders added) — products blob identity stays:
    expect(r.data.products[0].model).toBe(p.model);
    expect(r.data.products[0].salePrice).toBe(p.salePrice);
    expect(beforeSha).not.toBe(""); // sanity
  });

  it("ORD-MODEL-010 copy preserves model", () => {
    const c = sampleCustomer();
    const p = sampleProduct({ model: "A×B" });
    const created = allocateOrder(
      { ...emptyData(), customers: [c], products: [p] },
      {
        customerId: c.id,
        customerSnapshot: snapshotFromCustomer(c),
        deliveryAreaSnapshot: c.deliveryArea,
        deliveryAddressSnapshot: addressFromCustomer(c),
        items: [buildOrderItemFromProduct(p, 1)],
      }
    );
    if ("error" in created) throw new Error("create");
    const copy = buildCopiedOrderDraft(created.order);
    expect(copy.items[0].productSnapshot.model).toBe("A×B");
  });

  it("ORD-MODEL-011 UI picker/details/summary show model", () => {
    const src = readFileSync(join(process.cwd(), "src/components/OrdersPanel.tsx"), "utf8");
    expect(src).toContain("formatProductModelDisplay");
    expect(src).toContain('data-mobile-id="orders.mobile.form.productPickerModel"');
    expect(src).toContain('data-mobile-id="orders.mobile.form.productPickerName"');
    expect(src).toContain("order-product-picker-model");
    expect(src).toContain("order-item-model");
    expect(src).toContain("break-words");
    expect(src).toContain("overflow-x-hidden");
    expect(src).toContain("productMatchesSearchQuery");
  });

  it("ORD-MODEL-012 mobile registry model required locked", () => {
    const el = getMobileElement("orders.mobile.form.productPickerModel");
    expect(el).toBeTruthy();
    expect(el?.required).toBe(true);
    expect(el?.labelHe).toMatch(/דגם|מידה/);
    expect(getMobileElement("orders.mobile.form.productPickerName")?.required).toBe(true);
  });
});
