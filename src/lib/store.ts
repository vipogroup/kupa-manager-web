"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import {
  AppData,
  Customer,
  MoneyRecord,
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
  workspaceCode: string;
  dirty: boolean;
  syncStatus: SyncUiStatus;
  cloudRevision: number;
  cloudUpdatedAt: string;
  lastError: string;
  hydrateWorkspaceCode: (code: string) => void;
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
  replaceAll: (data: AppData) => void;
  touch: () => void;
  /** Snapshot of business fields for entity helpers */
  asAppData: () => AppData;
};

function stamp(): string {
  return new Date().toISOString();
}

function ensureWorkspaceCode(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem("kupa-workspace-code");
  if (existing) return existing;
  const code = nanoid(10);
  localStorage.setItem("kupa-workspace-code", code);
  return code;
}

function withDirty<T extends Partial<Store>>(patch: T): T & { dirty: true; syncStatus: "dirty" } {
  return { ...patch, dirty: true, syncStatus: "dirty" };
}

function toAppData(s: AppData): AppData {
  return {
    version: 1,
    incomes: s.incomes,
    expenses: s.expenses,
    customers: s.customers,
    products: s.products,
    updatedAt: s.updatedAt,
    customerCounter: s.customerCounter ?? 0,
    productCounter: s.productCounter ?? 0,
  };
}

export const useKupaStore = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyData(),
      workspaceCode: "",
      dirty: false,
      syncStatus: "clean",
      cloudRevision: 0,
      cloudUpdatedAt: "",
      lastError: "",
      asAppData: () => toAppData(get()),
      hydrateWorkspaceCode: (code) => set({ workspaceCode: code }),
      markDirty: () => set({ dirty: true, syncStatus: "dirty" }),
      setSyncStatus: (status, error) =>
        set({ syncStatus: status, lastError: error || (status === "error" ? get().lastError : "") }),
      setCloudMeta: (revision, updatedAt) =>
        set({ cloudRevision: revision, cloudUpdatedAt: updatedAt }),
      markSynced: (revision, updatedAt) =>
        set({
          dirty: false,
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
      replaceAll: (data) => {
        const normalized = normalizeAppDataEntities(data);
        set({
          version: 1,
          incomes: normalized.incomes,
          expenses: normalized.expenses,
          customers: normalized.customers,
          products: normalized.products,
          updatedAt: normalized.updatedAt,
          customerCounter: normalized.customerCounter ?? 0,
          productCounter: normalized.productCounter ?? 0,
          workspaceCode: get().workspaceCode,
        });
      },
    }),
    {
      name: "kupa-manager-web-v1",
      partialize: (state) => ({
        version: state.version,
        incomes: state.incomes,
        expenses: state.expenses,
        customers: state.customers,
        products: state.products,
        updatedAt: state.updatedAt,
        customerCounter: state.customerCounter ?? 0,
        productCounter: state.productCounter ?? 0,
        workspaceCode: state.workspaceCode,
        dirty: state.dirty,
        syncStatus:
          state.syncStatus === "saving" || state.syncStatus === "loading"
            ? state.dirty
              ? "dirty"
              : "clean"
            : state.syncStatus,
        cloudRevision: state.cloudRevision,
        cloudUpdatedAt: state.cloudUpdatedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const code = state.workspaceCode || ensureWorkspaceCode();
        state.hydrateWorkspaceCode(code);
        const normalized = normalizeAppDataEntities(toAppData(state));
        state.customers = normalized.customers;
        state.products = normalized.products;
        state.customerCounter = normalized.customerCounter;
        state.productCounter = normalized.productCounter;
        if (typeof window !== "undefined") {
          localStorage.setItem("kupa-workspace-code", code);
        }
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
