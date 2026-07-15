import type { Delivery } from "./types";
import {
  customerDisplayName,
  deliveryAreaLabelHe,
  formatFullDeliveryAddress,
  formatProductsSummary,
} from "./deliveries";

/** Fixed sheet layout — do not change without updating print CSS. */
export const LABELS_PER_PAGE = 18;
export const LABEL_COLUMNS = 3;
export const LABEL_ROWS = 6;

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
};

export function buildDeliveryLabelContent(d: Delivery): DeliveryLabelContent {
  const products = formatProductsSummary(d.itemsSnapshot || []);
  const phone = String(d.customerSnapshot?.phone || "").trim();
  const secondary = String(d.customerSnapshot?.secondaryPhone || "").trim();
  return {
    deliveryId: d.id,
    deliveryNumber: d.deliveryNumber || "",
    orderNumber: d.orderNumberSnapshot || "",
    customerName: customerDisplayName(d.customerSnapshot),
    phone,
    secondaryPhone: secondary,
    address: formatFullDeliveryAddress(d.addressSnapshot),
    areaLabel: deliveryAreaLabelHe[d.deliveryAreaSnapshot] || "לא הוגדר",
    productLines: products.lines,
    productsFullText: products.fullText,
    totalAmount: Number.isFinite(d.orderTotalSnapshot) ? d.orderTotalSnapshot : 0,
    paymentLabel: "סה״כ לתשלום במזומן לשליח",
    scheduledDate: d.scheduledDate || "",
  };
}

/**
 * Resolve which deliveries to print.
 * - selected: only checked IDs that appear in the current filtered list (stable order of filtered)
 * - filtered: all currently displayed rows
 * Empty selection in "selected" mode → empty list (caller shows message).
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
 * Pure proof: print helpers never mutate input arrays/objects.
 * Returns cloned pages for rendering without touching source deliveries.
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
  const labels = deliveries.map(buildDeliveryLabelContent);
  const pages = chunkDeliveriesIntoPages(labels, LABELS_PER_PAGE);
  return {
    deliveries,
    labels,
    pages,
    pageCount: pages.length,
  };
}
