import { nanoid } from "nanoid";
import {
  AppData,
  InventoryMovement,
  InventoryMovementType,
  Product,
  ProductSnapshot,
  emptyData,
} from "./types";
import { snapshotFromProduct, emptyProductSnapshot } from "./orders";

export const INVENTORY_MOVEMENT_TYPES: InventoryMovementType[] = [
  "opening",
  "increase",
  "decrease",
  "correction",
];

export const movementTypeLabel: Record<InventoryMovementType, string> = {
  opening: "יתרת פתיחה",
  increase: "הוספת מלאי",
  decrease: "הפחתת מלאי",
  correction: "תיקון כמות",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function stamp(): string {
  return new Date().toISOString();
}

/** Consistent decimal normalization (3 places) to limit float drift. */
export function normalizeQty(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function isValidStockQty(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n) && !Number.isNaN(n) && n >= 0;
}

export function formatMovementNumber(n: number): string {
  return `MOV-WEB-${String(Math.max(0, Math.floor(n))).padStart(6, "0")}`;
}

export function parseMovementNumber(value: string): number {
  const m = String(value || "")
    .trim()
    .match(/^MOV-WEB-(\d+)$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function maxMovementNumber(movements: InventoryMovement[]): number {
  let max = 0;
  for (const mv of movements || []) max = Math.max(max, parseMovementNumber(mv.movementNumber || ""));
  return max;
}

export function resolveInventoryCounter(data: AppData): number {
  const fromCounter = data.counters?.nextInventoryMovementNumber ?? 0;
  return Math.max(fromCounter, maxMovementNumber(data.inventoryMovements || []));
}

export function normalizeProductSnapshot(raw: unknown): ProductSnapshot {
  const o = asRecord(raw) || {};
  const base = emptyProductSnapshot();
  return {
    ...base,
    productNumber: str(o.productNumber),
    name: str(o.name),
    model: str(o.model),
    sku: str(o.sku),
    barcode: str(o.barcode),
    unit: str(o.unit, "יחידה") || "יחידה",
  };
}

export function normalizeInventoryMovement(raw: unknown, index = 0): InventoryMovement {
  const o = asRecord(raw) || {};
  const known = new Set([
    "id",
    "movementNumber",
    "productId",
    "productSnapshot",
    "movementType",
    "quantityDelta",
    "quantityBefore",
    "quantityAfter",
    "reason",
    "notes",
    "createdAt",
  ]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!known.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype") {
      extras[k] = v;
    }
  }
  const typeRaw = str(o.movementType, "correction");
  const movementType: InventoryMovementType = INVENTORY_MOVEMENT_TYPES.includes(
    typeRaw as InventoryMovementType
  )
    ? (typeRaw as InventoryMovementType)
    : "correction";

  const qty = (v: unknown, fb = 0) => {
    if (typeof v === "number" && Number.isFinite(v)) return normalizeQty(v);
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return normalizeQty(n);
    }
    return fb;
  };

  const movement: InventoryMovement = {
    id: str(o.id) || `legacy-mov-${index + 1}`,
    movementNumber: str(o.movementNumber) || formatMovementNumber(index + 1),
    productId: str(o.productId),
    productSnapshot: normalizeProductSnapshot(o.productSnapshot),
    movementType,
    quantityDelta: qty(o.quantityDelta, 0),
    quantityBefore: Math.max(0, qty(o.quantityBefore, 0)),
    quantityAfter: Math.max(0, qty(o.quantityAfter, 0)),
    reason: str(o.reason),
    notes: str(o.notes),
    createdAt: str(o.createdAt, stamp()),
  };
  return { ...extras, ...movement } as InventoryMovement;
}

export function normalizeInventoryInData(data: AppData): AppData {
  const inventoryMovements = Array.isArray(data.inventoryMovements)
    ? data.inventoryMovements.map((m, i) => normalizeInventoryMovement(m, i))
    : [];
  const nextInventoryMovementNumber = resolveInventoryCounter({ ...data, inventoryMovements });
  return {
    ...data,
    inventoryMovements,
    counters: {
      nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
      nextDeliveryNumber: data.counters?.nextDeliveryNumber ?? 0,
      ...(data.counters || {}),
      nextInventoryMovementNumber,
    },
  };
}

export type MovementCreateInput = {
  productId: string;
  movementType: "increase" | "decrease" | "correction";
  /** Positive amount for increase/decrease; target quantity for correction. */
  quantity: number;
  reason?: string;
  notes?: string;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateMovementInput(
  data: AppData,
  input: MovementCreateInput
): ValidationResult {
  const product = (data.products || []).find((p) => p.id === input.productId);
  if (!product) return { ok: false, error: "מוצר חובה" };
  if (!product.active) return { ok: false, error: "לא ניתן לשנות מלאי למוצר לא פעיל" };

  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || Number.isNaN(qty)) return { ok: false, error: "כמות אינה תקינה" };
  if (!Number.isFinite(qty) || qty === Infinity || qty === -Infinity) {
    return { ok: false, error: "כמות אינה תקינה" };
  }
  if (qty < 0) return { ok: false, error: "כמות חייבת להיות חיובית" };
  if (input.movementType !== "correction" && qty === 0) {
    return { ok: false, error: "כמות חייבת להיות גדולה מ-0" };
  }

  const reason = String(input.reason || "").trim();
  if (input.movementType === "decrease" || input.movementType === "correction") {
    if (reason.length < 2) return { ok: false, error: "סיבה חובה (לפחות 2 תווים)" };
  }

  const before = normalizeQty(Math.max(0, product.stockQuantity || 0));
  if (input.movementType === "decrease") {
    const after = normalizeQty(before - normalizeQty(qty));
    if (after < 0) return { ok: false, error: "לא ניתן להפחית מלאי מתחת לאפס" };
  }
  if (input.movementType === "correction") {
    const target = normalizeQty(qty);
    if (!isValidStockQty(target)) return { ok: false, error: "כמות יעד אינה תקינה" };
    if (target === before) return { ok: false, error: "הכמות זהה לכמות הקיימת — לא נוצרה תנועה" };
  }

  return { ok: true };
}

function bannedKeys(o: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(o, "__proto__")
    || Object.prototype.hasOwnProperty.call(o, "constructor")
    || Object.prototype.hasOwnProperty.call(o, "prototype");
}

export type ApplyMovementResult =
  | { data: AppData; movement: InventoryMovement; product: Product }
  | { error: string };

/**
 * Atomic: validate → allocate number → create movement → update product stock → bump counter.
 * On any failure the previous state is unchanged (pure function).
 */
export function applyInventoryMovement(
  data: AppData,
  input: MovementCreateInput
): ApplyMovementResult {
  if (bannedKeys(input as unknown as Record<string, unknown>)) {
    return { error: "קלט לא תקין" };
  }
  const v = validateMovementInput(data, input);
  if (!v.ok) return { error: v.error };

  const products = data.products || [];
  const productIdx = products.findIndex((p) => p.id === input.productId);
  if (productIdx < 0) return { error: "מוצר חובה" };
  const product = products[productIdx];
  if (!product.active) return { error: "לא ניתן לשנות מלאי למוצר לא פעיל" };

  const before = normalizeQty(Math.max(0, product.stockQuantity || 0));
  const requested = normalizeQty(Number(input.quantity));
  if (!Number.isFinite(requested)) return { error: "כמות אינה תקינה" };

  let delta = 0;
  let after = before;
  if (input.movementType === "increase") {
    if (!(requested > 0)) return { error: "כמות חייבת להיות גדולה מ-0" };
    delta = requested;
    after = normalizeQty(before + requested);
  } else if (input.movementType === "decrease") {
    if (!(requested > 0)) return { error: "כמות חייבת להיות גדולה מ-0" };
    delta = normalizeQty(-requested);
    after = normalizeQty(before - requested);
    if (after < 0) return { error: "לא ניתן להפחית מלאי מתחת לאפס" };
  } else {
    // correction: quantity is target
    if (!isValidStockQty(requested)) return { error: "כמות יעד אינה תקינה" };
    after = requested;
    delta = normalizeQty(after - before);
    if (delta === 0) return { error: "הכמות זהה לכמות הקיימת — לא נוצרה תנועה" };
  }

  if (!isValidStockQty(after)) return { error: "כמות אחרי תנועה אינה תקינה" };

  const counter = resolveInventoryCounter(data);
  const next = counter + 1;
  const now = stamp();
  const reason = String(input.reason || "").trim();
  const notes = String(input.notes || "").trim();

  const movement: InventoryMovement = {
    id: nanoid(),
    movementNumber: formatMovementNumber(next),
    productId: product.id,
    productSnapshot: snapshotFromProduct(product),
    movementType: input.movementType,
    quantityDelta: delta,
    quantityBefore: before,
    quantityAfter: after,
    reason,
    notes,
    createdAt: now,
  };

  const updatedProduct: Product = {
    ...product,
    stockQuantity: after,
    updatedAt: now,
  };
  const nextProducts = products.map((p, i) => (i === productIdx ? updatedProduct : p));
  const inventoryMovements = [movement, ...(data.inventoryMovements || [])];

  return {
    movement,
    product: updatedProduct,
    data: {
      ...data,
      products: nextProducts,
      inventoryMovements,
      counters: {
        nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
        nextDeliveryNumber: data.counters?.nextDeliveryNumber ?? 0,
        ...(data.counters || {}),
        nextInventoryMovementNumber: next,
      },
      updatedAt: now,
    },
  };
}

/**
 * Opening balance for a newly created product (stockQuantity already set on product).
 * quantityBefore = 0, quantityAfter = product.stockQuantity.
 * Must run in the same local state mutation as product creation.
 */
export function attachOpeningMovement(
  data: AppData,
  product: Product
): ApplyMovementResult {
  const qty = normalizeQty(Math.max(0, product.stockQuantity || 0));
  if (!(qty > 0)) {
    return { error: "NO_OPENING" };
  }
  if (!isValidStockQty(qty)) return { error: "כמות אינה תקינה" };

  const counter = resolveInventoryCounter(data);
  const next = counter + 1;
  const now = stamp();
  const movement: InventoryMovement = {
    id: nanoid(),
    movementNumber: formatMovementNumber(next),
    productId: product.id,
    productSnapshot: snapshotFromProduct(product),
    movementType: "opening",
    quantityDelta: qty,
    quantityBefore: 0,
    quantityAfter: qty,
    reason: "יתרת פתיחה",
    notes: "",
    createdAt: now,
  };

  return {
    movement,
    product,
    data: {
      ...data,
      inventoryMovements: [movement, ...(data.inventoryMovements || [])],
      counters: {
        nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
        nextDeliveryNumber: data.counters?.nextDeliveryNumber ?? 0,
        ...(data.counters || {}),
        nextInventoryMovementNumber: next,
      },
      updatedAt: now,
    },
  };
}

export function movementsForProduct(
  movements: InventoryMovement[],
  productId: string
): InventoryMovement[] {
  return (movements || [])
    .filter((m) => m.productId === productId)
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function sortMovementsNewestFirst(movements: InventoryMovement[]): InventoryMovement[] {
  return (movements || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export type InventoryFilter = "all" | "active" | "inactive" | "in_stock" | "out_of_stock";

export function filterProductsForInventory(
  products: Product[],
  query: string,
  filter: InventoryFilter
): Product[] {
  const q = query.trim().toLowerCase();
  return products.filter((p) => {
    if (filter === "active" && !p.active) return false;
    if (filter === "inactive" && p.active) return false;
    if (filter === "in_stock" && !(p.stockQuantity > 0)) return false;
    if (filter === "out_of_stock" && p.stockQuantity > 0) return false;
    if (!q) return true;
    const hay = [p.productNumber, p.name, p.model, p.sku, p.barcode].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export function inventorySummary(products: Product[]) {
  const list = products || [];
  const active = list.filter((p) => p.active);
  const inStock = active.filter((p) => p.stockQuantity > 0);
  const outOfStock = active.filter((p) => !(p.stockQuantity > 0));
  const totalUnits = normalizeQty(
    list.reduce((acc, p) => acc + (Number.isFinite(p.stockQuantity) ? p.stockQuantity : 0), 0)
  );
  return {
    activeCount: active.length,
    inStockCount: inStock.length,
    outOfStockCount: outOfStock.length,
    totalUnits: Number.isFinite(totalUnits) ? totalUnits : 0,
  };
}

export function blankInventoryWorkspace(): AppData {
  return emptyData();
}
