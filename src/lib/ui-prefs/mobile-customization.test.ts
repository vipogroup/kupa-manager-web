import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  auditMobileRegistry,
  MOBILE_LIVE_BINDINGS,
  MOBILE_MODULES,
  MOBILE_REGISTRY,
  elementsForModule,
} from "./mobile-registry";
import {
  applyHideOptional,
  applyResetDefault,
  applyShowAll,
  hiddenIdsForPreset,
  preferencesForPreset,
  sanitizeHiddenIds,
} from "./presets";
import { assertRevisionMatch } from "../sync-snapshot";
import { accountPrefsPath, accountWorkspacePath } from "../workspace-path";
import { PRIMARY_ACCOUNT_ID } from "../account-workspace";

const SECRET = "m".repeat(48);

describe("MOBILE category customization simulator", () => {
  const prev = process.env.KUPA_WORKSPACE_NAMESPACE_SECRET;

  beforeAll(() => {
    process.env.KUPA_WORKSPACE_NAMESPACE_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.KUPA_WORKSPACE_NAMESPACE_SECRET = prev;
  });

  it("MOBILE-SIM-001 Category exists in customization center source", () => {
    const src = readFileSync(join(process.cwd(), "src/components/CustomizationCenter.tsx"), "utf8");
    expect(src).toContain("ניהול והתאמת הממשק");
    expect(src).toContain('data-testid="customization-cat-mobile"');
    expect(src).toContain("מובייל");
    expect(src).not.toMatch(/MobileSettingsPage/);
  });

  it("MOBILE-SIM-002 All modules selectable", () => {
    expect(MOBILE_MODULES).toEqual([
      "home",
      "income",
      "expense",
      "customers",
      "products",
      "orders",
      "inventory",
      "deliveries",
      "drivers",
      "vehicles",
      "routes",
      "courierDailyView",
      "sync",
    ]);
    for (const m of MOBILE_MODULES) {
      expect(elementsForModule(m).length).toBeGreaterThan(0);
    }
  });

  it("MOBILE-SIM-003 Registry fields listed for customers/products/orders", () => {
    const cust = elementsForModule("customers").map((e) => e.id);
    expect(cust).toContain("customers.mobile.list.email");
    expect(cust).toContain("customers.mobile.list.secondaryPhone");
    expect(cust).toContain("customers.mobile.list.phone");
    expect(elementsForModule("products").map((e) => e.id)).toContain("products.mobile.list.model");
    const orders = elementsForModule("orders").map((e) => e.id);
    expect(orders).toContain("orders.mobile.list.fullAddress");
    expect(orders).toContain("orders.mobile.form.shippingFee");
    expect(orders).toContain("orders.mobile.form.itemsSubtotal");
    expect(orders).toContain("orders.mobile.form.totalAmount");
    expect(orders).toContain("orders.mobile.details.shippingFee");
  });

  it("MOBILE-SIM-004 Hide optional field", () => {
    const id = "customers.mobile.list.email";
    expect(sanitizeHiddenIds([id])).toContain(id);
  });

  it("MOBILE-SIM-005 Show optional field", () => {
    const id = "customers.mobile.list.email";
    expect(sanitizeHiddenIds([]).includes(id)).toBe(false);
    expect(preferencesForPreset("full").hiddenElementIds.includes(id)).toBe(false);
  });

  it("MOBILE-SIM-006 No empty gaps contract (CSS collapse)", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain('html.kupa-mobile-prefs-active [data-mobile-hidden="1"]');
    expect(css).toContain("display: none !important");
  });

  it("MOBILE-SIM-007 Preset basic", () => {
    expect(hiddenIdsForPreset("basic").length).toBeGreaterThan(0);
  });

  it("MOBILE-SIM-008 Preset business", () => {
    const business = hiddenIdsForPreset("business");
    const basic = hiddenIdsForPreset("basic");
    expect(business.length).toBeGreaterThan(0);
    expect(basic.length).toBeGreaterThan(business.length);
  });

  it("MOBILE-SIM-009 Preset full", () => {
    expect(hiddenIdsForPreset("full")).toHaveLength(0);
  });

  it("MOBILE-SIM-010 Custom preset", () => {
    expect(preferencesForPreset("custom").preset).toBe("custom");
  });

  it("MOBILE-SIM-011 Required elements locked", () => {
    const required = MOBILE_REGISTRY.filter((e) => e.required);
    expect(required.length).toBeGreaterThan(10);
    expect(sanitizeHiddenIds(required.map((e) => e.id))).toHaveLength(0);
  });

  it("MOBILE-SIM-012 Preview widths", () => {
    const src = readFileSync(join(process.cwd(), "src/components/CustomizationCenter.tsx"), "utf8");
    for (const w of [320, 375, 390, 430]) expect(src).toContain(String(w));
  });

  it("MOBILE-SIM-013 Account prefs path separate from business", () => {
    const prefsPath = accountPrefsPath(PRIMARY_ACCOUNT_ID)!;
    const bizPath = accountWorkspacePath(PRIMARY_ACCOUNT_ID)!;
    expect(prefsPath.startsWith("prefs/")).toBe(true);
    expect(bizPath.startsWith("workspaces/")).toBe(true);
    expect(prefsPath).not.toBe(bizPath);
  });

  it("MOBILE-SIM-014 Conflict 409", () => {
    expect(assertRevisionMatch(2, 3).ok).toBe(false);
  });

  it("MOBILE-SIM-015 Offline pending helpers + reset", () => {
    expect(applyShowAll().hiddenElementIds).toHaveLength(0);
    expect(applyHideOptional().hiddenElementIds.length).toBeGreaterThan(0);
    expect(applyResetDefault().preset).toBe("business");
  });

  it("MOBILE-SIM-016 Desktop unchanged contract", () => {
    const src = readFileSync(join(process.cwd(), "src/components/CustomizationCenter.tsx"), "utf8");
    expect(src).toMatch(/תצוגת מחשב/);
  });

  it("MOBILE-SIM-017 Registry audit duplicates orphans live", () => {
    const audit = auditMobileRegistry();
    expect(audit.duplicateIds).toEqual([]);
    expect(audit.missingIds).toEqual([]);
    expect(MOBILE_LIVE_BINDINGS.size).toBe(MOBILE_REGISTRY.length);
    const host = readFileSync(join(process.cwd(), "src/components/CustomizationCenter.tsx"), "utf8");
    expect(host).toContain("mobile-live-binding-host");
  });

  it("MOBILE-SIM-018 Business prefs payload excludes business entities", () => {
    const prefs = preferencesForPreset("business");
    expect(Object.keys(prefs).sort()).toEqual(["hiddenElementIds", "preset", "version"]);
  });

  it("MOBILE-SIM-019 Live bindings in customers/products panels", () => {
    const c = readFileSync(join(process.cwd(), "src/components/CustomersPanel.tsx"), "utf8");
    const p = readFileSync(join(process.cwd(), "src/components/ProductsPanel.tsx"), "utf8");
    expect(c).toContain('data-mobile-id="customers.mobile.list.email"');
    expect(p).toContain('data-mobile-id="products.mobile.list.model"');
  });
});
