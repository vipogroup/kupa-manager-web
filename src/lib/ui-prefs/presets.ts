import { MOBILE_REGISTRY } from "./mobile-registry";
import type { MobilePresetId, MobileUiPreferences } from "./types";

const BASIC_HIDE_SURFACES = new Set(["filters", "dialog", "labels"]);
const BASIC_KEEP_KEYS = new Set([
  "name",
  "phone",
  "salePrice",
  "stockQty",
  "totalAmount",
  "orderNumber",
  "deliveryNumber",
  "customerName",
  "status",
  "qty",
  "amount",
  "description",
  "balanceValue",
  "incomeValue",
  "expenseValue",
  "syncStatus",
  "connectionStatus",
  "save",
  "cancel",
  "error",
  "conflict",
  "pendingSync",
  "orderTotal",
  "quantityDelta",
  "quantityAfter",
  "movementNumber",
  "productNumber",
  "customerNumber",
  "rowTitle",
  "rowAmount",
]);

/** Business: show phones, address, model, price, area, status — hide secondary noise. */
const BUSINESS_HIDE_SUFFIXES = [
  ".email",
  ".secondaryPhone",
  ".costPrice",
  ".description",
  ".notes",
  ".deliveryNotes",
  ".zipCode",
  ".entrance",
  ".floor",
  ".apartment",
  ".deviceDiag",
  ".dates",
  ".createdAt",
  ".updatedAt",
  ".cancelReason",
];

export function hiddenIdsForPreset(preset: MobilePresetId): string[] {
  if (preset === "full" || preset === "custom") return [];
  if (preset === "readOnly") {
    // Hide mutation action surfaces; keep lists/details visible.
    return MOBILE_REGISTRY.filter(
      (e) => !e.required && (e.surface === "form" || e.id.includes(".create") || e.id.includes(".actions."))
    ).map((e) => e.id);
  }
  const optional = MOBILE_REGISTRY.filter((e) => !e.required);
  if (preset === "basic") {
    return optional
      .filter((e) => {
        if (BASIC_HIDE_SURFACES.has(e.surface)) return true;
        const key = e.id.split(".").pop() || "";
        return !BASIC_KEEP_KEYS.has(key);
      })
      .map((e) => e.id);
  }
  // business
  return optional
    .filter((e) => BUSINESS_HIDE_SUFFIXES.some((s) => e.id.endsWith(s) || e.id.includes(s)))
    .map((e) => e.id);
}

export function preferencesForPreset(preset: MobilePresetId): MobileUiPreferences {
  if (preset === "custom") {
    return { version: 1, preset: "custom", hiddenElementIds: [] };
  }
  return {
    version: 1,
    preset,
    hiddenElementIds: hiddenIdsForPreset(preset),
  };
}

export function sanitizeHiddenIds(ids: string[]): string[] {
  const required = new Set(MOBILE_REGISTRY.filter((e) => e.required).map((e) => e.id));
  const known = new Set(MOBILE_REGISTRY.map((e) => e.id));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!known.has(id) || required.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function applyShowAll(): MobileUiPreferences {
  return { version: 1, preset: "full", hiddenElementIds: [] };
}

export function applyHideOptional(): MobileUiPreferences {
  return {
    version: 1,
    preset: "custom",
    hiddenElementIds: MOBILE_REGISTRY.filter((e) => !e.required).map((e) => e.id),
  };
}

export function applyResetDefault(): MobileUiPreferences {
  return preferencesForPreset("business");
}
