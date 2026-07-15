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
  hydrateWorkspaceCode: (code: string) => void;
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

export const useKupaStore = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyData(),
      workspaceCode: "",
      hydrateWorkspaceCode: (code) => set({ workspaceCode: code }),
      touch: () => set({ updatedAt: stamp() }),
      addIncome: (input) =>
        set((s) => ({
          incomes: [{ id: nanoid(), ...input }, ...s.incomes],
          updatedAt: stamp(),
        })),
      addExpense: (input) =>
        set((s) => ({
          expenses: [{ id: nanoid(), ...input }, ...s.expenses],
          updatedAt: stamp(),
        })),
      removeIncome: (id) =>
        set((s) => ({
          incomes: s.incomes.filter((r) => r.id !== id),
          updatedAt: stamp(),
        })),
      removeExpense: (id) =>
        set((s) => ({
          expenses: s.expenses.filter((r) => r.id !== id),
          updatedAt: stamp(),
        })),
      addCustomer: (input) =>
        set((s) => ({
          customers: [{ id: nanoid(), ...input }, ...s.customers],
          updatedAt: stamp(),
        })),
      removeCustomer: (id) =>
        set((s) => ({
          customers: s.customers.filter((c) => c.id !== id),
          updatedAt: stamp(),
        })),
      addProduct: (input) =>
        set((s) => ({
          products: [{ id: nanoid(), ...input }, ...s.products],
          updatedAt: stamp(),
        })),
      removeProduct: (id) =>
        set((s) => ({
          products: s.products.filter((p) => p.id !== id),
          updatedAt: stamp(),
        })),
      replaceAll: (data) => set({ ...data, workspaceCode: get().workspaceCode }),
    }),
    {
      name: "kupa-manager-web-v1",
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
