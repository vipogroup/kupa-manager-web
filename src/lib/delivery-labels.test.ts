import { describe, expect, it } from "vitest";
import { emptyData, type Delivery } from "./types";
import { normalizeDelivery } from "./deliveries";
import {
  LABEL_COLUMNS,
  LABEL_ROWS,
  LABELS_PER_PAGE,
  MAX_PRODUCT_LINES_PER_LABEL,
  assertFixedGrid,
  buildDeliveryLabelContent,
  chunkDeliveriesIntoPages,
  expandDeliveryToLabels,
  expectedPageCount,
  labelContentIsClean,
  padPageSlots,
  prepareLabelPrintJob,
  resolveDeliveriesForPrint,
  safeDisplayText,
  safeMoneyAmount,
} from "./delivery-labels";
import { dataContentSha256 } from "./sync-snapshot";

function sampleDelivery(over: Partial<Delivery> & { id: string }): Delivery {
  return normalizeDelivery({
    id: over.id,
    deliveryNumber: over.deliveryNumber || `DLV-WEB-${String(over.id).padStart(6, "0")}`,
    orderId: over.orderId || "ord-1",
    orderNumberSnapshot: over.orderNumberSnapshot || "ORD-000001",
    status: over.status || "pending",
    scheduledDate: over.scheduledDate ?? "2026-07-16",
    deliveryAreaSnapshot: over.deliveryAreaSnapshot || "center",
    customerSnapshot: {
      customerNumber: "CUS-000001",
      customerName: "Label Cust",
      businessName: "",
      phone: "0501111111",
      secondaryPhone: "0502222222",
      email: "",
      street: "Herzl",
      houseNumber: "10",
      entrance: "B",
      floor: "2",
      apartment: "5",
      city: "TLV",
      zipCode: "6100000",
      deliveryArea: "center",
      deliveryNotes: "",
      ...(over.customerSnapshot || {}),
    },
    addressSnapshot: {
      street: "Herzl",
      houseNumber: "10",
      entrance: "B",
      floor: "2",
      apartment: "5",
      city: "TLV",
      zipCode: "6100000",
      deliveryNotes: "",
      ...(over.addressSnapshot || {}),
    },
    itemsSnapshot: over.itemsSnapshot || [
      {
        productNumber: "PRD-000001",
        name: "Table",
        model: "200/60",
        sku: "S1",
        barcode: "",
        unit: "יחידה",
        quantity: 2,
        unitPrice: 10,
        lineTotal: 20,
      },
    ],
    orderTotalSnapshot: over.orderTotalSnapshot ?? 20,
    paymentTypeSnapshot: "cashOnDelivery",
    deliveryNotes: "",
    cancellationReason: "",
    createdAt: "t",
    updatedAt: "t",
    cancelledAt: "",
  });
}

function many(n: number): Delivery[] {
  return Array.from({ length: n }, (_, i) =>
    sampleDelivery({
      id: `d${i + 1}`,
      deliveryNumber: `DLV-WEB-${String(i + 1).padStart(6, "0")}`,
      orderNumberSnapshot: `ORD-${String(i + 1).padStart(6, "0")}`,
    })
  );
}

function manyProducts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    productNumber: `PRD-${String(i + 1).padStart(6, "0")}`,
    name: `Item-${i + 1}`,
    model: `M-${i + 1}`,
    sku: `SKU${i + 1}`,
    barcode: "",
    unit: "יחידה",
    quantity: 1,
    unitPrice: 1,
    lineTotal: 1,
  }));
}

describe("LBL-WEB A4 delivery labels closeout", () => {
  it("LBL-WEB-001 Fixed grid 3×6=18", () => {
    const g = assertFixedGrid();
    expect(g.columns).toBe(3);
    expect(g.rows).toBe(6);
    expect(g.perPage).toBe(18);
    expect(LABEL_COLUMNS * LABEL_ROWS).toBe(LABELS_PER_PAGE);
  });

  it("LBL-WEB-002 One label = one page", () => {
    expect(expectedPageCount(1)).toBe(1);
    expect(chunkDeliveriesIntoPages(many(1))).toHaveLength(1);
  });

  it("LBL-WEB-003 Eighteen labels = one page", () => {
    expect(chunkDeliveriesIntoPages(many(18))).toHaveLength(1);
    expect(expectedPageCount(18)).toBe(1);
  });

  it("LBL-WEB-004 Nineteen labels = two pages", () => {
    const pages = chunkDeliveriesIntoPages(many(19));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(18);
    expect(pages[1]).toHaveLength(1);
  });

  it("LBL-WEB-005 Thirty-six labels = two pages", () => {
    expect(expectedPageCount(36)).toBe(2);
  });

  it("LBL-WEB-006 Thirty-seven labels = three pages", () => {
    expect(expectedPageCount(37)).toBe(3);
  });

  it("LBL-WEB-007 Print selected", () => {
    const list = many(5);
    expect(resolveDeliveriesForPrint(list, [list[1].id], "selected")).toHaveLength(1);
  });

  it("LBL-WEB-008 Print filtered", () => {
    expect(resolveDeliveriesForPrint(many(4), [], "filtered")).toHaveLength(4);
  });

  it("LBL-WEB-009 Continuation for many products — no silent drop", () => {
    const d = sampleDelivery({ id: "big", itemsSnapshot: manyProducts(12) });
    const labels = expandDeliveryToLabels(d);
    expect(labels.length).toBeGreaterThan(1);
    const allNames = labels.flatMap((l) => l.productLines).join(" ");
    for (let i = 1; i <= 12; i++) {
      expect(allNames).toContain(`Item-${i}`);
    }
    expect(labels[0].isContinuation).toBe(false);
    expect(labels[1].isContinuation).toBe(true);
    expect(labels[0].partTotal).toBe(labels.length);
  });

  it("LBL-WEB-010 Max lines per label enforced", () => {
    const d = sampleDelivery({ id: "x", itemsSnapshot: manyProducts(MAX_PRODUCT_LINES_PER_LABEL + 1) });
    const labels = expandDeliveryToLabels(d);
    expect(labels[0].productLines.length).toBeLessThanOrEqual(MAX_PRODUCT_LINES_PER_LABEL);
    expect(labels).toHaveLength(2);
  });

  it("LBL-WEB-011 No undefined/null/NaN in content", () => {
    const dirty = sampleDelivery({
      id: "z",
      // @ts-expect-error intentional bad total
      orderTotalSnapshot: Number.NaN,
      customerSnapshot: {
        customerNumber: "",
        customerName: "undefined",
        businessName: "null",
        phone: "NaN",
        secondaryPhone: "",
        email: "",
        street: "",
        houseNumber: "",
        entrance: "",
        floor: "",
        apartment: "",
        city: "",
        zipCode: "",
        deliveryArea: "unassigned",
        deliveryNotes: "",
      },
    });
    for (const label of expandDeliveryToLabels(dirty)) {
      expect(labelContentIsClean(label)).toBe(true);
      expect(safeDisplayText("undefined")).toBe("");
      expect(safeMoneyAmount(Number.NaN)).toBe(0);
    }
  });

  it("LBL-WEB-012 Long address kept", () => {
    const label = buildDeliveryLabelContent(
      sampleDelivery({
        id: "1",
        addressSnapshot: {
          street: "רחוב ארוך מאוד מאוד עם הרבה מילים",
          houseNumber: "1234",
          entrance: "כניסה מזרחית",
          floor: "קומה עליונה",
          apartment: "דירה גדולה",
          city: "תל אביב יפו",
          zipCode: "6100000",
          deliveryNotes: "",
        },
      })
    );
    expect(label.address.length).toBeGreaterThan(20);
    expect(labelContentIsClean(label)).toBe(true);
  });

  it("LBL-WEB-013 Prepare job does not mutate source / hash", () => {
    const list = many(2);
    const data = { ...emptyData(), deliveries: list };
    const before = dataContentSha256(data);
    const beforeJson = JSON.stringify(list);
    prepareLabelPrintJob(list, [list[0].id], "selected");
    expect(JSON.stringify(list)).toBe(beforeJson);
    expect(dataContentSha256(data)).toBe(before);
  });

  it("LBL-WEB-014 Pad slots border layout 18", () => {
    expect(padPageSlots([1, 2, 3] as never[])).toHaveLength(18);
  });

  it("LBL-WEB-015 Areas Hebrew", () => {
    expect(buildDeliveryLabelContent(sampleDelivery({ id: "n", deliveryAreaSnapshot: "north" })).areaLabel).toBe(
      "צפון"
    );
  });

  it("LBL-WEB-016 Cash total on primary only", () => {
    const labels = expandDeliveryToLabels(sampleDelivery({ id: "c", itemsSnapshot: manyProducts(8), orderTotalSnapshot: 99 }));
    expect(labels[0].totalAmount).toBe(99);
    expect(labels[0].paymentLabel).toMatch(/מזומן לשליח/);
    if (labels[1]) expect(labels[1].isContinuation).toBe(true);
  });

  it("LBL-WEB-017 Empty selection empty job", () => {
    expect(prepareLabelPrintJob(many(3), [], "selected").pageCount).toBe(0);
  });

  it("LBL-WEB-018 Continuations count toward page occupancy", () => {
    const d = sampleDelivery({ id: "one", itemsSnapshot: manyProducts(MAX_PRODUCT_LINES_PER_LABEL * 2) });
    const job = prepareLabelPrintJob([d], [d.id], "selected");
    expect(job.labels.length).toBe(2);
    expect(job.pageCount).toBe(1);
  });
});
