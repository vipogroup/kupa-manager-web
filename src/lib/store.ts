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
  addCustomer: (input: Omit<Customer, "id">) => void;
  removeCustomer: (id: string) => void;
  addProduct: (input: Omit<Product, "id">) => void;
  removeProduct: (id: string) => void;
  replaceAll: (data: AppData) => void;
  touch: () => void;
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
      addCustomer: (input) =>
        set((s) =>
          withDirty({
            customers: [{ id: nanoid(), ...input }, ...s.customers],
            updatedAt: stamp(),
          })
        ),
      removeCustomer: (id) =>
        set((s) =>
          withDirty({
            customers: s.customers.filter((c) => c.id !== id),
            updatedAt: stamp(),
          })
        ),
      addProduct: (input) =>
        set((s) =>
          withDirty({
            products: [{ id: nanoid(), ...input }, ...s.products],
            updatedAt: stamp(),
          })
        ),
      removeProduct: (id) =>
        set((s) =>
          withDirty({
            products: s.products.filter((p) => p.id !== id),
            updatedAt: stamp(),
          })
        ),
      replaceAll: (data) =>
        set({
          ...data,
          workspaceCode: get().workspaceCode,
        }),
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
        workspaceCode: state.workspaceCode,
        dirty: state.dirty,
        syncStatus: state.syncStatus === "saving" || state.syncStatus === "loading"
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
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export { ensureWorkspaceCode };
