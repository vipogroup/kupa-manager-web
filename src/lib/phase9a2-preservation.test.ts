import { describe, expect, it } from "vitest";
import { emptyData, type AppData } from "./types";
import { validateAppData } from "./validate-data";
import { applyDesktopMutation, finalizeMutatedData } from "./desktop-mutate";
import { CLOUD_CONTRACT_VERSION } from "./cloud-contract";
import { mergeAppDataPreserveUnknown } from "./cloud-contract";

/** Simulates old web client whitelist payload (pre-9A.2) then server merge. */
function oldClientPayload(data: AppData): Record<string, unknown> {
  return {
    version: 1,
    incomes: data.incomes,
    expenses: data.expenses,
    customers: data.customers,
    products: data.products,
    orders: data.orders || [],
    inventoryMovements: data.inventoryMovements || [],
    deliveries: data.deliveries || [],
    updatedAt: data.updatedAt,
    customerCounter: data.customerCounter ?? 0,
    productCounter: data.productCounter ?? 0,
    counters: {
      nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
      nextInventoryMovementNumber: data.counters?.nextInventoryMovementNumber ?? 0,
      nextDeliveryNumber: data.counters?.nextDeliveryNumber ?? 0,
    },
  };
}

describe("Phase 9A.2 data-loss protection", () => {
  it("PRESERVE-001 unknown top-level survives validateAppData", () => {
    const input = {
      ...emptyData(),
      unknownFutureCollection: [{ id: "x1", custom: true }],
      metadata: { source: "test" },
    };
    const v = validateAppData(input);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect((v.data as Record<string, unknown>).unknownFutureCollection).toEqual([
      { id: "x1", custom: true },
    ]);
    expect((v.data as Record<string, unknown>).metadata).toEqual({ source: "test" });
  });

  it("PRESERVE-002 unknown nested field on driver survives normalize/mutate", () => {
    let data = emptyData();
    const created = applyDesktopMutation(data, "createDriver", {
      displayName: "נהג בדיקה",
      phone: "0501234567",
      customFlag: "keep-me",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    data = created.data;
    const driver = created.record as { id: string; customFlag?: string };
    expect(driver.customFlag).toBe("keep-me");
    const updated = applyDesktopMutation(data, "updateDriver", {
      id: driver.id,
      notes: "עודכן",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    const again = (updated.data.drivers || []).find((d) => d.id === driver.id);
    expect(again?.customFlag).toBe("keep-me");
    expect(again?.notes).toBe("עודכן");
  });

  it("PRESERVE-003 old client whitelist merge must keep unknown via merge helper", () => {
    const base = {
      ...emptyData(),
      drivers: [{ id: "DRV-000001", displayName: "A", customFlag: 1 }],
      unknownFutureCollection: [{ id: "u1" }],
      cloudContractVersion: CLOUD_CONTRACT_VERSION,
    } as unknown as AppData;
    const overlay = oldClientPayload(base);
    const merged = mergeAppDataPreserveUnknown(base as unknown as Record<string, unknown>, overlay);
    expect(merged.unknownFutureCollection).toEqual([{ id: "u1" }]);
    expect(merged.drivers).toEqual(base.drivers);
    const v = validateAppData(merged);
    expect(v.ok).toBe(true);
  });

  it("PRESERVE-004 drivers survive unrelated customer create mutate", () => {
    let data = emptyData();
    const d = applyDesktopMutation(data, "createDriver", { displayName: "D1", phone: "0501111111" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    data = d.data;
    const c = applyDesktopMutation(data, "createCustomer", {
      name: "לקוח",
      customerType: "private",
      phone: "0502222222",
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect((c.data.drivers || []).length).toBe(1);
    const fin = finalizeMutatedData(c.data);
    expect(fin.ok).toBe(true);
    if (!fin.ok) return;
    expect((fin.data.drivers || []).length).toBe(1);
  });

  it("PRESERVE-005 route stops survive reorder", () => {
    let data = emptyData();
    const r = applyDesktopMutation(data, "createDeliveryRoute", {
      routeName: "מסלול א",
      routeDate: "2026-07-18",
      planningStatus: "Draft",
      stops: [
        { deliveryId: "del-1", stopNotes: "a", customStop: "S1" },
        { deliveryId: "del-2", stopNotes: "b", customStop: "S2" },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    data = r.data;
    const route = r.record as { id: string; stops: { id: string; customStop?: string }[] };
    expect(route.stops.length).toBe(2);
    expect(route.stops[0].customStop).toBe("S1");
    const ordered = [route.stops[1].id, route.stops[0].id];
    const re = applyDesktopMutation(data, "reorderRouteStops", {
      id: route.id,
      orderedStopIds: ordered,
    });
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    const stops = (re.record as { stops: { id: string; sequence: number; customStop?: string }[] }).stops;
    expect(stops[0].id).toBe(ordered[0]);
    expect(stops[0].sequence).toBe(1);
    expect(stops.find((s) => s.id === route.stops[0].id)?.customStop).toBe("S1");
  });

  it("PRESERVE-006 cloudContractVersion stamped on fleet create", () => {
    const r = applyDesktopMutation(emptyData(), "createVehicle", {
      licensePlate: "12-345-67",
      displayName: "רכב",
      maxWeightKg: 1000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.cloudContractVersion).toBe(CLOUD_CONTRACT_VERSION);
    expect((r.record as { id: string }).id).toMatch(/^VEH-\d{6}$/);
  });
});
