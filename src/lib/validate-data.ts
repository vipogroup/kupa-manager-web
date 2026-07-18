import { AppData, emptyData } from "./types";
import { normalizeAppDataEntities, normalizeCustomer, normalizeProduct } from "./entities";
import { normalizeOrder } from "./orders";

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateAppData(input: unknown): { ok: true; data: AppData } | { ok: false } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  const o = input as Record<string, unknown>;
  if (o.version !== 1) return { ok: false };
  if (!Array.isArray(o.incomes) || !Array.isArray(o.expenses) || !Array.isArray(o.customers) || !Array.isArray(o.products)) {
    return { ok: false };
  }
  if (!isString(o.updatedAt)) return { ok: false };

  // Legacy workspaces may omit newer collections — treat as []
  if (o.orders !== undefined && !Array.isArray(o.orders)) return { ok: false };
  if (o.inventoryMovements !== undefined && !Array.isArray(o.inventoryMovements)) return { ok: false };
  if (o.deliveries !== undefined && !Array.isArray(o.deliveries)) return { ok: false };
  if (o.drivers !== undefined && !Array.isArray(o.drivers)) return { ok: false };
  if (o.vehicles !== undefined && !Array.isArray(o.vehicles)) return { ok: false };
  if (o.deliveryRoutes !== undefined && !Array.isArray(o.deliveryRoutes)) return { ok: false };
  if (o.customerOrderRequests !== undefined && !Array.isArray(o.customerOrderRequests)) return { ok: false };

  for (const row of o.incomes) {
    if (!row || typeof row !== "object") return { ok: false };
    const r = row as Record<string, unknown>;
    if (!isString(r.id) || !isString(r.title) || !isFiniteNumber(r.amount) || !isString(r.date) || !isString(r.category) || !isString(r.note)) {
      return { ok: false };
    }
  }
  for (const row of o.expenses) {
    if (!row || typeof row !== "object") return { ok: false };
    const r = row as Record<string, unknown>;
    if (!isString(r.id) || !isString(r.title) || !isFiniteNumber(r.amount) || !isString(r.date) || !isString(r.category) || !isString(r.note)) {
      return { ok: false };
    }
  }

  for (const row of o.customers) {
    if (!row || typeof row !== "object") return { ok: false };
    const r = row as Record<string, unknown>;
    if (!isString(r.id)) return { ok: false };
    if (!(isString(r.name) || isString(r.businessName))) return { ok: false };
  }
  for (const row of o.products) {
    if (!row || typeof row !== "object") return { ok: false };
    const r = row as Record<string, unknown>;
    if (!isString(r.id) || !isString(r.name)) return { ok: false };
    const hasLegacyPrice = isFiniteNumber(r.price) || isFiniteNumber(r.salePrice);
    if (!hasLegacyPrice && r.salePrice !== undefined && !isFiniteNumber(r.salePrice)) return { ok: false };
  }

  const ordersRaw = Array.isArray(o.orders) ? o.orders : [];
  for (const row of ordersRaw) {
    if (!row || typeof row !== "object") return { ok: false };
    const r = row as Record<string, unknown>;
    if (!isString(r.id)) return { ok: false };
  }

  const movementsRaw = Array.isArray(o.inventoryMovements) ? o.inventoryMovements : [];
  for (const row of movementsRaw) {
    if (!row || typeof row !== "object") return { ok: false };
    const r = row as Record<string, unknown>;
    if (!isString(r.id)) return { ok: false };
  }

  const deliveriesRaw = Array.isArray(o.deliveries) ? o.deliveries : [];
  for (const row of deliveriesRaw) {
    if (!row || typeof row !== "object") return { ok: false };
    const r = row as Record<string, unknown>;
    if (!isString(r.id)) return { ok: false };
  }

  const known = new Set([
    "version",
    "cloudContractVersion",
    "desktopSchemaVersion",
    "incomes",
    "expenses",
    "customers",
    "products",
    "orders",
    "inventoryMovements",
    "deliveries",
    "drivers",
    "vehicles",
    "deliveryRoutes",
    "customerOrderRequests",
    "updatedAt",
    "customerCounter",
    "productCounter",
    "counters",
  ]);
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!known.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype") {
      rest[k] = v;
    }
  }

  const customers = o.customers.map((c, i) => normalizeCustomer(c, i));
  const products = o.products.map((p, i) => normalizeProduct(p, i));
  const orders = ordersRaw.map((ord, i) => normalizeOrder(ord, i));

  const driversRaw = Array.isArray(o.drivers) ? o.drivers : [];
  const vehiclesRaw = Array.isArray(o.vehicles) ? o.vehicles : [];
  const routesRaw = Array.isArray(o.deliveryRoutes) ? o.deliveryRoutes : [];
  const corRaw = Array.isArray(o.customerOrderRequests) ? o.customerOrderRequests : [];
  for (const row of driversRaw) {
    if (!row || typeof row !== "object") return { ok: false };
    if (!isString((row as Record<string, unknown>).id)) return { ok: false };
  }
  for (const row of vehiclesRaw) {
    if (!row || typeof row !== "object") return { ok: false };
    if (!isString((row as Record<string, unknown>).id)) return { ok: false };
  }
  for (const row of routesRaw) {
    if (!row || typeof row !== "object") return { ok: false };
    if (!isString((row as Record<string, unknown>).id)) return { ok: false };
  }
  for (const row of corRaw) {
    if (!row || typeof row !== "object") return { ok: false };
    if (!isString((row as Record<string, unknown>).id)) return { ok: false };
  }

  let counters = {
    nextOrderNumber: 0,
    nextInventoryMovementNumber: 0,
    nextDeliveryNumber: 0,
    nextDriverNumber: 0,
    nextVehicleNumber: 0,
    nextDeliveryRouteNumber: 0,
    nextRouteStopNumber: 0,
    nextCustomerOrderRequestNumber: 0,
  };
  if (o.counters && typeof o.counters === "object" && !Array.isArray(o.counters)) {
    const c = o.counters as Record<string, unknown>;
    const num = (k: string) =>
      typeof c[k] === "number" && Number.isFinite(c[k] as number) ? (c[k] as number) : 0;
    counters = {
      nextOrderNumber: num("nextOrderNumber"),
      nextInventoryMovementNumber: num("nextInventoryMovementNumber"),
      nextDeliveryNumber: num("nextDeliveryNumber"),
      nextDriverNumber: num("nextDriverNumber"),
      nextVehicleNumber: num("nextVehicleNumber"),
      nextDeliveryRouteNumber: num("nextDeliveryRouteNumber"),
      nextRouteStopNumber: num("nextRouteStopNumber"),
      nextCustomerOrderRequestNumber: num("nextCustomerOrderRequestNumber"),
    };
  }

  const draft: AppData = {
    ...emptyData(),
    ...rest,
    version: 1,
    cloudContractVersion:
      typeof o.cloudContractVersion === "number" && Number.isFinite(o.cloudContractVersion)
        ? o.cloudContractVersion
        : emptyData().cloudContractVersion,
    desktopSchemaVersion:
      typeof o.desktopSchemaVersion === "number" && Number.isFinite(o.desktopSchemaVersion)
        ? o.desktopSchemaVersion
        : undefined,
    incomes: o.incomes as AppData["incomes"],
    expenses: o.expenses as AppData["expenses"],
    customers,
    products,
    orders,
    inventoryMovements: movementsRaw as AppData["inventoryMovements"],
    deliveries: deliveriesRaw as AppData["deliveries"],
    drivers: driversRaw as AppData["drivers"],
    vehicles: vehiclesRaw as AppData["vehicles"],
    deliveryRoutes: routesRaw as AppData["deliveryRoutes"],
    customerOrderRequests: corRaw as AppData["customerOrderRequests"],
    updatedAt: o.updatedAt as string,
    customerCounter: typeof o.customerCounter === "number" && Number.isFinite(o.customerCounter) ? o.customerCounter : undefined,
    productCounter: typeof o.productCounter === "number" && Number.isFinite(o.productCounter) ? o.productCounter : undefined,
    counters,
  };

  return { ok: true, data: normalizeAppDataEntities(draft) };
}
