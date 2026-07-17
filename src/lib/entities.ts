import { nanoid } from "nanoid";
import {
  AppData,
  Customer,
  CustomerType,
  DeliveryArea,
  Product,
  emptyData,
} from "./types";
import { normalizeOrdersInData } from "./orders";
import { attachOpeningMovement, normalizeInventoryInData } from "./inventory";
import { normalizeDeliveriesInData } from "./deliveries";
import { normalizeFleetInData } from "./phase9a-fleet";

export const CUSTOMER_TYPES: CustomerType[] = ["private", "business"];
export const DELIVERY_AREAS: DeliveryArea[] = ["unassigned", "center", "north", "south"];

export const customerTypeLabel: Record<CustomerType, string> = {
  private: "פרטי",
  business: "עסקי",
};

export const deliveryAreaLabel: Record<DeliveryArea, string> = {
  unassigned: "לא הוגדר",
  center: "מרכז",
  north: "צפון",
  south: "דרום",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function finiteNum(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function stamp(): string {
  return new Date().toISOString();
}

export function formatCustomerNumber(n: number): string {
  return `CUS-${String(Math.max(0, Math.floor(n))).padStart(6, "0")}`;
}

export function formatProductNumber(n: number): string {
  return `PRD-${String(Math.max(0, Math.floor(n))).padStart(6, "0")}`;
}

export function parsePrefixedNumber(prefix: "CUS" | "PRD", value: string): number {
  const m = String(value || "")
    .trim()
    .match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function maxCustomerNumber(customers: Customer[]): number {
  let max = 0;
  for (const c of customers) max = Math.max(max, parsePrefixedNumber("CUS", c.customerNumber || ""));
  return max;
}

export function maxProductNumber(products: Product[]): number {
  let max = 0;
  for (const p of products) max = Math.max(max, parsePrefixedNumber("PRD", p.productNumber || ""));
  return max;
}

/** Last allocated counters reconstructed from stored counter + existing numbers. */
export function resolveCounters(data: AppData): { customerCounter: number; productCounter: number } {
  const customerCounter = Math.max(data.customerCounter ?? 0, maxCustomerNumber(data.customers || []));
  const productCounter = Math.max(data.productCounter ?? 0, maxProductNumber(data.products || []));
  return { customerCounter, productCounter };
}

export function normalizePhoneDigits(phone: string): string {
  return String(phone || "").replace(/\D/g, "");
}

export function isValidEmail(email: string): boolean {
  if (!email.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Normalize any legacy/partial customer row at read time.
 * Does not write to cloud.
 */
export function normalizeCustomer(raw: unknown, index = 0): Customer {
  const o = asRecord(raw) || {};
  const known = new Set([
    "id",
    "customerNumber",
    "customerType",
    "name",
    "businessName",
    "phone",
    "secondaryPhone",
    "email",
    "street",
    "houseNumber",
    "entrance",
    "floor",
    "apartment",
    "city",
    "zipCode",
    "deliveryArea",
    "deliveryNotes",
    "notes",
    "note",
    "active",
    "createdAt",
    "updatedAt",
  ]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!known.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype") {
      extras[k] = v;
    }
  }

  const customerType: CustomerType =
    o.customerType === "business" || o.customerType === "private" ? o.customerType : "private";
  const deliveryArea: DeliveryArea = DELIVERY_AREAS.includes(o.deliveryArea as DeliveryArea)
    ? (o.deliveryArea as DeliveryArea)
    : "unassigned";
  const now = stamp();
  const id = str(o.id) || `legacy-cus-${index + 1}`;
  const notes = str(o.notes, str(o.note));

  const base: Customer = {
    id,
    customerNumber: str(o.customerNumber) || formatCustomerNumber(index + 1),
    customerType,
    name: str(o.name),
    businessName: str(o.businessName),
    phone: str(o.phone),
    secondaryPhone: str(o.secondaryPhone),
    email: str(o.email),
    street: str(o.street),
    houseNumber: str(o.houseNumber),
    entrance: str(o.entrance),
    floor: str(o.floor),
    apartment: str(o.apartment),
    city: str(o.city),
    zipCode: str(o.zipCode),
    deliveryArea,
    deliveryNotes: str(o.deliveryNotes),
    notes,
    active: bool(o.active, true),
    createdAt: str(o.createdAt, now),
    updatedAt: str(o.updatedAt, now),
  };
  return { ...extras, ...base } as Customer;
}

export function normalizeProduct(raw: unknown, index = 0): Product {
  const o = asRecord(raw) || {};
  const known = new Set([
    "id",
    "productNumber",
    "name",
    "model",
    "sku",
    "barcode",
    "description",
    "salePrice",
    "costPrice",
    "stockQuantity",
    "unit",
    "active",
    "createdAt",
    "updatedAt",
    "price",
    "stock",
  ]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!known.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype") {
      extras[k] = v;
    }
  }
  const now = stamp();
  const salePrice = finiteNum(o.salePrice, finiteNum(o.price, 0));
  const stockQuantity = finiteNum(o.stockQuantity, finiteNum(o.stock, 0));
  const base: Product = {
    id: str(o.id) || `legacy-prd-${index + 1}`,
    productNumber: str(o.productNumber) || formatProductNumber(index + 1),
    name: str(o.name),
    model: str(o.model),
    sku: str(o.sku),
    barcode: str(o.barcode),
    description: str(o.description),
    salePrice: Math.max(0, salePrice),
    costPrice: Math.max(0, finiteNum(o.costPrice, 0)),
    stockQuantity: Math.max(0, stockQuantity),
    unit: str(o.unit, "יחידה") || "יחידה",
    active: bool(o.active, true),
    createdAt: str(o.createdAt, now),
    updatedAt: str(o.updatedAt, now),
  };
  return { ...extras, ...base } as Product;
}

export function normalizeAppDataEntities(data: AppData): AppData {
  const customers = (data.customers || []).map((c, i) => normalizeCustomer(c, i));
  const products = (data.products || []).map((p, i) => normalizeProduct(p, i));
  const counters = resolveCounters({ ...data, customers, products });
  const withEntities: AppData = {
    ...data,
    customers,
    products,
    orders: Array.isArray(data.orders) ? data.orders : [],
    inventoryMovements: Array.isArray(data.inventoryMovements) ? data.inventoryMovements : [],
    deliveries: Array.isArray(data.deliveries) ? data.deliveries : [],
    drivers: Array.isArray(data.drivers) ? data.drivers : [],
    vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
    deliveryRoutes: Array.isArray(data.deliveryRoutes) ? data.deliveryRoutes : [],
    customerCounter: counters.customerCounter,
    productCounter: counters.productCounter,
    counters: {
      nextOrderNumber: data.counters?.nextOrderNumber ?? 0,
      nextInventoryMovementNumber: data.counters?.nextInventoryMovementNumber ?? 0,
      nextDeliveryNumber: data.counters?.nextDeliveryNumber ?? 0,
      nextDriverNumber: data.counters?.nextDriverNumber ?? 0,
      nextVehicleNumber: data.counters?.nextVehicleNumber ?? 0,
      nextDeliveryRouteNumber: data.counters?.nextDeliveryRouteNumber ?? 0,
      nextRouteStopNumber: data.counters?.nextRouteStopNumber ?? 0,
    },
  };
  return normalizeFleetInData(
    normalizeDeliveriesInData(normalizeInventoryInData(normalizeOrdersInData(withEntities)))
  );
}

export type CustomerInput = Omit<Customer, "id" | "customerNumber" | "createdAt" | "updatedAt"> & {
  id?: string;
  customerNumber?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductInput = Omit<Product, "id" | "productNumber" | "createdAt" | "updatedAt"> & {
  id?: string;
  productNumber?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateCustomerInput(
  input: Partial<Customer>,
  opts: { isNew: boolean }
): ValidationResult {
  const type: CustomerType = input.customerType === "business" ? "business" : "private";
  const name = String(input.name || "").trim();
  const businessName = String(input.businessName || "").trim();
  const phone = String(input.phone || "").trim();
  const email = String(input.email || "").trim();

  if (type === "private" && !name) return { ok: false, error: "שם לקוח חובה" };
  if (type === "business" && !businessName && !name) {
    return { ok: false, error: "יש להזין שם עסק או שם לקוח" };
  }
  if (opts.isNew && !phone) return { ok: false, error: "טלפון חובה ללקוח חדש" };
  if (email && !isValidEmail(email)) return { ok: false, error: "אימייל אינו תקין" };
  if (input.deliveryArea && !DELIVERY_AREAS.includes(input.deliveryArea)) {
    return { ok: false, error: "אזור משלוח אינו תקין" };
  }
  return { ok: true };
}

export function validateProductInput(
  input: Partial<Product>,
  all: Product[],
  editingId?: string
): ValidationResult {
  const name = String(input.name || "").trim();
  if (!name) return { ok: false, error: "שם מוצר חובה" };

  const salePrice = Number(input.salePrice);
  const costPrice = Number(input.costPrice);
  const stockQuantity = Number(input.stockQuantity);
  if (!Number.isFinite(salePrice) || salePrice < 0) return { ok: false, error: "מחיר מכירה אינו תקין" };
  if (!Number.isFinite(costPrice) || costPrice < 0) return { ok: false, error: "מחיר עלות אינו תקין" };
  if (!Number.isFinite(stockQuantity) || stockQuantity < 0) return { ok: false, error: "כמות מלאי אינה תקינה" };

  const sku = String(input.sku || "").trim();
  const barcode = String(input.barcode || "").trim();
  if (sku) {
    const dup = all.find((p) => p.id !== editingId && String(p.sku || "").trim() === sku);
    if (dup) return { ok: false, error: "SKU כבר קיים במוצר אחר" };
  }
  if (barcode) {
    const dup = all.find((p) => p.id !== editingId && String(p.barcode || "").trim() === barcode);
    if (dup) return { ok: false, error: "ברקוד כבר קיים במוצר אחר" };
  }
  return { ok: true };
}

export function findDuplicatePhoneCustomers(
  customers: Customer[],
  phone: string,
  excludeId?: string
): Customer[] {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return [];
  return customers.filter(
    (c) => c.id !== excludeId && normalizePhoneDigits(c.phone) === digits
  );
}

/** Potential duplicates by phone (primary) or exact name / business name. */
export function findPotentialDuplicateCustomers(
  customers: Customer[],
  input: { phone?: string; name?: string; businessName?: string },
  excludeId?: string
): { byPhone: Customer[]; byNameOrBusiness: Customer[]; all: Customer[] } {
  const byPhone = findDuplicatePhoneCustomers(customers, input.phone || "", excludeId);
  const name = String(input.name || "").trim().toLowerCase();
  const business = String(input.businessName || "").trim().toLowerCase();
  const byNameOrBusiness = customers.filter((c) => {
    if (excludeId && c.id === excludeId) return false;
    if (byPhone.some((d) => d.id === c.id)) return false;
    const cn = String(c.name || "")
      .trim()
      .toLowerCase();
    const cb = String(c.businessName || "")
      .trim()
      .toLowerCase();
    return (Boolean(name) && cn === name) || (Boolean(business) && cb === business);
  });
  const seen = new Set<string>();
  const all: Customer[] = [];
  for (const c of [...byPhone, ...byNameOrBusiness]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    all.push(c);
  }
  return { byPhone, byNameOrBusiness, all };
}

export function allocateCustomer(
  data: AppData,
  input: CustomerInput
): { data: AppData; customer: Customer } | { error: string } {
  const v = validateCustomerInput(input, { isNew: true });
  if (!v.ok) return { error: v.error };
  const counters = resolveCounters(data);
  const next = counters.customerCounter + 1;
  const now = stamp();
  const customer = normalizeCustomer(
    {
      ...input,
      id: nanoid(),
      customerNumber: formatCustomerNumber(next),
      createdAt: now,
      updatedAt: now,
      active: input.active !== false,
    },
    next - 1
  );
  return {
    customer,
    data: {
      ...data,
      customers: [customer, ...data.customers],
      customerCounter: next,
      updatedAt: now,
    },
  };
}

export function updateCustomerInData(
  data: AppData,
  id: string,
  patch: Partial<Customer>
): { data: AppData; customer: Customer } | { error: string } {
  const existing = data.customers.find((c) => c.id === id);
  if (!existing) return { error: "לקוח לא נמצא" };
  const merged = {
    ...existing,
    ...patch,
    id: existing.id,
    customerNumber: existing.customerNumber,
    createdAt: existing.createdAt,
    updatedAt: stamp(),
  };
  const v = validateCustomerInput(merged, { isNew: false });
  if (!v.ok) return { error: v.error };
  const customer = normalizeCustomer(merged);
  return {
    customer,
    data: {
      ...data,
      customers: data.customers.map((c) => (c.id === id ? customer : c)),
      updatedAt: customer.updatedAt,
    },
  };
}

export function setCustomerActiveInData(
  data: AppData,
  id: string,
  active: boolean
): { data: AppData } | { error: string } {
  const existing = data.customers.find((c) => c.id === id);
  if (!existing) return { error: "לקוח לא נמצא" };
  const now = stamp();
  const customer = { ...existing, active, updatedAt: now };
  return {
    data: {
      ...data,
      customers: data.customers.map((c) => (c.id === id ? customer : c)),
      updatedAt: now,
    },
  };
}

export function allocateProduct(
  data: AppData,
  input: ProductInput
): { data: AppData; product: Product } | { error: string } {
  const v = validateProductInput(input, data.products);
  if (!v.ok) return { error: v.error };
  const counters = resolveCounters(data);
  const next = counters.productCounter + 1;
  const now = stamp();
  const product = normalizeProduct(
    {
      ...input,
      id: nanoid(),
      productNumber: formatProductNumber(next),
      unit: input.unit || "יחידה",
      active: input.active !== false,
      createdAt: now,
      updatedAt: now,
    },
    next - 1
  );
  let nextData: AppData = {
    ...data,
    products: [product, ...data.products],
    productCounter: next,
    inventoryMovements: Array.isArray(data.inventoryMovements) ? data.inventoryMovements : [],
    updatedAt: now,
  };
  // Opening movement only when initial stock > 0 — same local state mutation as product create.
  if (product.stockQuantity > 0) {
    const opened = attachOpeningMovement(nextData, product);
    if ("error" in opened && opened.error !== "NO_OPENING") {
      return { error: opened.error };
    }
    if (!("error" in opened)) {
      nextData = opened.data;
    }
  }
  return { product, data: nextData };
}

export function updateProductInData(
  data: AppData,
  id: string,
  patch: Partial<Product>
): { data: AppData; product: Product } | { error: string } {
  const existing = data.products.find((p) => p.id === id);
  if (!existing) return { error: "מוצר לא נמצא" };
  const { stockQuantity: _stockIgnored, ...safePatch } = patch;
  void _stockIgnored;
  const merged = {
    ...existing,
    ...safePatch,
    id: existing.id,
    productNumber: existing.productNumber,
    stockQuantity: existing.stockQuantity,
    createdAt: existing.createdAt,
    updatedAt: stamp(),
  };
  const v = validateProductInput(merged, data.products, id);
  if (!v.ok) return { error: v.error };
  const product = normalizeProduct(merged);
  return {
    product,
    data: {
      ...data,
      products: data.products.map((p) => (p.id === id ? product : p)),
      updatedAt: product.updatedAt,
    },
  };
}

export function setProductActiveInData(
  data: AppData,
  id: string,
  active: boolean
): { data: AppData } | { error: string } {
  const existing = data.products.find((p) => p.id === id);
  if (!existing) return { error: "מוצר לא נמצא" };
  const now = stamp();
  const product = { ...existing, active, updatedAt: now };
  return {
    data: {
      ...data,
      products: data.products.map((p) => (p.id === id ? product : p)),
      updatedAt: now,
    },
  };
}

export function emptyCustomerDraft(): CustomerInput {
  return {
    customerType: "private",
    name: "",
    businessName: "",
    phone: "",
    secondaryPhone: "",
    email: "",
    street: "",
    houseNumber: "",
    entrance: "",
    floor: "",
    apartment: "",
    city: "",
    zipCode: "",
    deliveryArea: "unassigned",
    deliveryNotes: "",
    notes: "",
    active: true,
  };
}

export function emptyProductDraft(): ProductInput {
  return {
    name: "",
    model: "",
    sku: "",
    barcode: "",
    description: "",
    salePrice: 0,
    costPrice: 0,
    stockQuantity: 0,
    unit: "יחידה",
    active: true,
  };
}

export function formatStock(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

export function formatPriceILS(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Spec helper — empty workspace seed shape */
export function blankWorkspaceData(): AppData {
  return emptyData();
}
