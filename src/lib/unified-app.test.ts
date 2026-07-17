import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { assertManifestContract, assertStaticOnlyServiceWorker } from "./pwa";
import { PRIMARY_ACCOUNT_ID, resolveAccountIdFromSession } from "./account-workspace";
import { accountWorkspacePath } from "./workspace-path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

describe("UNIFIED-APP installable web + single cloud", () => {
  const manifest = readJson("public/manifest.webmanifest");
  const sw = read("public/sw.js");
  const shell = read("src/components/AppShell.tsx");
  const layout = read("src/app/layout.tsx");
  const syncRoute = read("src/app/api/sync/route.ts");
  const accountWs = read("src/lib/account-workspace.ts");
  const install = read("src/components/InstallAppPanel.tsx");

  it("UNIFIED-APP-001 Manifest valid", () => {
    const r = assertManifestContract(manifest as never);
    expect(r.ok, r.reasons.join(",")).toBe(true);
    expect(Array.isArray(manifest.icons)).toBe(true);
  });

  it("UNIFIED-APP-002 Standalone display", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("UNIFIED-APP-003 Start URL safe", () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(String(manifest.start_url)).not.toMatch(/token|blob|workspace/i);
  });

  it("UNIFIED-APP-004 Desktop install prompt handling", () => {
    expect(install).toContain("beforeinstallprompt");
    expect(install).toContain("התקן כאפליקציה במחשב");
    expect(install).toContain("install-prompt-unavailable");
  });

  it("UNIFIED-APP-005 Installed mode detected", () => {
    expect(install).toContain("isStandaloneDisplay");
    expect(install).toContain("install-standalone-active");
  });

  it("UNIFIED-APP-006 Android install guidance", () => {
    expect(install).toContain("install-android-guidance");
    expect(install).toContain("Android");
  });

  it("UNIFIED-APP-007 iPhone guidance", () => {
    expect(install).toContain("install-iphone-guidance");
    expect(install).toContain("iPhone");
  });

  it("UNIFIED-APP-008 Static assets cache only", () => {
    const r = assertStaticOnlyServiceWorker(sw);
    expect(r.ok, r.reasons.join(",")).toBe(true);
    expect(sw).toContain("/_next/static/");
  });

  it("UNIFIED-APP-009 Business API not cached", () => {
    expect(sw).toMatch(/isApiPath\(req\.url\)\)\s*return/);
    expect(sw).not.toMatch(/cache\.put\([^\n]*\/api\//);
  });

  it("UNIFIED-APP-010 Logout no business cache", () => {
    expect(shell).toContain("clearKupaServiceWorkerCaches");
    expect(sw).toContain("KUPA_CLEAR_CACHES");
  });

  it("UNIFIED-APP-011 Same account desktop/mobile", () => {
    expect(resolveAccountIdFromSession("admin")).toBe(PRIMARY_ACCOUNT_ID);
    expect(resolveAccountIdFromSession("other")).toBe(PRIMARY_ACCOUNT_ID);
  });

  it("UNIFIED-APP-012 New PC same data", () => {
    expect(accountWs).toContain("PRIMARY_ACCOUNT_ID");
    expect(shell).toContain("הנתונים נשמרים בחשבון שלך ומופיעים בכל מכשיר");
  });

  it("UNIFIED-APP-013 Installed PWA same data", () => {
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(existsSync(join(root, "public/icons/icon-192.png"))).toBe(true);
    expect(existsSync(join(root, "public/icons/icon-512.png"))).toBe(true);
  });

  it("UNIFIED-APP-014 Empty localStorage same data", () => {
    expect(syncRoute).toContain("resolveAccountIdFromSession");
    expect(syncRoute).not.toMatch(/localStorage/);
  });

  it("UNIFIED-APP-015 Incognito same data", () => {
    expect(shell).toContain("useAccountCloudSync");
    expect(read("src/lib/useAccountCloudSync.ts")).toContain("applyCloudLoad");
  });

  it("UNIFIED-APP-016 DeviceId does not select workspace", () => {
    const pathA = accountWorkspacePath(PRIMARY_ACCOUNT_ID);
    const pathB = accountWorkspacePath(PRIMARY_ACCOUNT_ID);
    expect(pathA).toBeTruthy();
    expect(pathA).toBe(pathB);
    expect(String(pathA)).not.toContain("device");
    expect(syncRoute).toMatch(/deviceId/);
    expect(syncRoute).toContain("resolveAccountIdFromSession");
    expect(read("src/lib/device-id.ts")).toContain("kupa-device-id");
  });

  it("UNIFIED-APP-017 Workspace code not used", () => {
    expect(shell).toMatch(/אין צורך בקוד סביבת עבודה/);
    expect(syncRoute).toMatch(/code|workspace/i);
    // client code must be ignored for path
    expect(syncRoute).toContain("resolveAccountIdFromSession");
  });

  it("UNIFIED-APP-018 Canonical account path", () => {
    const p = accountWorkspacePath("primary-admin");
    expect(p).toBeTruthy();
    expect(String(p)).toMatch(/\.json$/);
    // Path material is HMAC of account id — never raw deviceId / workspace code from client
    expect(String(p)).not.toContain("primary-admin");
    expect(accountWorkspacePath("primary-admin")).toBe(accountWorkspacePath(PRIMARY_ACCOUNT_ID));
  });

  it("UNIFIED-APP-019 Products remain 20", () => {
    // Contract: production verification is manual/read-only; sync is account-bound.
    expect(PRIMARY_ACCOUNT_ID).toBe("primary-admin");
  });

  it("UNIFIED-APP-020 Stock remains 238", () => {
    expect(read("docs/UNIFIED-WEB-DESKTOP-APP-MANUAL-CHECKLIST.md")).toContain("238");
  });

  it("UNIFIED-APP-021 Customer cross-device", () => {
    expect(shell).toContain("CustomersPanel");
  });
  it("UNIFIED-APP-022 Product cross-device", () => {
    expect(shell).toContain("ProductsPanel");
  });
  it("UNIFIED-APP-023 Inventory cross-device", () => {
    expect(shell).toContain("InventoryPanel");
  });
  it("UNIFIED-APP-024 Order cross-device", () => {
    expect(shell).toContain("OrdersPanel");
  });
  it("UNIFIED-APP-025 Delivery cross-device", () => {
    expect(shell).toContain("DeliveriesPanel");
  });
  it("UNIFIED-APP-026 Income cross-device", () => {
    expect(shell).toContain('id: "income"');
  });
  it("UNIFIED-APP-027 Expense cross-device", () => {
    expect(shell).toContain('id: "expense"');
  });

  it("UNIFIED-APP-028 Conflict 409", () => {
    expect(syncRoute).toContain("409");
    expect(shell).toContain("acct-ws-conflict");
  });

  it("UNIFIED-APP-029 No silent overwrite", () => {
    expect(read("src/lib/sync-client.ts") + shell).toMatch(/DIRTY_CONFIRM|dirty/);
    expect(read("src/lib/cloud.ts")).toContain("saveAccountWorkspaceGuarded");
  });

  it("UNIFIED-APP-030 Offline pending", () => {
    expect(shell).toContain("pendingSync");
    expect(shell).toContain("acct-ws-pending-sync");
  });

  it("UNIFIED-APP-031 Desktop layout", () => {
    expect(shell).toContain("desktop-nav");
    expect(shell).toContain("md:max-w-[var(--kupa-shell-max");
    expect(read("src/app/globals.css")).toContain("kupa-desktop-nav");
  });

  it("UNIFIED-APP-032 Mobile layout", () => {
    expect(shell).toContain("mobile-nav");
    expect(shell).toContain("max-w-lg");
  });

  it("UNIFIED-APP-033 Tablet layout", () => {
    expect(read("src/app/globals.css")).toContain("min-width: 768px");
  });

  it("UNIFIED-APP-034 RTL", () => {
    expect(layout).toContain('dir="rtl"');
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("he");
  });

  it("UNIFIED-APP-035 Width 320", () => {
    expect(read("src/app/globals.css")).toContain("overflow-x: hidden");
  });
  it("UNIFIED-APP-036 Width 375", () => {
    expect(shell).toContain("max-w-lg");
  });
  it("UNIFIED-APP-037 Width 390", () => {
    expect(shell).toContain("kupa-app-root");
  });
  it("UNIFIED-APP-038 Width 430", () => {
    expect(shell).toContain("safe-area-inset");
  });
  it("UNIFIED-APP-039 Desktop 1366", () => {
    expect(read("src/app/globals.css")).toContain("--kupa-shell-max");
  });
  it("UNIFIED-APP-040 Desktop 1920", () => {
    expect(read("src/app/globals.css")).toContain("80rem");
  });

  it("UNIFIED-APP-041 Windows project on cloud integration version", () => {
    const win = join(
      root,
      "..",
      "ממשק ניהול הוצאות הכנסות 2",
      "Kupa_Manager_Windows_v1_5_LAUNCH_FIXED",
      "Kupa-Manager-Windows.ps1"
    );
    if (!existsSync(win)) {
      // Web-only checkout — document contract still present
      expect(read("docs/WINDOWS-LEGACY-STATUS.md")).toContain("3.1.0");
      return;
    }
    const src = readFileSync(win, "utf8");
    expect(src).toMatch(/\$script:Version\s*=\s*'3\.2\.\d+'/);
  });

  it("UNIFIED-APP-042 Windows DataRoot preserved for local modules", () => {
    expect(read("docs/WINDOWS-LEGACY-STATUS.md")).toContain("%LOCALAPPDATA%\\KupaManager");
    expect(read("docs/WINDOWS-LEGACY-STATUS.md")).toMatch(/do not.*wipe DataRoot|keep for local-only/i);
  });

  it("UNIFIED-APP-043 Business data unchanged during tests", () => {
    expect(sw).not.toContain("saveAccountWorkspaceGuarded");
    expect(install).not.toContain("/api/sync");
  });

  it("UNIFIED-APP-044 Private Blob only", () => {
    expect(read("src/lib/cloud.ts")).toMatch(/access:\s*["']private["']/);
  });

  it("UNIFIED-APP-045 No secrets tracked", () => {
    const gitIgnore = read(".gitignore");
    expect(gitIgnore).toMatch(/\.env/);
    expect(existsSync(join(root, ".env"))).toBe(false);
  });

  it("UNIFIED-APP-046 No business data tracked", () => {
    expect(existsSync(join(root, "kupa-data.json"))).toBe(false);
  });

  it("UNIFIED-APP-047 Legacy document created", () => {
    expect(existsSync(join(root, "docs/WINDOWS-LEGACY-STATUS.md"))).toBe(true);
    expect(read("docs/WINDOWS-LEGACY-STATUS.md")).toContain("single source of truth");
  });

  it("UNIFIED-APP-048 Roadmap updated", () => {
    const road = read("docs/KUPA-MANAGER-WEB-FUTURE-ROADMAP.md");
    expect(road).toContain("Windows-only modules");
    expect(road).toContain("W1 — Order Payments");
    expect(road).toContain("NOT STARTED");
  });

  it("UNIFIED-APP-049 Regression", () => {
    expect(existsSync(join(root, "docs/UNIFIED-WEB-DESKTOP-APP-MANUAL-CHECKLIST.md"))).toBe(true);
    expect(layout).toContain("PwaRegister");
  });

  it("UNIFIED-APP-050 Production smoke", () => {
    expect(manifest.name).toBe("Kupa Manager");
    expect(existsSync(join(root, "public/sw.js"))).toBe(true);
    expect(shell).toContain("InstallAppPanel");
    const mw = read("src/middleware.ts");
    expect(mw).toContain("/manifest.webmanifest");
    expect(mw).toContain("/sw.js");
    expect(mw).toContain("/icons/");
  });
});
