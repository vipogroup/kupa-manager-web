"use client";

import { useMemo, useState } from "react";
import { useKupaStore } from "@/lib/store";
import { formatStock } from "@/lib/entities";
import {
  filterProductsForInventory,
  inventorySummary,
  movementTypeLabel,
  movementsForProduct,
  sortMovementsNewestFirst,
  type InventoryFilter,
} from "@/lib/inventory";
import type { InventoryMovement, InventoryMovementType, Product } from "@/lib/types";

type View =
  | { kind: "list" }
  | { kind: "history"; productId?: string }
  | { kind: "move"; productId: string; movementType: "increase" | "decrease" | "correction" };

type HistoryTypeFilter = "all" | InventoryMovementType;

function parsePositiveQty(text: string): number | null {
  const n = Number(String(text).trim());
  if (!Number.isFinite(n) || Number.isNaN(n) || n === Infinity || n === -Infinity) return null;
  if (n < 0) return null;
  return n;
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function InventoryPanel({ initialProductId }: { initialProductId?: string | null }) {
  const store = useKupaStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [view, setView] = useState<View>(
    initialProductId ? { kind: "move", productId: initialProductId, movementType: "increase" } : { kind: "list" }
  );
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyType, setHistoryType] = useState<HistoryTypeFilter>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Movement form state
  const [qtyText, setQtyText] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);

  const summary = useMemo(() => inventorySummary(store.products), [store.products]);
  const filtered = useMemo(
    () => filterProductsForInventory(store.products, query, filter),
    [store.products, query, filter]
  );

  const historyRows = useMemo(() => {
    let rows =
      view.kind === "history" && view.productId
        ? movementsForProduct(store.inventoryMovements || [], view.productId)
        : sortMovementsNewestFirst(store.inventoryMovements || []);
    if (historyType !== "all") {
      rows = rows.filter((m) => m.movementType === historyType);
    }
    const q = historyQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((m) => {
        const hay = [
          m.movementNumber,
          m.productSnapshot?.name,
          m.productSnapshot?.model,
          m.productSnapshot?.productNumber,
          m.reason,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return rows;
  }, [store.inventoryMovements, view, historyQuery, historyType]);

  function openMove(product: Product, movementType: "increase" | "decrease" | "correction") {
    if (!product.active) {
      setError("לא ניתן לשנות מלאי למוצר לא פעיל");
      return;
    }
    setError("");
    setMessage("");
    setQtyText("");
    setReason("");
    setNotes("");
    setConfirmSave(false);
    setView({ kind: "move", productId: product.id, movementType });
  }

  function cancelMove() {
    setView({ kind: "list" });
    setQtyText("");
    setReason("");
    setNotes("");
    setConfirmSave(false);
    setError("");
  }

  function previewAfter(product: Product): number | null {
    const qty = parsePositiveQty(qtyText);
    if (qty === null) return null;
    if (view.kind !== "move") return null;
    const before = product.stockQuantity;
    if (view.movementType === "increase") return before + qty;
    if (view.movementType === "decrease") return before - qty;
    return qty;
  }

  function trySaveMovement(product: Product) {
    if (view.kind !== "move") return;
    setError("");
    const qty = parsePositiveQty(qtyText);
    if (qty === null) {
      setError("כמות אינה תקינה");
      return;
    }
    if (view.movementType !== "correction" && qty === 0) {
      setError("כמות חייבת להיות גדולה מ-0");
      return;
    }
    if (!confirmSave) {
      setConfirmSave(true);
      return;
    }
    const res = store.createInventoryMovement({
      productId: product.id,
      movementType: view.movementType,
      quantity: qty,
      reason,
      notes,
    });
    if (!res.ok) {
      setError(res.error);
      setConfirmSave(false);
      return;
    }
    setMessage("תנועת מלאי נשמרה");
    setView({ kind: "list" });
    setConfirmSave(false);
    setQtyText("");
    setReason("");
    setNotes("");
  }

  if (view.kind === "move") {
    const product = store.products.find((p) => p.id === view.productId);
    if (!product) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-rose-700">מוצר לא נמצא</p>
          <button type="button" className="rounded-xl border px-4 py-3" onClick={cancelMove}>
            חזרה
          </button>
        </div>
      );
    }
    const after = previewAfter(product);
    const typeLabel = movementTypeLabel[view.movementType];
    return (
      <div
        className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        data-testid="inv-movement-form"
      >
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">{typeLabel}</h2>
        <div className="rounded-xl bg-black/5 p-3 text-sm">
          <p className="font-semibold">{product.name}</p>
          <p className="text-[var(--muted)]">{product.model ? `דגם ${product.model}` : "ללא דגם"}</p>
          <p className="mt-1">
            כמות נוכחית: <strong>{formatStock(product.stockQuantity)}</strong> {product.unit}
          </p>
        </div>
        <label className="block text-sm font-medium">
          {view.movementType === "correction" ? "כמות יעד" : "כמות"}
          <input
            data-testid="inv-qty-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={qtyText}
            onChange={(e) => {
              setQtyText(e.target.value);
              setConfirmSave(false);
            }}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        {(view.movementType === "decrease" || view.movementType === "correction") && (
          <label className="block text-sm font-medium">
            סיבה
            <input
              data-testid="inv-reason-input"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setConfirmSave(false);
              }}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
            />
          </label>
        )}
        <label className="block text-sm font-medium">
          הערות (אופציונלי)
          <textarea
            data-testid="inv-notes-input"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setConfirmSave(false);
            }}
            rows={2}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
          />
        </label>
        <div
          className="rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm"
          data-testid="inv-preview"
        >
          תצוגה מקדימה: {formatStock(product.stockQuantity)} →{" "}
          {after === null ? "—" : formatStock(after)}
        </div>
        {error ? (
          <p className="text-sm text-rose-700" data-testid="inv-error">
            {error}
          </p>
        ) : null}
        {confirmSave ? (
          <p className="text-sm text-amber-800" data-testid="inv-confirm-hint">
            לחצו שוב לאישור השמירה
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            data-testid="inv-cancel"
            onClick={cancelMove}
            className="rounded-xl border border-[var(--line)] py-3 font-semibold"
          >
            ביטול
          </button>
          <button
            type="button"
            data-testid="inv-save"
            onClick={() => trySaveMovement(product)}
            className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-white"
          >
            {confirmSave ? "אישור שמירה" : "שמירה"}
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "history") {
    const product =
      view.productId != null ? store.products.find((p) => p.id === view.productId) : null;
    return (
      <div className="space-y-4" data-testid="inv-history">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              היסטוריית תנועות
            </h2>
            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm"
              onClick={() => setView({ kind: "list" })}
            >
              חזרה
            </button>
          </div>
          {product ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {product.name}
              {product.model ? ` · ${product.model}` : ""}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--muted)]" data-testid="inv-history-notice">
            היסטוריית התנועות מתחילה ממועד הפעלת ניהול המלאי.
          </p>
          <input
            data-testid="inv-history-search"
            className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
            placeholder="חיפוש: מוצר או מספר תנועה"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
          />
          <select
            data-testid="inv-history-type"
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
            value={historyType}
            onChange={(e) => setHistoryType(e.target.value as HistoryTypeFilter)}
          >
            <option value="all">כל הסוגים</option>
            <option value="opening">יתרת פתיחה</option>
            <option value="increase">הוספת מלאי</option>
            <option value="decrease">הפחתת מלאי</option>
            <option value="correction">תיקון כמות</option>
          </select>
        </div>
        {historyRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            אין תנועות להצגה
          </p>
        ) : (
          <ul className="space-y-2 overflow-x-hidden">
            {historyRows.map((m) => (
              <MovementCard key={m.id} movement={m} />
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-x-hidden" data-testid="inv-list" dir="rtl">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">מלאי</h2>
          <button
            type="button"
            data-testid="inv-open-all-history"
            onClick={() => {
              setHistoryQuery("");
              setHistoryType("all");
              setView({ kind: "history" });
            }}
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold"
          >
            היסטוריה
          </button>
        </div>
        <input
          data-testid="inv-search"
          className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
          placeholder="חיפוש: מספר, שם, דגם, SKU, ברקוד"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          data-testid="inv-filter"
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
          value={filter}
          onChange={(e) => setFilter(e.target.value as InventoryFilter)}
        >
          <option value="all">הכול</option>
          <option value="active">פעילים</option>
          <option value="inactive">לא פעילים</option>
          <option value="in_stock">במלאי</option>
          <option value="out_of_stock">ללא מלאי</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2" data-testid="inv-summary">
        <SummaryCard label="מוצרים פעילים" value={String(summary.activeCount)} />
        <SummaryCard label="במלאי" value={String(summary.inStockCount)} />
        <SummaryCard label="ללא מלאי" value={String(summary.outOfStockCount)} />
        <SummaryCard label="סך יחידות" value={formatStock(summary.totalUnits)} />
      </div>

      {message ? (
        <p className="text-sm text-emerald-800" data-testid="inv-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-rose-700" data-testid="inv-list-error">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          אין מוצרים להצגה
        </p>
      ) : (
        <ul className="space-y-2" data-testid="inv-product-cards">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3"
              data-testid={`inv-card-${p.id}`}
            >
              <p className="text-xs text-[var(--muted)]" dir="ltr">
                {p.productNumber}
              </p>
              <p className="font-semibold break-words">{p.name}</p>
              <p className="text-sm text-[var(--muted)] break-words">
                {p.model ? `דגם ${p.model}` : "ללא דגם"}
                {p.sku ? ` · SKU ${p.sku}` : ""}
              </p>
              <p className="mt-1 text-sm">
                כמות: <strong>{formatStock(p.stockQuantity)}</strong> {p.unit} ·{" "}
                {p.active ? "פעיל" : "לא פעיל"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!p.active}
                  onClick={() => openMove(p, "increase")}
                  className="rounded-xl border border-[var(--line)] px-2 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  הוסף מלאי
                </button>
                <button
                  type="button"
                  disabled={!p.active}
                  onClick={() => openMove(p, "decrease")}
                  className="rounded-xl border border-[var(--line)] px-2 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  הפחת מלאי
                </button>
                <button
                  type="button"
                  disabled={!p.active}
                  onClick={() => openMove(p, "correction")}
                  className="rounded-xl border border-[var(--line)] px-2 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  תיקון כמות
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryQuery("");
                    setHistoryType("all");
                    setView({ kind: "history", productId: p.id });
                  }}
                  className="rounded-xl border border-[var(--line)] px-2 py-2 text-xs font-semibold"
                >
                  היסטוריה
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function MovementCard({ movement }: { movement: InventoryMovement }) {
  return (
    <li
      className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm"
      data-testid={`inv-mov-${movement.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold" dir="ltr">
          {movement.movementNumber}
        </p>
        <p className="text-xs text-[var(--muted)]">{formatWhen(movement.createdAt)}</p>
      </div>
      <p className="mt-1 break-words font-medium">{movement.productSnapshot?.name || "מוצר"}</p>
      <p className="text-[var(--muted)] break-words">
        {movement.productSnapshot?.model ? `דגם ${movement.productSnapshot.model}` : "ללא דגם"}
      </p>
      <p className="mt-1">{movementTypeLabel[movement.movementType] || movement.movementType}</p>
      <p className="mt-1">
        {formatStock(movement.quantityBefore)} → {formatStock(movement.quantityAfter)} (
        {movement.quantityDelta > 0 ? "+" : ""}
        {formatStock(movement.quantityDelta)})
      </p>
      {movement.reason ? <p className="mt-1 text-[var(--muted)]">סיבה: {movement.reason}</p> : null}
      {movement.notes ? <p className="text-[var(--muted)]">הערות: {movement.notes}</p> : null}
    </li>
  );
}
