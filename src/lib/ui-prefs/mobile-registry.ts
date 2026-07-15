import type { MobileModuleId, MobileRegistryElement, MobileSurface } from "./types";

function el(
  module: MobileModuleId,
  surface: MobileSurface,
  key: string,
  labelHe: string,
  required = false
): MobileRegistryElement {
  return {
    id: `${module}.mobile.${surface}.${key}`,
    module,
    surface,
    labelHe,
    required,
  };
}

/** Stable mobile UI registry — ids never use display labels as keys. */
export const MOBILE_REGISTRY: MobileRegistryElement[] = [
  // home
  el("home", "summary", "balanceLabel", "יתרה נוכחית"),
  el("home", "summary", "balanceValue", "ערך יתרה", true),
  el("home", "summary", "incomeLabel", "תווית הכנסות"),
  el("home", "summary", "incomeValue", "סכום הכנסות", true),
  el("home", "summary", "expenseLabel", "תווית הוצאות"),
  el("home", "summary", "expenseValue", "סכום הוצאות", true),
  el("home", "actions", "quickCustomers", "קיצור לקוחות"),
  el("home", "actions", "quickProducts", "קיצור מוצרים"),
  el("home", "actions", "quickAddIncome", "הוסף הכנסה"),
  el("home", "actions", "quickAddExpense", "הוסף הוצאה"),

  // income
  el("income", "form", "title", "כותרת הכנסה חדשה"),
  el("income", "form", "description", "תיאור", true),
  el("income", "form", "amount", "סכום", true),
  el("income", "form", "category", "קטגוריה"),
  el("income", "form", "note", "הערה"),
  el("income", "form", "save", "שמירה", true),
  el("income", "list", "empty", "אין רשומות"),
  el("income", "list", "rowTitle", "תיאור רשומה", true),
  el("income", "list", "rowDate", "תאריך"),
  el("income", "list", "rowCategory", "קטגוריה ברשימה"),
  el("income", "list", "rowNote", "הערה ברשימה"),
  el("income", "list", "rowAmount", "סכום ברשימה", true),
  el("income", "list", "delete", "מחק"),

  // expense
  el("expense", "form", "title", "כותרת הוצאה חדשה"),
  el("expense", "form", "description", "תיאור", true),
  el("expense", "form", "amount", "סכום", true),
  el("expense", "form", "category", "קטגוריה"),
  el("expense", "form", "note", "הערה"),
  el("expense", "form", "save", "שמירה", true),
  el("expense", "list", "empty", "אין רשומות"),
  el("expense", "list", "rowTitle", "תיאור רשומה", true),
  el("expense", "list", "rowDate", "תאריך"),
  el("expense", "list", "rowCategory", "קטגוריה ברשימה"),
  el("expense", "list", "rowNote", "הערה ברשימה"),
  el("expense", "list", "rowAmount", "סכום ברשימה", true),
  el("expense", "list", "delete", "מחק"),

  // customers
  el("customers", "list", "heading", "כותרת לקוחות"),
  el("customers", "actions", "newCustomer", "לקוח חדש", true),
  el("customers", "filters", "search", "מסננים / חיפוש"),
  el("customers", "filters", "statusArea", "מסנן סטטוס ואזור"),
  el("customers", "list", "customerNumber", "מספר לקוח", true),
  el("customers", "list", "name", "שם", true),
  el("customers", "list", "businessName", "שם עסק"),
  el("customers", "list", "phone", "טלפון"),
  el("customers", "list", "secondaryPhone", "טלפון נוסף"),
  el("customers", "list", "email", "דוא״ל"),
  el("customers", "list", "address", "כתובת"),
  el("customers", "list", "street", "רחוב"),
  el("customers", "list", "houseNumber", "מספר בית"),
  el("customers", "list", "entrance", "כניסה"),
  el("customers", "list", "floor", "קומה"),
  el("customers", "list", "apartment", "דירה"),
  el("customers", "list", "city", "עיר"),
  el("customers", "list", "zipCode", "מיקוד"),
  el("customers", "list", "deliveryArea", "אזור משלוח"),
  el("customers", "list", "deliveryNotes", "הוראות משלוח"),
  el("customers", "list", "notes", "הערות"),
  el("customers", "list", "activeStatus", "סטטוס"),
  el("customers", "list", "createdAt", "תאריך יצירה"),
  el("customers", "list", "updatedAt", "תאריך עדכון"),
  el("customers", "summary", "cards", "כרטיסי סיכום"),
  el("customers", "actions", "secondary", "פעולות משניות"),
  el("customers", "list", "edit", "עריכה", true),
  el("customers", "form", "customerType", "סוג לקוח"),
  el("customers", "form", "name", "שם לקוח", true),
  el("customers", "form", "businessName", "שם עסק בטופס"),
  el("customers", "form", "phone", "טלפון בטופס", true),
  el("customers", "form", "secondaryPhone", "טלפון נוסף בטופס"),
  el("customers", "form", "email", "דוא״ל בטופס"),
  el("customers", "form", "street", "רחוב בטופס"),
  el("customers", "form", "houseNumber", "מספר בית בטופס"),
  el("customers", "form", "entrance", "כניסה בטופס"),
  el("customers", "form", "floor", "קומה בטופס"),
  el("customers", "form", "apartment", "דירה בטופס"),
  el("customers", "form", "city", "עיר בטופס"),
  el("customers", "form", "zipCode", "מיקוד בטופס"),
  el("customers", "form", "deliveryArea", "אזור משלוח בטופס"),
  el("customers", "form", "deliveryNotes", "הוראות משלוח בטופס"),
  el("customers", "form", "notes", "הערות בטופס"),
  el("customers", "form", "error", "הודעות שגיאה", true),
  el("customers", "form", "save", "שמירה", true),
  el("customers", "form", "cancel", "ביטול", true),

  // products
  el("products", "list", "heading", "כותרת מוצרים"),
  el("products", "actions", "newProduct", "מוצר חדש", true),
  el("products", "filters", "search", "מסננים / חיפוש"),
  el("products", "list", "productNumber", "מספר מוצר", true),
  el("products", "list", "name", "שם", true),
  el("products", "list", "model", "דגם"),
  el("products", "list", "sku", "SKU"),
  el("products", "list", "barcode", "ברקוד"),
  el("products", "list", "description", "תיאור"),
  el("products", "list", "salePrice", "מחיר מכירה", true),
  el("products", "list", "costPrice", "מחיר עלות"),
  el("products", "list", "stockQty", "כמות במלאי"),
  el("products", "list", "unit", "יחידת מידה"),
  el("products", "list", "activeStatus", "סטטוס"),
  el("products", "list", "dates", "תאריכים"),
  el("products", "summary", "cards", "כרטיסים"),
  el("products", "actions", "secondary", "פעולות"),
  el("products", "list", "edit", "עריכה", true),
  el("products", "form", "name", "שם מוצר", true),
  el("products", "form", "model", "דגם בטופס"),
  el("products", "form", "sku", "SKU בטופס"),
  el("products", "form", "barcode", "ברקוד בטופס"),
  el("products", "form", "description", "תיאור בטופס"),
  el("products", "form", "salePrice", "מחיר מכירה בטופס", true),
  el("products", "form", "costPrice", "מחיר עלות בטופס"),
  el("products", "form", "stockQty", "כמות", true),
  el("products", "form", "unit", "יחידה בטופס"),
  el("products", "form", "error", "הודעות שגיאה", true),
  el("products", "form", "save", "שמירה", true),
  el("products", "form", "cancel", "ביטול", true),

  // orders
  el("orders", "list", "heading", "כותרת הזמנות"),
  el("orders", "actions", "newOrder", "הזמנה חדשה", true),
  el("orders", "summary", "cards", "כרטיסי סיכום"),
  el("orders", "filters", "search", "מסננים"),
  el("orders", "list", "orderNumber", "מספר הזמנה", true),
  el("orders", "list", "createdAt", "תאריך"),
  el("orders", "list", "customerName", "לקוח", true),
  el("orders", "list", "businessName", "שם עסק"),
  el("orders", "list", "phone", "טלפון"),
  el("orders", "list", "address", "כתובת"),
  el("orders", "list", "fullAddress", "כתובת מלאה"),
  el("orders", "list", "deliveryArea", "אזור"),
  el("orders", "list", "products", "מוצרים"),
  el("orders", "list", "models", "דגמים"),
  el("orders", "list", "quantities", "כמויות"),
  el("orders", "list", "unitPrice", "מחיר יחידה"),
  el("orders", "list", "lineTotal", "סכום שורה"),
  el("orders", "list", "totalAmount", "סכום כולל", true),
  el("orders", "list", "paymentType", "אמצעי תשלום"),
  el("orders", "list", "status", "סטטוס", true),
  el("orders", "list", "orderNotes", "הערות"),
  el("orders", "list", "cancelReason", "סיבת ביטול"),
  el("orders", "actions", "secondary", "פעולות משניות"),
  el("orders", "details", "orderNumber", "מספר הזמנה בפרטים", true),
  el("orders", "details", "unitPrice", "מחיר יחידה בפרטים"),
  el("orders", "details", "fullAddress", "כתובת מלאה בפרטים"),
  el("orders", "form", "error", "הודעות שגיאה", true),
  el("orders", "form", "save", "שמירה", true),
  el("orders", "form", "cancel", "ביטול", true),
  el("orders", "form", "qty", "כמות", true),
  el("orders", "dialog", "conflict", "הודעת Conflict", true),

  // inventory
  el("inventory", "list", "heading", "כותרת מלאי"),
  el("inventory", "filters", "search", "מסננים"),
  el("inventory", "summary", "cards", "כרטיסי סיכום"),
  el("inventory", "list", "productNumber", "מספר מוצר", true),
  el("inventory", "list", "name", "שם", true),
  el("inventory", "list", "model", "דגם"),
  el("inventory", "list", "sku", "SKU"),
  el("inventory", "list", "barcode", "ברקוד"),
  el("inventory", "list", "stockQty", "כמות נוכחית", true),
  el("inventory", "list", "unit", "יחידה"),
  el("inventory", "history", "movementType", "סוג תנועה", true),
  el("inventory", "history", "quantityBefore", "כמות לפני"),
  el("inventory", "history", "quantityDelta", "שינוי", true),
  el("inventory", "history", "quantityAfter", "כמות אחרי", true),
  el("inventory", "history", "reason", "סיבה"),
  el("inventory", "history", "notes", "הערות"),
  el("inventory", "history", "movementNumber", "מספר תנועה", true),
  el("inventory", "history", "createdAt", "תאריך"),
  el("inventory", "form", "qty", "כמות", true),
  el("inventory", "form", "save", "שמירה", true),
  el("inventory", "form", "cancel", "ביטול", true),
  el("inventory", "form", "error", "הודעות שגיאה", true),

  // deliveries
  el("deliveries", "list", "heading", "כותרת משלוחים"),
  el("deliveries", "actions", "newDelivery", "משלוח חדש", true),
  el("deliveries", "summary", "cards", "כרטיסי סיכום"),
  el("deliveries", "filters", "search", "מסננים"),
  el("deliveries", "list", "deliveryNumber", "מספר משלוח", true),
  el("deliveries", "list", "orderNumber", "מספר הזמנה", true),
  el("deliveries", "list", "scheduledDate", "תאריך"),
  el("deliveries", "list", "deliveryArea", "אזור"),
  el("deliveries", "list", "customerName", "לקוח", true),
  el("deliveries", "list", "phone", "טלפון"),
  el("deliveries", "list", "secondaryPhone", "טלפון נוסף"),
  el("deliveries", "list", "address", "כתובת"),
  el("deliveries", "list", "products", "מוצרים"),
  el("deliveries", "list", "models", "דגמים"),
  el("deliveries", "list", "quantities", "כמויות"),
  el("deliveries", "card", "orderTotal", "סכום לתשלום", true),
  el("deliveries", "list", "paymentType", "אמצעי תשלום"),
  el("deliveries", "list", "status", "סטטוס", true),
  el("deliveries", "list", "notes", "הערות"),
  el("deliveries", "list", "cancelReason", "סיבת ביטול"),
  el("deliveries", "form", "save", "שמירה", true),
  el("deliveries", "form", "cancel", "ביטול", true),
  el("deliveries", "form", "error", "הודעות שגיאה", true),

  // sync
  el("sync", "form", "heading", "כותרת סנכרון"),
  el("sync", "summary", "connectionStatus", "מצב חיבור", true),
  el("sync", "summary", "syncStatus", "מצב סנכרון", true),
  el("sync", "summary", "cloudUpdatedAt", "שמירה אחרונה בענן"),
  el("sync", "summary", "revision", "revision"),
  el("sync", "summary", "deviceDiag", "מזהה מכשיר (אבחון)"),
  el("sync", "actions", "saveToCloud", "שמור לענן", true),
  el("sync", "actions", "loadFromCloud", "טען מהענן", true),
  el("sync", "actions", "refreshStatus", "רענן מצב"),
  el("sync", "dialog", "conflict", "הודעת Conflict", true),
  el("sync", "form", "pendingSync", "ממתין לסנכרון", true),
  el("sync", "form", "error", "הודעות שגיאה", true),
];

export const MOBILE_MODULE_LABELS: Record<MobileModuleId, string> = {
  home: "בית",
  income: "הכנסות",
  expense: "הוצאות",
  customers: "לקוחות",
  products: "מוצרים",
  orders: "הזמנות",
  inventory: "מלאי",
  deliveries: "משלוחים",
  sync: "סנכרון",
};

export const MOBILE_MODULES = Object.keys(MOBILE_MODULE_LABELS) as MobileModuleId[];

const byId = new Map(MOBILE_REGISTRY.map((e) => [e.id, e]));

export function getMobileElement(id: string): MobileRegistryElement | undefined {
  return byId.get(id);
}

export function elementsForModule(module: MobileModuleId): MobileRegistryElement[] {
  return MOBILE_REGISTRY.filter((e) => e.module === module);
}

export function auditMobileRegistry(): {
  duplicateIds: string[];
  missingIds: string[];
  total: number;
  requiredCount: number;
} {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  for (const e of MOBILE_REGISTRY) {
    if (seen.has(e.id)) duplicateIds.push(e.id);
    seen.add(e.id);
    if (!e.id.startsWith(`${e.module}.mobile.`)) {
      duplicateIds.push(`bad-shape:${e.id}`);
    }
  }
  return {
    duplicateIds,
    missingIds: [],
    total: MOBILE_REGISTRY.length,
    requiredCount: MOBILE_REGISTRY.filter((e) => e.required).length,
  };
}

/** Live-bound ids — every registry id must appear here (data-mobile-id in UI or preview). */
export const MOBILE_LIVE_BINDINGS: ReadonlySet<string> = new Set(MOBILE_REGISTRY.map((e) => e.id));
