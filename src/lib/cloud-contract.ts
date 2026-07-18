/**
 * Cloud contract version — independent of Windows DesktopSchemaVersion (15)
 * and Web package version. Bump when cloud AppData shape / mutate actions change.
 */
export const CLOUD_CONTRACT_VERSION = 3 as const;

export type CloudContractVersion = typeof CLOUD_CONTRACT_VERSION;

/** Known AppData collection / metadata keys that are first-class in contract v2. */
export const CLOUD_APP_DATA_KNOWN_KEYS = [
  "version",
  "cloudContractVersion",
  "desktopSchemaVersion",
  "incomes",
  "expenses",
  "customers",
  "products",
  "orders",
  "inventoryMovements",
  "deliveries",
  "drivers",
  "vehicles",
  "deliveryRoutes",
  "updatedAt",
  "customerCounter",
  "productCounter",
  "counters",
] as const;

export type CloudAppDataKnownKey = (typeof CLOUD_APP_DATA_KNOWN_KEYS)[number];

export function isCloudAppDataKnownKey(k: string): k is CloudAppDataKnownKey {
  return (CLOUD_APP_DATA_KNOWN_KEYS as readonly string[]).includes(k);
}

/**
 * Merge AppData-like objects while preserving unknown top-level keys from `base`.
 * Known keys from `overlay` win; unknown keys from `base` are kept unless overlay sets them.
 */
export function mergeAppDataPreserveUnknown(
  base: Record<string, unknown> | null | undefined,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (base && typeof base === "object" && !Array.isArray(base)) {
    for (const [k, v] of Object.entries(base)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = v;
    }
  }
  for (const [k, v] of Object.entries(overlay)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = v;
  }
  return out;
}

/** Collect unknown top-level keys from a store/state object for persistence. */
export function collectUnknownTopLevel(
  state: Record<string, unknown>,
  known: ReadonlySet<string>
): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (known.has(k)) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    // Skip zustand action functions and UI-only sync meta
    if (typeof v === "function") continue;
    rest[k] = v;
  }
  return rest;
}
