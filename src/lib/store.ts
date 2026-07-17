"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import {
  AppData,
  Customer,
  Delivery,
  InventoryMovement,
  MoneyRecord,
  Order,
  Product,
  emptyData,
} from "./types";
import {
  allocateCustomer,
  allocateProduct,
  normalizeAppDataEntities,
  setCustomerActiveInData,
  setProductActiveInData,
  updateCustomerInData,
  updateProductInData,
  type CustomerInput,
  type ProductInput,
} from "./entities";
import {
  allocateOrder,
  buildCopiedOrderDraft,
  cancelOrderInData,
  confirmOrderInData,
  updateOrderInData,
  type OrderDraftInput,
} from "./orders";
import { applyInventoryMovement, type MovementCreateInput } from "./inventory";
import {
  allocateDelivery,
  cancelDeliveryInData,
  refreshDeliveryFromOrder,
  updateDeliveryInData,
  type DeliveryCreateInput,
  type DeliveryUpdateInput,
} from "./deliveries";
import { CLOUD_CONTRACT_VERSION, collectUnknownTopLevel, isCloudAppDataKnownKey } from "./cloud-contract";

export type SyncUiStatus =
  | "clean"
  | "dirty"
  | "saving"
  | "loading"
  | "synced"
  | "conflict"
  | "error"
  | "offline";

type MoneyInput = {
  title: string;
  amount: number;
  date: string;
  category: string;
  note: string;
  customerId?: string;
};

type Store = AppData & {
  /** @deprecated Ignored for cloud path — account session resolves workspace server-side. */
  workspaceCode: string;
  dirty: boolean;
  pendingSync: boolean;
  cloudHydrated: boolean;
  syncStatus: SyncUiStatus;
  cloudRevision: number;
  cloudUpdatedAt: string;
  lastError: string;
  hydrateWorkspaceCode: (code: string) => void;
  setCloudHydrated: (v: boolean) => void;
  setPendingSync: (v: boolean) => void;
  markDirty: () => void;
  setSyncStatus: (status: SyncUiStatus, error?: string) => void;
  setCloudMeta: (revision: number, updatedAt: string) => void;
  markSynced: (revision: number, updatedAt: string) => void;
  addIncome: (input: MoneyInput) => void;
  addExpense: (input: MoneyInput) => void;
  removeIncome: (id: string) => void;
  removeExpense: (id: string) => void;
  createCustomer: (input: CustomerInput) => { ok: true; customer: Customer } | { ok: false; error: string };
  updateCustomer: (
    id: string,
    patch: Partial<Customer>
  ) => { ok: true; customer: Customer } | { ok: false; error: string };
  setCustomerActive: (id: string, active: boolean) => { ok: true } | { ok: false; error: string };
  createProduct: (input: ProductInput) => { ok: true; product: Product } | { ok: false; error: string };
  updateProduct: (
    id: string,
    patch: Partial<Product>
  ) => { ok: true; product: Product } | { ok: false; error: string };
  setProductActive: (id: string, active: boolean) => { ok: true } | { ok: false; error: string };
  createOrder: (input: OrderDraftInput) => { ok: true; order: Order } | { ok: false; error: string };
  updateOrder: (
    id: string,
    patch: Partial<OrderDraftInput>
  ) => { ok: true; order: Order } | { ok: false; error: string };
  confirmOrder: (id: string) => { ok: true; order: Order } | { ok: false; error: string };
  cancelOrder: (id: string, reason: string) => { ok: true; order: Order } | { ok: false; error: string };
  copyOrder: (id: string) => { ok: true; order: Order } | { ok: false; error: string };
  createInventoryMovement: (
    input: MovementCreateInput
  ) => { ok: true; movement: InventoryMovement; product: Product } | { ok: false; error: string };
  createDelivery: (
    input: DeliveryCreateInput
  ) => { ok: true; delivery: Delivery } | { ok: false; error: string };
  updateDelivery: (
    id: string,
    patch: DeliveryUpdateInput
  ) => { ok: true; delivery: Delivery } | { ok: false; error: string };
  cancelDelivery: (
    id: string,
    reason: string
  ) => { ok: true; delivery: Delivery } | { ok: false; error: string };
  refreshDeliverySnapshot: (id: string) => { ok: true; delivery: Delivery } | { ok: false; error: string };
  replaceAll: (data: AppData) => void;
  touch: () => void;
  asAppData: () => AppData;
};

function stamp(): string {
  return new Date().toISOString();
}

/** Legacy helper — does not create new codes (account workspace is server-side). */
function ensureWorkspaceCode(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("kupa-workspace-code") || "";
  } catch {
    return "";
  }
}

function withDirty<T extends Partial<Store>>(
  patch: T
): T & { dirty: true; pendingSync: true; syncStatus: "dirty" } {
  return { ...patch, dirty: true, pendingSync: true, syncStatus: "dirty" };
}

const STORE_META_KEYS = new Set([
  "workspaceCode",
  "dirty",
  "pendingSync",
  "cloudHydrated",
  "syncStatus",
  "cloudRevision",
  "cloudUpdatedAt",
  "lastError",
]);

function defaultCounters(c?: AppData["counters"]) {
  return {
    nextOrderNumber: c?.nextOrderNumber ?? 0,
    nextInventoryMovementNumber: c?.nextInventoryMovementNumber ?? 0,
    nextDeliveryNumber: c?.nextDeliveryNumber ?? 0,
    nextDriverNumber: c?.nextDriverNumber ?? 0,
    nextVehicleNumber: c?.nextVehicleNumber ?? 0,
    nextDeliveryRouteNumber: c?.nextDeliveryRouteNumber ?? 0,
    nextRouteStopNumber: c?.nextRouteStopNumber ?? 0,
  };
}

function toAppData(s: AppData & Record<string, unknown>): AppData {
  const known = new Set<string>([
    ...STORE_META_KEYS,
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
    "updatedAt",
    "customerCounter",
    "productCounter",
    "counters",
  ]);
  const unknown = collectUnknownTopLevel(s as Record<string, unknown>, known);
  return {
    ...unknown,
    version: 1,
    cloudContractVersion:
      typeof s.cloudContractVersion === "number" ? s.cloudContractVersion : CLOUD_CONTRACT_VERSION,
    desktopSchemaVersion:
      typeof s.desktopSchemaVersion === "number" ? s.desktopSchemaVersion : undefined,
    incomes: s.incomes,
    expenses: s.expenses,
    customers: s.customers,
    products: s.products,
    orders: s.orders || [],
    inventoryMovements: s.inventoryMovements || [],
    deliveries: s.deliveries || [],
    drivers: s.drivers || [],
    vehicles: s.vehicles || [],
    deliveryRoutes: s.deliveryRoutes || [],
    updatedAt: s.updatedAt,
    customerCounter: s.customerCounter ?? 0,
    productCounter: s.productCounter ?? 0,
    counters: defaultCounters(s.counters),
  };
}

function applyOrdersPatch(result: AppData) {
  return withDirty({
    orders: result.orders,
    products: result.products,
    deliveries: result.deliveries || [],
    counters: defaultCounters(result.counters),
    updatedAt: result.updatedAt,
  });
}

export const useKupaStore = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyData(),
      workspaceCode: "",
      dirty: false,
      pendingSync: false,
      cloudHydrated: false,
      syncStatus: "clean",
      cloudRevision: 0,
      cloudUpdatedAt: "",
      lastError: "",
      asAppData: () => toAppData(get()),
      hydrateWorkspaceCode: (code) => set({ workspaceCode: code }),
      setCloudHydrated: (v) => set({ cloudHydrated: v }),
      setPendingSync: (v) => set({ pendingSync: v }),
      markDirty: () => set({ dirty: true, pendingSync: true, syncStatus: "dirty" }),
      setSyncStatus: (status, error) =>
        set({ syncStatus: status, lastError: error || (status === "error" ? get().lastError : "") }),
      setCloudMeta: (revision, updatedAt) =>
        set({ cloudRevision: revision, cloudUpdatedAt: updatedAt }),
      markSynced: (revision, updatedAt) =>
        set({
          dirty: false,
          pendingSync: false,
          syncStatus: "synced",
          cloudRevision: revision,
          cloudUpdatedAt: updatedAt,
          lastError: "",
        }),
      touch: () => set(withDirty({ updatedAt: stamp() })),
      addIncome: (input) =>
        set((s) =>
          withDirty({
            incomes: [{ id: nanoid(), ...input }, ...s.incomes],
            updatedAt: stamp(),
          })
        ),
      addExpense: (input) =>
        set((s) =>
          withDirty({
            expenses: [{ id: nanoid(), ...input }, ...s.expenses],
            updatedAt: stamp(),
          })
        ),
      removeIncome: (id) =>
        set((s) =>
          withDirty({
            incomes: s.incomes.filter((r) => r.id !== id),
            updatedAt: stamp(),
          })
        ),
      removeExpense: (id) =>
        set((s) =>
          withDirty({
            expenses: s.expenses.filter((r) => r.id !== id),
            updatedAt: stamp(),
          })
        ),
      createCustomer: (input) => {
        const result = allocateCustomer(toAppData(get()), input);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            customers: result.data.customers,
            customerCounter: result.data.customerCounter,
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, customer: result.customer };
      },
      updateCustomer: (id, patch) => {
        const result = updateCustomerInData(toAppData(get()), id, patch);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            customers: result.data.customers,
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, customer: result.customer };
      },
      setCustomerActive: (id, active) => {
        const result = setCustomerActiveInData(toAppData(get()), id, active);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            customers: result.data.customers,
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true };
      },
      createProduct: (input) => {
        const result = allocateProduct(toAppData(get()), input);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            products: result.data.products,
            productCounter: result.data.productCounter,
            inventoryMovements: result.data.inventoryMovements || [],
            deliveries: result.data.deliveries || [],
            counters: defaultCounters(result.data.counters),
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, product: result.product };
      },
      updateProduct: (id, patch) => {
        const result = updateProductInData(toAppData(get()), id, patch);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            products: result.data.products,
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, product: result.product };
      },
      setProductActive: (id, active) => {
        const result = setProductActiveInData(toAppData(get()), id, active);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            products: result.data.products,
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true };
      },
      createOrder: (input) => {
        const result = allocateOrder(toAppData(get()), input);
        if ("error" in result) return { ok: false, error: result.error };
        set(applyOrdersPatch(result.data));
        return { ok: true, order: result.order };
      },
      updateOrder: (id, patch) => {
        const result = updateOrderInData(toAppData(get()), id, patch);
        if ("error" in result) return { ok: false, error: result.error };
        set(applyOrdersPatch(result.data));
        return { ok: true, order: result.order };
      },
      confirmOrder: (id) => {
        const result = confirmOrderInData(toAppData(get()), id);
        if ("error" in result) return { ok: false, error: result.error };
        set(applyOrdersPatch(result.data));
        return { ok: true, order: result.order };
      },
      cancelOrder: (id, reason) => {
        const result = cancelOrderInData(toAppData(get()), id, reason);
        if ("error" in result) return { ok: false, error: result.error };
        set(applyOrdersPatch(result.data));
        return { ok: true, order: result.order };
      },
      copyOrder: (id) => {
        const source = (get().orders || []).find((o) => o.id === id);
        if (!source) return { ok: false, error: "הזמנה לא נמצאה" };
        const draft = buildCopiedOrderDraft(source);
        const result = allocateOrder(toAppData(get()), draft);
        if ("error" in result) return { ok: false, error: result.error };
        set(applyOrdersPatch(result.data));
        return { ok: true, order: result.order };
      },
      createInventoryMovement: (input) => {
        const result = applyInventoryMovement(toAppData(get()), input);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            products: result.data.products,
            inventoryMovements: result.data.inventoryMovements,
            counters: defaultCounters(result.data.counters),
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, movement: result.movement, product: result.product };
      },
      createDelivery: (input) => {
        const result = allocateDelivery(toAppData(get()), input);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            deliveries: result.data.deliveries || [],
            counters: defaultCounters(result.data.counters),
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, delivery: result.delivery };
      },
      updateDelivery: (id, patch) => {
        const result = updateDeliveryInData(toAppData(get()), id, patch);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            deliveries: result.data.deliveries || [],
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, delivery: result.delivery };
      },
      cancelDelivery: (id, reason) => {
        const result = cancelDeliveryInData(toAppData(get()), id, reason);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            deliveries: result.data.deliveries || [],
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, delivery: result.delivery };
      },
      refreshDeliverySnapshot: (id) => {
        const result = refreshDeliveryFromOrder(toAppData(get()), id);
        if ("error" in result) return { ok: false, error: result.error };
        set(
          withDirty({
            deliveries: result.data.deliveries || [],
            updatedAt: result.data.updatedAt,
          })
        );
        return { ok: true, delivery: result.delivery };
      },
      replaceAll: (data) => {
        const normalized = normalizeAppDataEntities(data);
        const knownUi = new Set([
          "workspaceCode",
          "dirty",
          "pendingSync",
          "cloudHydrated",
          "syncStatus",
          "cloudRevision",
          "cloudUpdatedAt",
          "lastError",
        ]);
        const extras: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(normalized as Record<string, unknown>)) {
          if (knownUi.has(k)) continue;
          if (typeof v === "function") continue;
          if (isCloudAppDataKnownKey(k) || k === "drivers" || k === "vehicles" || k === "deliveryRoutes") {
            continue;
          }
          // Preserve unknown top-level from cloud payload
          if (
            ![
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
              "updatedAt",
              "customerCounter",
              "productCounter",
              "counters",
            ].includes(k)
          ) {
            extras[k] = v;
          }
        }
        set({
          ...extras,
          version: 1,
          cloudContractVersion: normalized.cloudContractVersion ?? CLOUD_CONTRACT_VERSION,
          desktopSchemaVersion: normalized.desktopSchemaVersion,
          incomes: normalized.incomes,
          expenses: normalized.expenses,
          customers: normalized.customers,
          products: normalized.products,
          orders: normalized.orders || [],
          inventoryMovements: normalized.inventoryMovements || [],
          deliveries: normalized.deliveries || [],
          drivers: normalized.drivers || [],
          vehicles: normalized.vehicles || [],
          deliveryRoutes: normalized.deliveryRoutes || [],
          updatedAt: normalized.updatedAt,
          customerCounter: normalized.customerCounter ?? 0,
          productCounter: normalized.productCounter ?? 0,
          counters: defaultCounters(normalized.counters),
          workspaceCode: get().workspaceCode,
        });
      },
    }),
    {
      name: "kupa-manager-web-v1",
      partialize: (state) => {
        const app = toAppData(state);
        return {
          ...app,
          dirty: state.dirty,
          pendingSync: state.pendingSync,
          syncStatus:
            state.syncStatus === "saving" || state.syncStatus === "loading"
              ? state.dirty
                ? "dirty"
                : "clean"
              : state.syncStatus,
          cloudRevision: state.cloudRevision,
          cloudUpdatedAt: state.cloudUpdatedAt,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Ignore legacy browser workspace codes for cloud path selection.
        state.hydrateWorkspaceCode("");
        state.cloudHydrated = false;
        const normalized = normalizeAppDataEntities(toAppData(state as AppData & Record<string, unknown>));
        Object.assign(state, toAppData(normalized as AppData & Record<string, unknown>));
        state.customers = normalized.customers;
        state.products = normalized.products;
        state.orders = normalized.orders || [];
        state.inventoryMovements = normalized.inventoryMovements || [];
        state.deliveries = normalized.deliveries || [];
        state.drivers = normalized.drivers || [];
        state.vehicles = normalized.vehicles || [];
        state.deliveryRoutes = normalized.deliveryRoutes || [];
        state.customerCounter = normalized.customerCounter;
        state.productCounter = normalized.productCounter;
        state.counters = defaultCounters(normalized.counters);
        state.cloudContractVersion = normalized.cloudContractVersion ?? CLOUD_CONTRACT_VERSION;
        // Legacy workspace-code key is cleared only after successful cloud sync (sync-client).
      },
    }
  )
);

export function sumAmounts(rows: MoneyRecord[]): number {
  return rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export { ensureWorkspaceCode };
