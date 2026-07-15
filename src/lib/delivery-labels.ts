import type { Delivery, DeliveryItemSnapshot } from "./types";
import {
  customerDisplayName,
  deliveryAreaLabelHe,
  formatFullDeliveryAddress,
  formatDeliveryItemLine,
} from "./deliveries";

/** Fixed sheet layout — do not change without updating print CSS. */
export const LABELS_PER_PAGE = 18;
export const LABEL_COLUMNS = 3;
export const LABEL_ROWS = 6;
/** Max product lines per physical label cell before a continuation label is used. */
export const MAX_PRODUCT_LINES_PER_LABEL = 5;

export type LabelPrintMode = "selected" | "filtered";

export type DeliveryLabelContent = {
  deliveryId: string;
  deliveryNumber: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  secondaryPhone: string;
  address: string;
  areaLabel: string;
  productLines: string[];
  productsFullText: string;
  totalAmount: number;
  paymentLabel: string;
  scheduledDate: string;
  /** 1-based part index when products spill across labels. */
  partIndex: number;
  partTotal: number;
  isContinuation: boolean;
};

export function safeDisplayText(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || Number.isNaN(v)) return fallback;
    return String(v);
  }
  const s = String(v).trim();
  if (!s || s === "undefined" || s === "null" || s === "NaN" || s === "Infinity" || s === "-Infinity") {
    return fallback;
  }
  return s;
}

export function safeMoneyAmount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n) && !Number.isNaN(n)) return n;
  }
  return 0;
}

function productLinesFromItems(items: DeliveryItemSnapshot[]): string[] {
  return (items || []).map((it) => {
    const line = formatDeliveryItemLine(it);
    return safeDisplayText(line, "פריט");
  });
}

/**
 * Expand one delivery into one or more label slots.
 * Never silently drops products — overflow becomes continuation labels.
 */
export function expandDeliveryToLabels(d: Delivery): DeliveryLabelContent[] {
  const allLines = productLinesFromItems(d.itemsSnapshot || []);
  const chunks: string[][] = [];
  if (allLines.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < allLines.length; i += MAX_PRODUCT_LINES_PER_LABEL) {
      chunks.push(allLines.slice(i, i + MAX_PRODUCT_LINES_PER_LABEL));
    }
  }
  const partTotal = chunks.length;
  const baseName = safeDisplayText(customerDisplayName(d.customerSnapshot), "לקוח");
  const phone = safeDisplayText(d.customerSnapshot?.phone);
  const secondary = safeDisplayText(d.customerSnapshot?.secondaryPhone);
  const address = safeDisplayText(formatFullDeliveryAddress(d.addressSnapshot), "כתובת לא הוגדרה");
  const areaLabel = safeDisplayText(
    deliveryAreaLabelHe[d.deliveryAreaSnapshot],
    "לא הוגדר"
  );
  const deliveryNumber = safeDisplayText(d.deliveryNumber);
  const orderNumber = safeDisplayText(d.orderNumberSnapshot);
  const totalAmount = safeMoneyAmount(d.orderTotalSnapshot);
  const scheduledDate = safeDisplayText(d.scheduledDate);

  return chunks.map((productLines, idx) => {
    const partIndex = idx + 1;
    const isContinuation = partIndex > 1;
    return {
      deliveryId: safeDisplayText(d.id, `dlv-${partIndex}`),
      deliveryNumber,
      orderNumber,
      customerName: isContinuation ? `${baseName} (המשך ${partIndex}/${partTotal})` : baseName,
      phone: isContinuation ? "" : phone,
      secondaryPhone: isContinuation ? "" : secondary,
      address: isContinuation ? "" : address,
      areaLabel: isContinuation ? areaLabel : areaLabel,
      productLines,
      productsFullText: productLines.join("\n"),
      totalAmount: isContinuation ? 0 : totalAmount,
      paymentLabel: isContinuation
        ? `המשך מדבקה ${partIndex}/${partTotal} · ${deliveryNumber}`
        : "סה״כ לתשלום במזומן לשליח",
      scheduledDate: isContinuation ? "" : scheduledDate,
      partIndex,
      partTotal,
      isContinuation,
    };
  });
}

export function buildDeliveryLabelContent(d: Delivery): DeliveryLabelContent {
  return expandDeliveryToLabels(d)[0];
}

/**
 * Resolve which deliveries to print.
 * - selected: only checked IDs that appear in the current filtered list (stable order of filtered)
 * - filtered: all currently displayed rows
 */
export function resolveDeliveriesForPrint(
  filtered: Delivery[],
  selectedIds: Iterable<string>,
  mode: LabelPrintMode
): Delivery[] {
  const list = filtered || [];
  if (mode === "filtered") return list.slice();
  const set = new Set(selectedIds);
  return list.filter((d) => set.has(d.id));
}

/** Chunk into pages of exactly LABELS_PER_PAGE (last page may be shorter). */
export function chunkDeliveriesIntoPages<T>(items: T[], pageSize = LABELS_PER_PAGE): T[][] {
  const src = items || [];
  if (src.length === 0) return [];
  const pages: T[][] = [];
  for (let i = 0; i < src.length; i += pageSize) {
    pages.push(src.slice(i, i + pageSize));
  }
  return pages;
}

export function expectedPageCount(labelCount: number, pageSize = LABELS_PER_PAGE): number {
  if (!(labelCount > 0)) return 0;
  return Math.ceil(labelCount / pageSize);
}

/** Pad a page to LABELS_PER_PAGE slots with null (empty cells) for layout stability. */
export function padPageSlots<T>(pageItems: T[], pageSize = LABELS_PER_PAGE): Array<T | null> {
  const slots: Array<T | null> = pageItems.slice();
  while (slots.length < pageSize) slots.push(null);
  return slots;
}

export function assertFixedGrid(): { columns: number; rows: number; perPage: number } {
  return {
    columns: LABEL_COLUMNS,
    rows: LABEL_ROWS,
    perPage: LABEL_COLUMNS * LABEL_ROWS,
  };
}

/**
 * Pure: expand deliveries → labels (with continuation) → pages.
 * Does not mutate inputs or workspace state.
 */
export function prepareLabelPrintJob(
  filtered: Delivery[],
  selectedIds: Iterable<string>,
  mode: LabelPrintMode
): {
  deliveries: Delivery[];
  labels: DeliveryLabelContent[];
  pages: DeliveryLabelContent[][];
  pageCount: number;
} {
  const deliveries = resolveDeliveriesForPrint(filtered, selectedIds, mode);
  const labels = deliveries.flatMap(expandDeliveryToLabels);
  const pages = chunkDeliveriesIntoPages(labels, LABELS_PER_PAGE);
  return {
    deliveries,
    labels,
    pages,
    pageCount: pages.length,
  };
}

/** Assert label fields never render unsafe tokens. */
export function labelContentIsClean(label: DeliveryLabelContent): boolean {
  const bag = [
    label.deliveryNumber,
    label.orderNumber,
    label.customerName,
    label.phone,
    label.secondaryPhone,
    label.address,
    label.areaLabel,
    label.paymentLabel,
    label.scheduledDate,
    ...label.productLines,
  ];
  for (const s of bag) {
    if (s == null) return false;
    if (typeof s !== "string") return false;
    if (/\b(undefined|null|NaN)\b/i.test(s)) return false;
  }
  if (!Number.isFinite(label.totalAmount) || Number.isNaN(label.totalAmount)) return false;
  return true;
}
