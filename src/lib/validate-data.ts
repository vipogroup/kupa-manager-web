import { AppData, emptyData } from "./types";

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
    if (!isString(r.id) || !isString(r.name) || !isString(r.phone) || !isString(r.note)) return { ok: false };
  }
  for (const row of o.products) {
    if (!row || typeof row !== "object") return { ok: false };
    const r = row as Record<string, unknown>;
    if (!isString(r.id) || !isString(r.name) || !isFiniteNumber(r.price) || !isString(r.sku) || !isFiniteNumber(r.stock)) {
      return { ok: false };
    }
  }

  return {
    ok: true,
    data: {
      ...emptyData(),
      version: 1,
      incomes: o.incomes as AppData["incomes"],
      expenses: o.expenses as AppData["expenses"],
      customers: o.customers as AppData["customers"],
      products: o.products as AppData["products"],
      updatedAt: o.updatedAt as string,
    },
  };
}
