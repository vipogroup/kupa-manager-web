import type { AppData } from "./types";
import type { DeliveryRoute, Driver, RouteStop } from "./phase9a-types";
import type { AuthAccount } from "./auth-accounts";
import { readAccountPreferences } from "./ui-prefs/prefs-cloud";
import type { MobileModulePermission } from "./ui-prefs/types";

export const COURIER_DATE_MODES = ["todayOnly", "range"] as const;
export type CourierDateMode = (typeof COURIER_DATE_MODES)[number];

export type CourierAccess = {
  id: string;
  userAccountId: string;
  driverId: string;
  isActive: boolean;
  allowedDateMode: CourierDateMode;
  allowedDateFrom: string;
  allowedDateTo: string;
  canViewPhone: boolean;
  canViewSecondaryPhone: boolean;
  canViewCashCollection: boolean;
  canOpenNavigation: boolean;
  canViewOrderItems: boolean;
  canViewOrderNotes: boolean;
  canViewDeliveryNotes: boolean;
  canViewStopNotes: boolean;
  canViewPaymentMethod: boolean;
  allowDraftRoutes: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type CourierStopView = {
  stopId: string;
  sequence: number;
  customerName: string;
  phone: string | null;
  secondaryPhone: string | null;
  city: string;
  street: string;
  houseNumber: string;
  entrance: string;
  floor: string;
  apartment: string;
  elevator: string;
  accessNotes: string;
  items: Array<{ name: string; quantity: number; notes: string }>;
  orderNotes: string | null;
  deliveryNotes: string | null;
  stopNotes: string | null;
  cashCollectionAmount: number | null;
  paymentMethod: string | null;
  navigationQuery: string;
  source: "snapshot" | "fallback";
};

export type CourierRouteView = {
  id: string;
  routeNumber: string;
  routeName: string;
  routeDate: string;
  planningStatus: string;
  vehicleLabel: string;
  areaLabel: string;
  stopCount: number;
  stopsWithCash: number;
  stopsWithoutCash: number;
  totalCashToCollect: number;
  serverTotalVerified: boolean;
  stops: CourierStopView[];
  updatedAt: string;
};

function asRec(data: AppData): Record<string, unknown> {
  return data as unknown as Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function str(v: unknown, max = 300): string {
  return String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, max);
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function todayYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getCourierAccessList(data: AppData): CourierAccess[] {
  const raw = asRec(data).courierAccess;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as CourierAccess[];
}

export function setCourierAccessList(data: AppData, list: CourierAccess[]): AppData {
  return { ...data, courierAccess: list } as AppData;
}

export function findCourierAccessForUser(data: AppData, username: string): CourierAccess | null {
  const u = str(username, 120).toLowerCase();
  if (!u) return null;
  return (
    getCourierAccessList(data).find((a) => str(a.userAccountId, 120).toLowerCase() === u) || null
  );
}

export function upsertCourierAccessInData(
  data: AppData,
  input: {
    userAccountId: string;
    driverId: string;
    isActive?: boolean;
    allowedDateMode?: string;
    allowedDateFrom?: string;
    allowedDateTo?: string;
    canViewPhone?: boolean;
    canViewSecondaryPhone?: boolean;
    canViewCashCollection?: boolean;
    canOpenNavigation?: boolean;
    canViewOrderItems?: boolean;
    canViewOrderNotes?: boolean;
    canViewDeliveryNotes?: boolean;
    canViewStopNotes?: boolean;
    canViewPaymentMethod?: boolean;
    allowDraftRoutes?: boolean;
  }
): { data: AppData; access: CourierAccess } | { error: string } {
  const userAccountId = str(input.userAccountId, 120);
  const driverId = str(input.driverId, 80);
  if (!userAccountId) return { error: "שם משתמש לשליח חובה" };
  if (!driverId) return { error: "מזהה נהג חובה" };
  const driver = (data.drivers || []).find((d) => d.id === driverId);
  if (!driver) return { error: "נהג לא נמצא" };

  let mode = str(input.allowedDateMode, 20) || "todayOnly";
  if (!(COURIER_DATE_MODES as readonly string[]).includes(mode)) mode = "todayOnly";

  const list = getCourierAccessList(data);
  const idx = list.findIndex((a) => str(a.userAccountId, 120).toLowerCase() === userAccountId.toLowerCase());
  const now = nowIso();
  const prev = idx >= 0 ? list[idx] : null;
  const access: CourierAccess = {
    id: prev?.id || `cacc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    userAccountId,
    driverId,
    isActive: input.isActive !== false,
    allowedDateMode: mode as CourierDateMode,
    allowedDateFrom: str(input.allowedDateFrom, 32) || prev?.allowedDateFrom || "",
    allowedDateTo: str(input.allowedDateTo, 32) || prev?.allowedDateTo || "",
    canViewPhone: input.canViewPhone !== false,
    canViewSecondaryPhone: input.canViewSecondaryPhone === true,
    canViewCashCollection: input.canViewCashCollection !== false,
    canOpenNavigation: input.canOpenNavigation !== false,
    canViewOrderItems: input.canViewOrderItems !== false,
    canViewOrderNotes: input.canViewOrderNotes !== false,
    canViewDeliveryNotes: input.canViewDeliveryNotes !== false,
    canViewStopNotes: input.canViewStopNotes !== false,
    canViewPaymentMethod: input.canViewPaymentMethod !== false,
    allowDraftRoutes: input.allowDraftRoutes === true,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };
  const next = [...list];
  if (idx >= 0) next[idx] = access;
  else next.unshift(access);
  return { data: setCourierAccessList({ ...data, updatedAt: now }, next), access };
}

export function revokeCourierAccessInData(
  data: AppData,
  userAccountId: string
): { data: AppData; access: CourierAccess } | { error: string } {
  const u = str(userAccountId, 120).toLowerCase();
  const list = getCourierAccessList(data);
  const idx = list.findIndex((a) => str(a.userAccountId, 120).toLowerCase() === u);
  if (idx < 0) return { error: "גישת שליח לא נמצאה" };
  const now = nowIso();
  const access: CourierAccess = { ...list[idx], isActive: false, updatedAt: now };
  const next = [...list];
  next[idx] = access;
  return { data: setCourierAccessList({ ...data, updatedAt: now }, next), access };
}

export function isDateAllowedForCourier(access: CourierAccess, dateYmd: string): boolean {
  const d = str(dateYmd, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (access.allowedDateMode === "todayOnly") {
    return d === todayYmd();
  }
  const from = str(access.allowedDateFrom, 32);
  const to = str(access.allowedDateTo, 32);
  if (from && d < from) return false;
  if (to && d > to) return false;
  // If range mode but no bounds, only today
  if (!from && !to) return d === todayYmd();
  return true;
}

function snapStr(obj: unknown, key: string, max = 200): string {
  if (!obj || typeof obj !== "object") return "";
  return str((obj as Record<string, unknown>)[key], max);
}

function projectStop(
  stop: RouteStop,
  access: CourierAccess,
  delivery?: AppData["deliveries"][number]
): CourierStopView {
  const cust = stop.customerSnapshot || {};
  const addr = stop.addressSnapshot || {};
  const delSnap = stop.deliverySnapshot || {};
  let source: "snapshot" | "fallback" = "snapshot";
  const customerName =
    snapStr(cust, "customerName") ||
    snapStr(cust, "name") ||
    snapStr(cust, "businessName") ||
    (delivery ? delivery.customerSnapshot?.customerName || "" : "") ||
    "לקוח";
  if (!snapStr(cust, "customerName") && !snapStr(cust, "name") && delivery) source = "fallback";

  const city = snapStr(addr, "city") || (delivery?.addressSnapshot?.city || "");
  const street = snapStr(addr, "street") || (delivery?.addressSnapshot?.street || "");
  const houseNumber = snapStr(addr, "houseNumber") || (delivery?.addressSnapshot?.houseNumber || "");
  const entrance = snapStr(addr, "entrance") || delivery?.addressSnapshot?.entrance || "";
  const floor = snapStr(addr, "floor") || delivery?.addressSnapshot?.floor || "";
  const apartment = snapStr(addr, "apartment") || delivery?.addressSnapshot?.apartment || "";
  const elevator = snapStr(addr, "elevator") || "unknown";
  const accessNotes =
    snapStr(addr, "deliveryNotes") ||
    snapStr(addr, "accessNotes") ||
    delivery?.addressSnapshot?.deliveryNotes ||
    "";

  let items: CourierStopView["items"] = [];
  if (access.canViewOrderItems !== false) {
    const rawItems = Array.isArray((delSnap as Record<string, unknown>).itemsSnapshot)
      ? ((delSnap as Record<string, unknown>).itemsSnapshot as unknown[])
      : delivery?.itemsSnapshot || [];
    items = rawItems
      .filter((x) => x && typeof x === "object")
      .map((it) => {
        const o = it as Record<string, unknown>;
        return {
          name: str(o.name || o.productName, 120) || "פריט",
          quantity: Math.max(0, Math.floor(Number(o.quantity) || 0)),
          notes: str(o.notes, 200),
        };
      });
  }

  const cashRaw = Number(stop.cashCollectionAmount);
  const cash =
    Number.isFinite(cashRaw) && cashRaw >= 0
      ? roundMoney(cashRaw)
      : delivery
        ? roundMoney(delivery.orderTotalSnapshot || 0)
        : 0;

  const navParts = [street, houseNumber, city].filter(Boolean);
  const navigationQuery = navParts.join(" ");

  return {
    stopId: stop.id,
    sequence: stop.sequence,
    customerName,
    phone: access.canViewPhone ? snapStr(cust, "phone") || delivery?.customerSnapshot?.phone || null : null,
    secondaryPhone: access.canViewSecondaryPhone
      ? snapStr(cust, "secondaryPhone") || delivery?.customerSnapshot?.secondaryPhone || null
      : null,
    city,
    street,
    houseNumber,
    entrance,
    floor,
    apartment,
    elevator,
    accessNotes,
    items,
    orderNotes: access.canViewOrderNotes
      ? snapStr(delSnap, "orderNotes") || null
      : null,
    deliveryNotes: access.canViewDeliveryNotes
      ? snapStr(delSnap, "deliveryNotes") || delivery?.deliveryNotes || null
      : null,
    stopNotes: access.canViewStopNotes ? str(stop.stopNotes, 400) || null : null,
    cashCollectionAmount: access.canViewCashCollection ? cash : null,
    paymentMethod: access.canViewPaymentMethod
      ? snapStr(delSnap, "paymentTypeSnapshot") || delivery?.paymentTypeSnapshot || "cashOnDelivery"
      : null,
    navigationQuery: access.canOpenNavigation ? navigationQuery : "",
    source,
  };
}

export function buildCourierRouteView(
  data: AppData,
  route: DeliveryRoute,
  access: CourierAccess
): CourierRouteView {
  const deliveriesById = new Map((data.deliveries || []).map((d) => [d.id, d]));
  const stopsSorted = [...(route.stops || [])].sort((a, b) => a.sequence - b.sequence);
  const stops = stopsSorted.map((s) => projectStop(s, access, deliveriesById.get(s.deliveryId)));
  let total = 0;
  let withCash = 0;
  let without = 0;
  for (const s of stops) {
    const amt = s.cashCollectionAmount;
    if (typeof amt === "number" && amt > 0) {
      withCash += 1;
      total += amt;
    } else if (access.canViewCashCollection) {
      without += 1;
    }
  }
  total = roundMoney(total);
  // Server verification vs raw stop cash (permission-independent)
  const rawTotal = roundMoney(
    stopsSorted.reduce((sum, s) => sum + Math.max(0, Number(s.cashCollectionAmount) || 0), 0)
  );
  const vehicleLabel =
    snapStr(route.vehicleSnapshot, "displayName") ||
    snapStr(route.vehicleSnapshot, "licensePlate") ||
    "";
  const areaLabel =
    snapStr(route.deliveryAreaSnapshot, "name") ||
    snapStr(route.deliveryAreaSnapshot, "label") ||
    str(route.deliveryAreaId, 40);

  return {
    id: route.id,
    routeNumber: str(route.routeNumber, 40),
    routeName: str(route.routeName, 120) || str(route.routeNumber, 40),
    routeDate: str(route.routeDate, 32),
    planningStatus: str(route.planningStatus, 40),
    vehicleLabel,
    areaLabel,
    stopCount: stops.length,
    stopsWithCash: withCash,
    stopsWithoutCash: without,
    totalCashToCollect: access.canViewCashCollection ? total : 0,
    serverTotalVerified: access.canViewCashCollection ? total === rawTotal : true,
    stops,
    updatedAt: str(route.updatedAt, 40) || nowIso(),
  };
}

export function listCourierRoutesForDate(
  data: AppData,
  access: CourierAccess,
  dateYmd: string
): { ok: true; routes: CourierRouteView[] } | { ok: false; code: string; error: string } {
  if (!access.isActive) {
    return { ok: false, code: "COURIER_ACCESS_DISABLED", error: "הגישה שלך הושבתה" };
  }
  if (!isDateAllowedForCourier(access, dateYmd)) {
    return { ok: false, code: "COURIER_DATE_FORBIDDEN", error: "תאריך אינו מורשה" };
  }
  const routes = (data.deliveryRoutes || []).filter((r) => {
    if (r.driverId !== access.driverId) return false;
    if (str(r.routeDate, 32) !== dateYmd) return false;
    if (r.isCancelled || r.planningStatus === "Cancelled") return false;
    if (r.planningStatus === "Draft" && !access.allowDraftRoutes) return false;
    if (r.planningStatus !== "Planned" && r.planningStatus !== "Draft") return false;
    return true;
  });
  const views = routes
    .map((r) => buildCourierRouteView(data, r, access))
    .sort((a, b) => a.routeNumber.localeCompare(b.routeNumber, "he"));
  return { ok: true, routes: views };
}

export function getCourierRouteById(
  data: AppData,
  access: CourierAccess,
  routeId: string
): { ok: true; route: CourierRouteView } | { ok: false; code: string; error: string } {
  if (!access.isActive) {
    return { ok: false, code: "COURIER_ACCESS_DISABLED", error: "הגישה שלך הושבתה" };
  }
  const route = (data.deliveryRoutes || []).find((r) => r.id === routeId);
  if (!route || route.driverId !== access.driverId) {
    return { ok: false, code: "COURIER_ROUTE_FORBIDDEN", error: "אין גישה למסלול" };
  }
  if (route.isCancelled || route.planningStatus === "Cancelled") {
    return { ok: false, code: "COURIER_ROUTE_FORBIDDEN", error: "אין גישה למסלול" };
  }
  if (route.planningStatus === "Draft" && !access.allowDraftRoutes) {
    return { ok: false, code: "COURIER_ROUTE_FORBIDDEN", error: "אין גישה למסלול" };
  }
  if (!isDateAllowedForCourier(access, str(route.routeDate, 32))) {
    return { ok: false, code: "COURIER_DATE_FORBIDDEN", error: "תאריך אינו מורשה" };
  }
  return { ok: true, route: buildCourierRouteView(data, route, access) };
}

export async function mergeCourierAccessWithMobilePrefs(
  accountId: string,
  access: CourierAccess
): Promise<CourierAccess> {
  try {
    const prefs = await readAccountPreferences(accountId);
    if (!prefs.exists) return access;
    const mod = prefs.envelope.preferences?.modulePermissions?.courierDailyView as
      | (MobileModulePermission & Record<string, unknown>)
      | undefined;
    if (!mod) return access;
    if (mod.visible === false) {
      return { ...access, isActive: false };
    }
    // Field-level prefs from hiddenElementIds are enforced via access flags set by admin.
    return access;
  } catch {
    return access;
  }
}

export function resolveCourierDriver(data: AppData, access: CourierAccess): Driver | null {
  return (data.drivers || []).find((d) => d.id === access.driverId && d.isActive !== false) || null;
}

export function assertCourierAccount(account: AuthAccount | null | undefined): account is AuthAccount {
  return Boolean(account && account.role === "courier");
}

export { todayYmd };
