/** Installable Web App helpers — no business data. */

export type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function detectClientPlatform(): "windows" | "android" | "ios" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Windows/i.test(ua)) return "windows";
  return "other";
}

export async function clearKupaServiceWorkerCaches(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.active) {
      reg.active.postMessage({ type: "KUPA_CLEAR_CACHES" });
    }
  } catch {
    /* ignore */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
}

export function assertStaticOnlyServiceWorker(swSource: string): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!swSource.includes("kupa-static")) reasons.push("missing static cache name");
  if (!swSource.includes('pathname.startsWith("/api/")')) reasons.push("missing API path exclusion");
  if (!/isApiPath\(req\.url\)\)\s*return/.test(swSource)) {
    reasons.push("API fetch handler does not early-return");
  }
  if (/cache\.put\([^\n]*\/api\//i.test(swSource)) reasons.push("API cache.put found");
  if (!swSource.includes("KUPA_CLEAR_CACHES")) reasons.push("missing logout cache clear message");
  return { ok: reasons.length === 0, reasons };
}

export function assertManifestContract(manifest: {
  name?: string;
  short_name?: string;
  display?: string;
  start_url?: string;
  dir?: string;
  lang?: string;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (manifest.name !== "Kupa Manager") reasons.push("name");
  if (manifest.short_name !== "Kupa") reasons.push("short_name");
  if (manifest.display !== "standalone") reasons.push("display");
  if (manifest.start_url !== "/" && manifest.start_url !== "./") reasons.push("start_url");
  if (manifest.dir !== "rtl") reasons.push("dir");
  if (manifest.lang !== "he") reasons.push("lang");
  return { ok: reasons.length === 0, reasons };
}
