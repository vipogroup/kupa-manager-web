"use client";

import { useMemo, useState } from "react";
import { useKupaStore } from "@/lib/store";
import {
  emptyProductDraft,
  formatPriceILS,
  formatStock,
  validateProductInput,
  type ProductInput,
} from "@/lib/entities";
import type { Product } from "@/lib/types";

type Filter = "all" | "active" | "inactive" | "in_stock" | "out_of_stock";

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base outline-none ring-[var(--accent)] focus:ring-2"
        inputMode={type === "number" || type === "decimal" ? "decimal" : undefined}
      />
    </label>
  );
}

export function ProductsPanel() {
  const store = useKupaStore();
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductInput>(emptyProductDraft());
  const [salePriceText, setSalePriceText] = useState("0");
  const [costPriceText, setCostPriceText] = useState("0");
  const [stockText, setStockText] = useState("0");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.products.filter((p) => {
      if (filter === "active" && !p.active) return false;
      if (filter === "inactive" && p.active) return false;
      if (filter === "in_stock" && !(p.stockQuantity > 0)) return false;
      if (filter === "out_of_stock" && p.stockQuantity > 0) return false;
      if (!q) return true;
      const hay = [p.name, p.model, p.sku, p.barcode, p.productNumber].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [store.products, query, filter]);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyProductDraft());
    setSalePriceText("0");
    setCostPriceText("0");
    setStockText("0");
    setError("");
    setMessage("");
    setMode("form");
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setDraft({
      name: p.name,
      model: p.model,
      sku: p.sku,
      barcode: p.barcode,
      description: p.description,
      salePrice: p.salePrice,
      costPrice: p.costPrice,
      stockQuantity: p.stockQuantity,
      unit: p.unit,
      active: p.active,
    });
    setSalePriceText(String(p.salePrice));
    setCostPriceText(String(p.costPrice));
    setStockText(String(p.stockQuantity));
    setError("");
    setMessage("");
    setMode("form");
  }

  function cancelForm() {
    setMode("list");
    setEditingId(null);
    setDraft(emptyProductDraft());
    setError("");
  }

  function parseNonNeg(text: string): number | null {
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  function trySave() {
    setError("");
    const salePrice = parseNonNeg(salePriceText);
    const costPrice = parseNonNeg(costPriceText);
    const stockQuantity = parseNonNeg(stockText);
    if (salePrice === null) {
      setError("מחיר מכירה אינו תקין");
      return;
    }
    if (costPrice === null) {
      setError("מחיר עלות אינו תקין");
      return;
    }
    if (stockQuantity === null) {
      setError("כמות מלאי אינה תקינה");
      return;
    }
    const payload: ProductInput = {
      ...draft,
      name: (draft.name || "").trim(),
      model: (draft.model || "").trim(),
      sku: draft.sku ?? "",
      barcode: draft.barcode ?? "",
      description: (draft.description || "").trim(),
      unit: (draft.unit || "יחידה").trim() || "יחידה",
      salePrice,
      costPrice,
      stockQuantity,
      active: draft.active !== false,
    };
    const v = validateProductInput(payload, store.products, editingId || undefined);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    if (editingId) {
      const res = store.updateProduct(editingId, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("מוצר עודכן");
    } else {
      const res = store.createProduct(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("מוצר נוצר");
    }
    setMode("list");
    setEditingId(null);
    setDraft(emptyProductDraft());
  }

  return (
    <div className="space-y-4">
      {mode === "list" ? (
        <>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">מוצרים</h2>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
              >
                מוצר חדש
              </button>
            </div>
            <input
              className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
              placeholder="חיפוש: שם, דגם, SKU, ברקוד, מספר"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
            >
              <option value="all">הכול</option>
              <option value="active">פעילים</option>
              <option value="inactive">לא פעילים</option>
              <option value="in_stock">במלאי</option>
              <option value="out_of_stock">ללא מלאי</option>
            </select>
          </div>

          {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              אין מוצרים להצגה
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((p) => (
                <li key={p.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--muted)]" dir="ltr">
                        {p.productNumber}
                      </p>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {p.model ? `דגם ${p.model} · ` : ""}
                        {p.sku ? `SKU ${p.sku}` : "ללא SKU"}
                      </p>
                      <p className="text-sm text-[var(--muted)]">
                        מלאי {formatStock(p.stockQuantity)} {p.unit} · {p.active ? "פעיל" : "לא פעיל"}
                      </p>
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="font-semibold">{formatPriceILS(p.salePrice)}</p>
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="mt-2 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold"
                      >
                        עריכה
                      </button>
                      {p.active ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeactivateId(p.id)}
                          className="mt-1 block w-full text-xs text-rose-700 underline"
                        >
                          השבתה
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            store.setProductActive(p.id, true);
                            setMessage("מוצר הופעל מחדש");
                          }}
                          className="mt-1 block w-full text-xs text-emerald-700 underline"
                        >
                          הפעלה
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {confirmDeactivateId ? (
            <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-4 shadow-lg">
              <p className="text-sm font-medium">להשבית את המוצר?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="rounded-xl border py-3" onClick={() => setConfirmDeactivateId(null)}>
                  ביטול
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-rose-600 py-3 font-semibold text-white"
                  onClick={() => {
                    store.setProductActive(confirmDeactivateId, false);
                    setConfirmDeactivateId(null);
                    setMessage("מוצר הושבת");
                  }}
                >
                  השבתה
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <form
          className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            trySave();
          }}
        >
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            {editingId ? "עריכת מוצר" : "מוצר חדש"}
          </h2>
          {editingId ? (
            <p className="text-xs text-[var(--muted)]" dir="ltr">
              {store.products.find((p) => p.id === editingId)?.productNumber}
            </p>
          ) : null}
          <Field label="שם מוצר" value={draft.name || ""} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
          <Field label="דגם" value={draft.model || ""} onChange={(v) => setDraft((d) => ({ ...d, model: v }))} />
          <Field label="SKU" value={draft.sku || ""} onChange={(v) => setDraft((d) => ({ ...d, sku: v }))} />
          <Field
            label="Barcode"
            value={draft.barcode || ""}
            onChange={(v) => setDraft((d) => ({ ...d, barcode: v }))}
          />
          <Field
            label="תיאור"
            value={draft.description || ""}
            onChange={(v) => setDraft((d) => ({ ...d, description: v }))}
          />
          <Field label="מחיר מכירה" value={salePriceText} onChange={setSalePriceText} type="number" />
          <Field label="מחיר עלות" value={costPriceText} onChange={setCostPriceText} type="number" />
          <Field label="כמות נוכחית" value={stockText} onChange={setStockText} type="number" />
          <Field
            label="יחידת מידה"
            value={draft.unit || "יחידה"}
            onChange={(v) => setDraft((d) => ({ ...d, unit: v }))}
          />
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={cancelForm} className="rounded-xl border border-[var(--line)] py-3 font-semibold">
              ביטול
            </button>
            <button type="submit" className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-white">
              שמירה
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
