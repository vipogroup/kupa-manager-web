import { describe, expect, it } from "vitest";
import { emptyData, type Delivery } from "./types";
import { normalizeDelivery } from "./deliveries";
import {
  LABEL_COLUMNS,
  LABEL_ROWS,
  LABELS_PER_PAGE,
  assertFixedGrid,
  buildDeliveryLabelContent,
  chunkDeliveriesIntoPages,
  expectedPageCount,
  padPageSlots,
  prepareLabelPrintJob,
  resolveDeliveriesForPrint,
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

describe("LBL-WEB A4 delivery labels", () => {
  it("LBL-WEB-001 Fixed grid 3×6=18", () => {
    const g = assertFixedGrid();
    expect(g.columns).toBe(3);
    expect(g.rows).toBe(6);
    expect(g.perPage).toBe(18);
    expect(LABEL_COLUMNS * LABEL_ROWS).toBe(LABELS_PER_PAGE);
  });

  it("LBL-WEB-002 Eighteen labels = one page", () => {
    const pages = chunkDeliveriesIntoPages(many(18));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(18);
    expect(expectedPageCount(18)).toBe(1);
  });

  it("LBL-WEB-003 Nineteen labels = two pages", () => {
    const pages = chunkDeliveriesIntoPages(many(19));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(18);
    expect(pages[1]).toHaveLength(1);
    expect(expectedPageCount(19)).toBe(2);
  });

  it("LBL-WEB-004 Thirty-six labels = two full pages", () => {
    expect(chunkDeliveriesIntoPages(many(36))).toHaveLength(2);
    expect(expectedPageCount(36)).toBe(2);
  });

  it("LBL-WEB-005 Thirty-seven labels = three pages", () => {
    expect(expectedPageCount(37)).toBe(3);
  });

  it("LBL-WEB-006 Print selected only", () => {
    const list = many(5);
    const resolved = resolveDeliveriesForPrint(list, [list[1].id, list[3].id], "selected");
    expect(resolved.map((d) => d.id)).toEqual([list[1].id, list[3].id]);
  });

  it("LBL-WEB-007 Print filtered / displayed", () => {
    const list = many(4);
    const resolved = resolveDeliveriesForPrint(list, [], "filtered");
    expect(resolved).toHaveLength(4);
  });

  it("LBL-WEB-008 Empty selection yields empty job", () => {
    const job = prepareLabelPrintJob(many(3), [], "selected");
    expect(job.labels).toHaveLength(0);
    expect(job.pageCount).toBe(0);
  });

  it("LBL-WEB-009 Selection respects filtered order", () => {
    const list = many(4);
    const selected = new Set([list[3].id, list[0].id]);
    const resolved = resolveDeliveriesForPrint(list, selected, "selected");
    expect(resolved.map((d) => d.id)).toEqual([list[0].id, list[3].id]);
  });

  it("LBL-WEB-010 Label content: customer phone address area", () => {
    const label = buildDeliveryLabelContent(sampleDelivery({ id: "1" }));
    expect(label.customerName).toContain("Label");
    expect(label.phone).toBe("0501111111");
    expect(label.address).toContain("Herzl");
    expect(label.areaLabel).toBe("מרכז");
  });

  it("LBL-WEB-011 Label content: order and delivery numbers", () => {
    const label = buildDeliveryLabelContent(
      sampleDelivery({ id: "1", deliveryNumber: "DLV-WEB-000007", orderNumberSnapshot: "ORD-000009" })
    );
    expect(label.deliveryNumber).toBe("DLV-WEB-000007");
    expect(label.orderNumber).toBe("ORD-000009");
  });

  it("LBL-WEB-012 Label content: products models quantities", () => {
    const label = buildDeliveryLabelContent(sampleDelivery({ id: "1" }));
    expect(label.productLines[0]).toContain("Table");
    expect(label.productLines[0]).toContain("200/60");
    expect(label.productLines[0]).toContain("2");
  });

  it("LBL-WEB-013 Label content: cash on delivery total", () => {
    const label = buildDeliveryLabelContent(sampleDelivery({ id: "1", orderTotalSnapshot: 55 }));
    expect(label.paymentLabel).toContain("מזומן לשליח");
    expect(label.totalAmount).toBe(55);
  });

  it("LBL-WEB-014 Pad page slots to 18", () => {
    const slots = padPageSlots(many(5).map((d) => buildDeliveryLabelContent(d)));
    expect(slots).toHaveLength(18);
    expect(slots.filter((s) => s === null)).toHaveLength(13);
  });

  it("LBL-WEB-015 Prepare job clones without mutating source", () => {
    const list = many(2);
    const before = JSON.stringify(list);
    prepareLabelPrintJob(list, [list[0].id], "selected");
    expect(JSON.stringify(list)).toBe(before);
  });

  it("LBL-WEB-016 Print does not change workspace data hash", () => {
    const data = {
      ...emptyData(),
      deliveries: many(2),
    };
    const before = dataContentSha256(data);
    prepareLabelPrintJob(data.deliveries, data.deliveries.map((d) => d.id), "filtered");
    expect(dataContentSha256(data)).toBe(before);
    expect(data.dirty as unknown).toBeUndefined();
  });

  it("LBL-WEB-017 No inventory / stock fields in label module side effects", () => {
    const data = {
      ...emptyData(),
      products: [
        {
          id: "p1",
          productNumber: "PRD-000001",
          name: "P",
          model: "",
          sku: "",
          barcode: "",
          description: "",
          salePrice: 1,
          costPrice: 0,
          stockQuantity: 9,
          unit: "יחידה",
          active: true,
          createdAt: "t",
          updatedAt: "t",
        },
      ],
      deliveries: many(1),
    };
    const stock = data.products[0].stockQuantity;
    const mov = JSON.stringify(data.inventoryMovements);
    prepareLabelPrintJob(data.deliveries, [], "filtered");
    expect(data.products[0].stockQuantity).toBe(stock);
    expect(JSON.stringify(data.inventoryMovements)).toBe(mov);
  });

  it("LBL-WEB-018 Areas labels Hebrew", () => {
    for (const [area, he] of [
      ["center", "מרכז"],
      ["north", "צפון"],
      ["south", "דרום"],
      ["unassigned", "לא הוגדר"],
    ] as const) {
      const label = buildDeliveryLabelContent(sampleDelivery({ id: area, deliveryAreaSnapshot: area }));
      expect(label.areaLabel).toBe(he);
    }
  });

  it("LBL-WEB-019 Missing address fallback", () => {
    const label = buildDeliveryLabelContent(
      sampleDelivery({
        id: "x",
        addressSnapshot: {
          street: "",
          houseNumber: "",
          entrance: "",
          floor: "",
          apartment: "",
          city: "",
          zipCode: "",
          deliveryNotes: "",
        },
      })
    );
    expect(label.address).toBe("כתובת לא הוגדרה");
  });

  it("LBL-WEB-020 Selected not in filtered list ignored", () => {
    const list = many(2);
    const resolved = resolveDeliveriesForPrint(list, ["ghost-id", list[0].id], "selected");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe(list[0].id);
  });

  it("LBL-WEB-021 Portrait page constants documented", () => {
    // CSS @page size A4 portrait enforced in globals.css — structural constants locked here
    expect(LABELS_PER_PAGE).toBe(18);
  });

  it("LBL-WEB-022 Zero labels = zero pages", () => {
    expect(chunkDeliveriesIntoPages([])).toEqual([]);
    expect(expectedPageCount(0)).toBe(0);
  });

  it("LBL-WEB-023 One label = one page with pads", () => {
    const pages = chunkDeliveriesIntoPages(many(1));
    expect(pages).toHaveLength(1);
    expect(padPageSlots(pages[0].map(buildDeliveryLabelContent)).filter(Boolean)).toHaveLength(1);
  });

  it("LBL-WEB-024 Payment type cash only on labels", () => {
    const label = buildDeliveryLabelContent(sampleDelivery({ id: "1" }));
    expect(label.paymentLabel).toMatch(/מזומן לשליח/);
  });

  it("LBL-WEB-025 Dirty/revision untouched (no store fields)", () => {
    const job = prepareLabelPrintJob(many(1), ["d1"], "selected");
    expect(Object.keys(job).sort()).toEqual(["deliveries", "labels", "pageCount", "pages"]);
  });
});
