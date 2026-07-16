import { nanoid } from "nanoid";
import type { AppData, MoneyRecord } from "./types";

export type MoneyInput = {
  title: string;
  amount: number;
  date: string;
  category: string;
  note?: string;
  customerId?: string;
};

function stamp(): string {
  return new Date().toISOString();
}

function validateMoneyInput(input: MoneyInput): { ok: true } | { ok: false; error: string } {
  const title = String(input.title || "").trim();
  if (!title) return { ok: false, error: "כותרת חובה" };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: "סכום אינו תקין" };
  const date = String(input.date || "").trim();
  if (!date) return { ok: false, error: "תאריך חובה" };
  const category = String(input.category || "").trim();
  if (!category) return { ok: false, error: "קטגוריה חובה" };
  return { ok: true };
}

function toRecord(input: MoneyInput, id: string): MoneyRecord {
  const rec: MoneyRecord = {
    id,
    title: String(input.title || "").trim(),
    amount: Number(input.amount),
    date: String(input.date || "").trim(),
    category: String(input.category || "").trim(),
    note: String(input.note || "").trim(),
  };
  const cid = String(input.customerId || "").trim();
  if (cid) rec.customerId = cid;
  return rec;
}

export function addIncomeInData(
  data: AppData,
  input: MoneyInput
): { data: AppData; record: MoneyRecord } | { error: string } {
  const v = validateMoneyInput(input);
  if (!v.ok) return { error: v.error };
  const record = toRecord(input, nanoid());
  return {
    record,
    data: {
      ...data,
      incomes: [record, ...(data.incomes || [])],
      updatedAt: stamp(),
    },
  };
}

export function updateIncomeInData(
  data: AppData,
  id: string,
  input: MoneyInput
): { data: AppData; record: MoneyRecord } | { error: string } {
  const existing = (data.incomes || []).find((r) => r.id === id);
  if (!existing) return { error: "רשומת הכנסה לא נמצאה" };
  const v = validateMoneyInput(input);
  if (!v.ok) return { error: v.error };
  const record = toRecord(input, existing.id);
  return {
    record,
    data: {
      ...data,
      incomes: (data.incomes || []).map((r) => (r.id === id ? record : r)),
      updatedAt: stamp(),
    },
  };
}

export function removeIncomeInData(
  data: AppData,
  id: string
): { data: AppData } | { error: string } {
  const exists = (data.incomes || []).some((r) => r.id === id);
  if (!exists) return { error: "רשומת הכנסה לא נמצאה" };
  return {
    data: {
      ...data,
      incomes: (data.incomes || []).filter((r) => r.id !== id),
      updatedAt: stamp(),
    },
  };
}

export function addExpenseInData(
  data: AppData,
  input: MoneyInput
): { data: AppData; record: MoneyRecord } | { error: string } {
  const v = validateMoneyInput(input);
  if (!v.ok) return { error: v.error };
  const record = toRecord(input, nanoid());
  return {
    record,
    data: {
      ...data,
      expenses: [record, ...(data.expenses || [])],
      updatedAt: stamp(),
    },
  };
}

export function updateExpenseInData(
  data: AppData,
  id: string,
  input: MoneyInput
): { data: AppData; record: MoneyRecord } | { error: string } {
  const existing = (data.expenses || []).find((r) => r.id === id);
  if (!existing) return { error: "רשומת הוצאה לא נמצאה" };
  const v = validateMoneyInput(input);
  if (!v.ok) return { error: v.error };
  const record = toRecord(input, existing.id);
  return {
    record,
    data: {
      ...data,
      expenses: (data.expenses || []).map((r) => (r.id === id ? record : r)),
      updatedAt: stamp(),
    },
  };
}

export function removeExpenseInData(
  data: AppData,
  id: string
): { data: AppData } | { error: string } {
  const exists = (data.expenses || []).some((r) => r.id === id);
  if (!exists) return { error: "רשומת הוצאה לא נמצאה" };
  return {
    data: {
      ...data,
      expenses: (data.expenses || []).filter((r) => r.id !== id),
      updatedAt: stamp(),
    },
  };
}
