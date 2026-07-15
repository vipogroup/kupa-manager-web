export type MobilePresetId = "basic" | "business" | "full" | "custom";

export type MobileModuleId =
  | "home"
  | "income"
  | "expense"
  | "customers"
  | "products"
  | "orders"
  | "inventory"
  | "deliveries"
  | "sync";

export type MobileSurface =
  | "shell"
  | "summary"
  | "filters"
  | "list"
  | "form"
  | "details"
  | "actions"
  | "dialog"
  | "labels"
  | "card"
  | "history";

export type MobileRegistryElement = {
  id: string;
  module: MobileModuleId;
  surface: MobileSurface;
  labelHe: string;
  required: boolean;
};

export type MobileUiPreferences = {
  version: 1;
  preset: MobilePresetId;
  /** Optional element ids that are hidden on mobile viewport. Required ids ignored. */
  hiddenElementIds: string[];
};

export type UiPreferencesEnvelope = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  updatedByDeviceId: string;
  preferences: MobileUiPreferences;
};

export const PREFS_SCHEMA_VERSION = 1 as const;

export function defaultMobilePreferences(): MobileUiPreferences {
  return {
    version: 1,
    preset: "business",
    hiddenElementIds: [],
  };
}
