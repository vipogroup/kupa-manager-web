/**
 * Phase 9A fleet domain — drivers, vehicles, deliveryRoutes (+ nested stops).
 * Server-side validation + allocate helpers. No Dispatch / GPS / Stock Issue.
 */
import type { AppData } from "./types";
import { CLOUD_CONTRACT_VERSION } from "./cloud-contract";
import type { DeliveryRoute, Driver, RouteStop, Vehicle } from "./phase9a-types";

export type { DeliveryRoute, Driver, RouteStop, Vehicle } from "./phase9a-types";

function nowIso(): string {
  return new Date().toISOString();
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function bool(v: unknown, fallback = true): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function finiteNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function extrasOf(o: Record<string, unknown>, known: string[]): Record<string, unknown> {
  const ks = new Set(known);
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (ks.has(k)) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    rest[k] = v;
  }
  return rest;
}

export function normalizeLicensePlate(value: string): string {
  return value.trim().toUpperCase().replace(/[\s\-]/g, "");
}

export function normalizeDriver(raw: unknown, index = 0): Driver {
  const o = asObj(raw);
  const known = [
    "id",
    "driverNumber",
    "displayName",
    "phone",
    "secondaryPhone",
    "email",
    "licenseNumber",
    "licenseExpiryDate",
    "isActive",
    "notes",
    "createdAt",
    "updatedAt",
  ];
  const extras = extrasOf(o, known);
  const t = nowIso();
  const base: Driver = {
    id: str(o.id, `drv-legacy-${index}`),
    driverNumber: str(o.driverNumber, str(o.id, "")),
    displayName: str(o.displayName, str(o.name, "")),
    phone: str(o.phone),
    secondaryPhone: str(o.secondaryPhone),
    email: str(o.email),
    licenseNumber: str(o.licenseNumber),
    licenseExpiryDate: str(o.licenseExpiryDate),
    isActive: bool(o.isActive, true),
    notes: str(o.notes),
    createdAt: str(o.createdAt, t),
    updatedAt: str(o.updatedAt, t),
  };
  return { ...extras, ...base };
}

export function normalizeVehicle(raw: unknown, index = 0): Vehicle {
  const o = asObj(raw);
  const known = [
    "id",
    "vehicleNumber",
    "licensePlate",
    "displayName",
    "vehicleType",
    "maxWeightKg",
    "maxVolumeM3",
    "maxStops",
    "registrationExpiryDate",
    "insuranceExpiryDate",
    "isActive",
    "notes",
    "createdAt",
    "updatedAt",
  ];
  const extras = extrasOf(o, known);
  const t = nowIso();
  const plate = normalizeLicensePlate(str(o.licensePlate));
  const base: Vehicle = {
    id: str(o.id, `veh-legacy-${index}`),
    vehicleNumber: str(o.vehicleNumber, str(o.id, "")),
    licensePlate: plate,
    displayName: str(o.displayName, plate),
    vehicleType: str(o.vehicleType, "van"),
    maxWeightKg: Math.max(0, finiteNum(o.maxWeightKg, 0)),
    maxVolumeM3: Math.max(0, finiteNum(o.maxVolumeM3, 0)),
    maxStops: Math.max(0, Math.floor(finiteNum(o.maxStops, 0))),
    registrationExpiryDate: str(o.registrationExpiryDate),
    insuranceExpiryDate: str(o.insuranceExpiryDate),
    isActive: bool(o.isActive, true),
    notes: str(o.notes),
    createdAt: str(o.createdAt, t),
    updatedAt: str(o.updatedAt, t),
  };
  return { ...extras, ...base };
}

export function normalizeRouteStop(raw: unknown, index = 0): RouteStop {
  const o = asObj(raw);
  const known = [
    "id",
    "sequence",
    "deliveryId",
    "deliverySnapshot",
    "customerSnapshot",
    "addressSnapshot",
    "deliveryAreaSnapshot",
    "cashCollectionAmount",
    "estimatedServiceMinutes",
    "stopNotes",
    "createdAt",
    "updatedAt",
  ];
  const extras = extrasOf(o, known);
  const t = nowIso();
  const base: RouteStop = {
    id: str(o.id, `rst-legacy-${index}`),
    sequence: Math.max(1, Math.floor(finiteNum(o.sequence, index + 1))),
    deliveryId: str(o.deliveryId),
    deliverySnapshot: asObj(o.deliverySnapshot),
    customerSnapshot: asObj(o.customerSnapshot),
    addressSnapshot: asObj(o.addressSnapshot),
    deliveryAreaSnapshot: asObj(o.deliveryAreaSnapshot),
    cashCollectionAmount: Math.max(0, finiteNum(o.cashCollectionAmount, 0)),
    estimatedServiceMinutes: Math.max(0, finiteNum(o.estimatedServiceMinutes, 0)),
    stopNotes: str(o.stopNotes),
    createdAt: str(o.createdAt, t),
    updatedAt: str(o.updatedAt, t),
  };
  return { ...extras, ...base };
}

export function normalizeDeliveryRoute(raw: unknown, index = 0): DeliveryRoute {
  const o = asObj(raw);
  const known = [
    "id",
    "routeNumber",
    "routeDate",
    "routeName",
    "deliveryAreaId",
    "deliveryAreaSnapshot",
    "driverId",
    "driverSnapshot",
    "vehicleId",
    "vehicleSnapshot",
    "plannedStartTime",
    "plannedEndTime",
    "planningStatus",
    "stops",
    "capacitySummary",
    "warningSummary",
    "notes",
    "isCancelled",
    "createdAt",
    "updatedAt",
  ];
  const extras = extrasOf(o, known);
  const t = nowIso();
  const stopsRaw = Array.isArray(o.stops) ? o.stops : [];
  const stops = stopsRaw.map((s, i) => normalizeRouteStop(s, i));
  stops.sort((a, b) => a.sequence - b.sequence);
  const renumbered = stops.map((s, i) => ({ ...s, sequence: i + 1 }));
  const base: DeliveryRoute = {
    id: str(o.id, `rte-legacy-${index}`),
    routeNumber: str(o.routeNumber, str(o.id, "")),
    routeDate: str(o.routeDate),
    routeName: str(o.routeName),
    deliveryAreaId: str(o.deliveryAreaId),
    deliveryAreaSnapshot: asObj(o.deliveryAreaSnapshot),
    driverId: str(o.driverId),
    driverSnapshot: asObj(o.driverSnapshot),
    vehicleId: str(o.vehicleId),
    vehicleSnapshot: asObj(o.vehicleSnapshot),
    plannedStartTime: str(o.plannedStartTime),
    plannedEndTime: str(o.plannedEndTime),
    planningStatus: str(o.planningStatus, "Draft"),
    stops: renumbered,
    capacitySummary: asObj(o.capacitySummary),
    warningSummary: Array.isArray(o.warningSummary)
      ? (o.warningSummary as string[])
      : asObj(o.warningSummary),
    notes: str(o.notes),
    isCancelled: bool(o.isCancelled, str(o.planningStatus) === "Cancelled"),
    createdAt: str(o.createdAt, t),
    updatedAt: str(o.updatedAt, t),
  };
  return { ...extras, ...base };
}

export function normalizeFleetInData(data: AppData): AppData {
  const drivers = (Array.isArray(data.drivers) ? data.drivers : []).map((d, i) => normalizeDriver(d, i));
  const vehicles = (Array.isArray(data.vehicles) ? data.vehicles : []).map((v, i) =>
    normalizeVehicle(v, i)
  );
  const deliveryRoutes = (Array.isArray(data.deliveryRoutes) ? data.deliveryRoutes : []).map((r, i) =>
    normalizeDeliveryRoute(r, i)
  );
  return {
    ...data,
    cloudContractVersion: data.cloudContractVersion ?? CLOUD_CONTRACT_VERSION,
    drivers,
    vehicles,
    deliveryRoutes,
    counters: {
      nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
      nextInventoryMovementNumber: data.counters?.nextInventoryMovementNumber ?? 0,
      nextDeliveryNumber: data.counters?.nextDeliveryNumber ?? 0,
      nextDriverNumber: data.counters?.nextDriverNumber ?? 0,
      nextVehicleNumber: data.counters?.nextVehicleNumber ?? 0,
      nextDeliveryRouteNumber: data.counters?.nextDeliveryRouteNumber ?? 0,
      nextRouteStopNumber: data.counters?.nextRouteStopNumber ?? 0,
    },
  };
}

function nextCounter(data: AppData, key: keyof NonNullable<AppData["counters"]>): {
  n: number;
  data: AppData;
} {
  const counters = {
    nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
    nextInventoryMovementNumber: data.counters?.nextInventoryMovementNumber ?? 0,
    nextDeliveryNumber: data.counters?.nextDeliveryNumber ?? 0,
    nextDriverNumber: data.counters?.nextDriverNumber ?? 0,
    nextVehicleNumber: data.counters?.nextVehicleNumber ?? 0,
    nextDeliveryRouteNumber: data.counters?.nextDeliveryRouteNumber ?? 0,
    nextRouteStopNumber: data.counters?.nextRouteStopNumber ?? 0,
  };
  const current = counters[key] ?? 0;
  const n = Math.max(1, current + 1);
  return { n, data: { ...data, counters: { ...counters, [key]: n } } };
}

function formatDrv(n: number): string {
  return `DRV-${String(n).padStart(6, "0")}`;
}
function formatVeh(n: number): string {
  return `VEH-${String(n).padStart(6, "0")}`;
}
function formatRte(n: number): string {
  return `RTE-${String(n).padStart(6, "0")}`;
}
function formatRst(n: number): string {
  return `RST-${String(n).padStart(6, "0")}`;
}

export type DriverInput = Partial<Driver> & { displayName?: string; id?: string };

export function allocateDriver(
  data: AppData,
  input: DriverInput
): { data: AppData; driver: Driver } | { error: string } {
  const name = str(input.displayName).trim();
  if (!name) return { error: "שם נהג חובה" };
  const { n, data: d1 } = nextCounter(data, "nextDriverNumber");
  const id = str(input.id).trim() || formatDrv(n);
  if ((d1.drivers || []).some((x) => x.id === id || x.driverNumber === id)) {
    return { error: "מזהה נהג כבר קיים" };
  }
  const t = nowIso();
  const driver = normalizeDriver({
    ...input,
    id,
    driverNumber: id,
    displayName: name,
    createdAt: str(input.createdAt, t),
    updatedAt: t,
    isActive: bool(input.isActive, true),
  });
  return {
    data: {
      ...d1,
      cloudContractVersion: CLOUD_CONTRACT_VERSION,
      drivers: [...(d1.drivers || []), driver],
      updatedAt: t,
    },
    driver,
  };
}

export function updateDriverInData(
  data: AppData,
  id: string,
  patch: Partial<Driver>
): { data: AppData; driver: Driver } | { error: string } {
  const list = data.drivers || [];
  const idx = list.findIndex((d) => d.id === id);
  if (idx < 0) return { error: "נהג לא נמצא" };
  const prev = list[idx];
  const merged = normalizeDriver({
    ...prev,
    ...patch,
    id: prev.id,
    driverNumber: prev.driverNumber || prev.id,
    createdAt: prev.createdAt,
    updatedAt: nowIso(),
  });
  const drivers = list.slice();
  drivers[idx] = merged;
  return {
    data: { ...data, cloudContractVersion: CLOUD_CONTRACT_VERSION, drivers, updatedAt: nowIso() },
    driver: merged,
  };
}

export function setDriverActiveInData(
  data: AppData,
  id: string,
  isActive: boolean
): { data: AppData; driver: Driver } | { error: string } {
  return updateDriverInData(data, id, { isActive });
}

export type VehicleInput = Partial<Vehicle> & { licensePlate?: string; id?: string };

export function allocateVehicle(
  data: AppData,
  input: VehicleInput
): { data: AppData; vehicle: Vehicle } | { error: string } {
  const plate = normalizeLicensePlate(str(input.licensePlate));
  if (!plate) return { error: "מספר רישוי חובה" };
  if ((data.vehicles || []).some((v) => normalizeLicensePlate(v.licensePlate) === plate)) {
    return { error: "מספר רישוי כבר קיים" };
  }
  const { n, data: d1 } = nextCounter(data, "nextVehicleNumber");
  const id = str(input.id).trim() || formatVeh(n);
  if ((d1.vehicles || []).some((x) => x.id === id)) return { error: "מזהה רכב כבר קיים" };
  const t = nowIso();
  const vehicle = normalizeVehicle({
    ...input,
    id,
    vehicleNumber: id,
    licensePlate: plate,
    displayName: str(input.displayName, plate),
    createdAt: str(input.createdAt, t),
    updatedAt: t,
    isActive: bool(input.isActive, true),
  });
  return {
    data: {
      ...d1,
      cloudContractVersion: CLOUD_CONTRACT_VERSION,
      vehicles: [...(d1.vehicles || []), vehicle],
      updatedAt: t,
    },
    vehicle,
  };
}

export function updateVehicleInData(
  data: AppData,
  id: string,
  patch: Partial<Vehicle>
): { data: AppData; vehicle: Vehicle } | { error: string } {
  const list = data.vehicles || [];
  const idx = list.findIndex((v) => v.id === id);
  if (idx < 0) return { error: "רכב לא נמצא" };
  const prev = list[idx];
  if (typeof patch.licensePlate === "string") {
    const plate = normalizeLicensePlate(patch.licensePlate);
    if (!plate) return { error: "מספר רישוי חובה" };
    if (
      (data.vehicles || []).some(
        (v) => v.id !== id && normalizeLicensePlate(v.licensePlate) === plate
      )
    ) {
      return { error: "מספר רישוי כבר קיים" };
    }
    patch = { ...patch, licensePlate: plate };
  }
  const merged = normalizeVehicle({
    ...prev,
    ...patch,
    id: prev.id,
    vehicleNumber: prev.vehicleNumber || prev.id,
    createdAt: prev.createdAt,
    updatedAt: nowIso(),
  });
  const vehicles = list.slice();
  vehicles[idx] = merged;
  return {
    data: { ...data, cloudContractVersion: CLOUD_CONTRACT_VERSION, vehicles, updatedAt: nowIso() },
    vehicle: merged,
  };
}

export function setVehicleActiveInData(
  data: AppData,
  id: string,
  isActive: boolean
): { data: AppData; vehicle: Vehicle } | { error: string } {
  return updateVehicleInData(data, id, { isActive });
}

function activeRoutes(data: AppData): DeliveryRoute[] {
  return (data.deliveryRoutes || []).filter((r) => !r.isCancelled && r.planningStatus !== "Cancelled");
}

function deliveryAssignedElsewhere(
  data: AppData,
  deliveryId: string,
  exceptRouteId?: string
): boolean {
  if (!deliveryId) return false;
  for (const r of activeRoutes(data)) {
    if (exceptRouteId && r.id === exceptRouteId) continue;
    if ((r.stops || []).some((s) => s.deliveryId === deliveryId)) return true;
  }
  return false;
}

export type RouteInput = Partial<DeliveryRoute> & { id?: string };

export function allocateDeliveryRoute(
  data: AppData,
  input: RouteInput
): { data: AppData; route: DeliveryRoute } | { error: string } {
  const { n, data: d1 } = nextCounter(data, "nextDeliveryRouteNumber");
  const id = str(input.id).trim() || formatRte(n);
  if ((d1.deliveryRoutes || []).some((x) => x.id === id)) return { error: "מזהה מסלול כבר קיים" };

  let working = d1;
  const stopsIn: RouteStop[] = [];
  for (const raw of Array.isArray(input.stops) ? input.stops : []) {
    const o = asObj(raw);
    const deliveryId = str(o.deliveryId);
    if (deliveryId && deliveryAssignedElsewhere(working, deliveryId)) {
      return { error: "משלוח כבר משויך למסלול פעיל אחר" };
    }
    const { n: sn, data: d2 } = nextCounter(working, "nextRouteStopNumber");
    working = d2;
    const stopId = str(o.id).trim() || formatRst(sn);
    stopsIn.push(
      normalizeRouteStop({
        ...o,
        id: stopId,
        sequence: stopsIn.length + 1,
      })
    );
  }

  const t = nowIso();
  const route = normalizeDeliveryRoute({
    ...input,
    id,
    routeNumber: id,
    stops: stopsIn,
    createdAt: str(input.createdAt, t),
    updatedAt: t,
    planningStatus: str(input.planningStatus, "Draft"),
    isCancelled: bool(input.isCancelled, false),
  });

  // Driver / vehicle same-day conflict (active routes)
  if (route.driverId) {
    const conflict = activeRoutes(working).some(
      (r) => r.driverId === route.driverId && r.routeDate === route.routeDate
    );
    if (conflict) return { error: "נהג כבר משויך למסלול פעיל באותו תאריך" };
  }
  if (route.vehicleId) {
    const conflict = activeRoutes(working).some(
      (r) => r.vehicleId === route.vehicleId && r.routeDate === route.routeDate
    );
    if (conflict) return { error: "רכב כבר משויך למסלול פעיל באותו תאריך" };
  }

  return {
    data: {
      ...working,
      cloudContractVersion: CLOUD_CONTRACT_VERSION,
      deliveryRoutes: [...(working.deliveryRoutes || []), route],
      updatedAt: t,
    },
    route,
  };
}

export function updateDeliveryRouteInData(
  data: AppData,
  id: string,
  patch: Partial<DeliveryRoute>
): { data: AppData; route: DeliveryRoute } | { error: string } {
  const list = data.deliveryRoutes || [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return { error: "מסלול לא נמצא" };
  const prev = list[idx];
  const nextStops = Array.isArray(patch.stops) ? patch.stops : prev.stops;
  for (const s of nextStops || []) {
    const deliveryId = str(s.deliveryId);
    if (deliveryId && deliveryAssignedElsewhere(data, deliveryId, id)) {
      return { error: "משלוח כבר משויך למסלול פעיל אחר" };
    }
  }
  const merged = normalizeDeliveryRoute({
    ...prev,
    ...patch,
    id: prev.id,
    routeNumber: prev.routeNumber || prev.id,
    stops: nextStops,
    createdAt: prev.createdAt,
    updatedAt: nowIso(),
  });
  if (!merged.isCancelled && merged.planningStatus !== "Cancelled") {
    if (merged.driverId) {
      const conflict = activeRoutes(data).some(
        (r) => r.id !== id && r.driverId === merged.driverId && r.routeDate === merged.routeDate
      );
      if (conflict) return { error: "נהג כבר משויך למסלול פעיל באותו תאריך" };
    }
    if (merged.vehicleId) {
      const conflict = activeRoutes(data).some(
        (r) => r.id !== id && r.vehicleId === merged.vehicleId && r.routeDate === merged.routeDate
      );
      if (conflict) return { error: "רכב כבר משויך למסלול פעיל באותו תאריך" };
    }
  }
  const deliveryRoutes = list.slice();
  deliveryRoutes[idx] = merged;
  return {
    data: {
      ...data,
      cloudContractVersion: CLOUD_CONTRACT_VERSION,
      deliveryRoutes,
      updatedAt: nowIso(),
    },
    route: merged,
  };
}

export function cancelDeliveryRouteInData(
  data: AppData,
  id: string,
  reason = ""
): { data: AppData; route: DeliveryRoute } | { error: string } {
  const notes = reason
    ? `${str((data.deliveryRoutes || []).find((r) => r.id === id)?.notes)} | בוטל: ${reason}`.trim()
    : undefined;
  return updateDeliveryRouteInData(data, id, {
    isCancelled: true,
    planningStatus: "Cancelled",
    ...(notes ? { notes } : {}),
  });
}

export function reorderRouteStopsInData(
  data: AppData,
  routeId: string,
  orderedStopIds: string[]
): { data: AppData; route: DeliveryRoute } | { error: string } {
  const route = (data.deliveryRoutes || []).find((r) => r.id === routeId);
  if (!route) return { error: "מסלול לא נמצא" };
  if (route.isCancelled) return { error: "לא ניתן לסדר תחנות במסלול מבוטל" };
  const byId = new Map((route.stops || []).map((s) => [s.id, s]));
  if (orderedStopIds.length !== byId.size) return { error: "רשימת תחנות אינה תואמת" };
  const stops: RouteStop[] = [];
  for (let i = 0; i < orderedStopIds.length; i++) {
    const s = byId.get(orderedStopIds[i]);
    if (!s) return { error: "מזהה תחנה לא תקין" };
    stops.push({ ...s, sequence: i + 1, updatedAt: nowIso() });
  }
  return updateDeliveryRouteInData(data, routeId, { stops });
}
