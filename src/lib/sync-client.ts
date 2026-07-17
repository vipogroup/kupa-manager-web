"use client";

import { AppData } from "./types";
import { useKupaStore } from "./store";
import { getOrCreateDeviceId } from "./device-id";

export type SyncLoadResult =
  | { ok: true; exists: false }
  | {
      ok: true;
      exists: true;
      revision: number;
      updatedAt: string;
      data: AppData;
    }
  | { ok: false; status: number; error: string; conflict?: boolean };

export type SyncSaveResult =
  | { ok: true; revision: number; updatedAt: string }
  | {
      ok: false;
      status: number;
      error: string;
      conflict?: boolean;
      cloudRevision?: number;
      cloudUpdatedAt?: string;
    };

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function clearLegacyWorkspaceLocal(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("kupa-workspace-code");
  } catch {
    /* ignore */
  }
}

/** Fetch account-bound cloud snapshot (session cookie). Client workspace codes are not used. */
export async function fetchCloudSnapshot(): Promise<SyncLoadResult> {
  if (offline()) return { ok: false, status: 0, error: "אין חיבור לאינטרנט" };
  const res = await fetch("/api/sync", { cache: "no-store" });
  if (res.status === 401) {
    return { ok: false, status: 401, error: "נדרשת התחברות" };
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, status: res.status, error: "תשובת שרת לא תקינה" };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof json.error === "string" ? json.error : "טעינה נכשלה",
    };
  }
  if (!json.exists) return { ok: true, exists: false };
  if (!json.data || typeof json.data !== "object") {
    return { ok: false, status: 500, error: "מבנה נתונים מהענן לא תקין" };
  }
  return {
    ok: true,
    exists: true,
    revision: Number(json.revision) || 1,
    updatedAt: typeof json.updatedAt === "string" ? json.updatedAt : "",
    data: json.data as AppData,
  };
}

/** Lightweight revision probe without applying data. */
export async function fetchCloudRevision(): Promise<
  | { ok: true; exists: false }
  | { ok: true; exists: true; revision: number; updatedAt: string }
  | { ok: false; status: number; error: string }
> {
  const result = await fetchCloudSnapshot();
  if (!result.ok) return result;
  if (!result.exists) return { ok: true, exists: false };
  return {
    ok: true,
    exists: true,
    revision: result.revision,
    updatedAt: result.updatedAt,
  };
}

export async function applyCloudLoad(force = false): Promise<SyncLoadResult> {
  const store = useKupaStore.getState();
  if (!force && store.dirty) {
    return { ok: false, status: 409, error: "DIRTY_CONFIRM_REQUIRED", conflict: false };
  }
  store.setSyncStatus("loading");
  try {
    const result = await fetchCloudSnapshot();
    if (!result.ok) {
      store.setSyncStatus(offline() ? "offline" : "error", result.error);
      return result;
    }
    if (!result.exists) {
      store.setSyncStatus(store.dirty ? "dirty" : "clean");
      store.setCloudHydrated(true);
      return result;
    }
    store.replaceAll(result.data);
    store.markSynced(result.revision, result.updatedAt);
    store.setCloudHydrated(true);
    clearLegacyWorkspaceLocal();
    return result;
  } catch {
    store.setSyncStatus(offline() ? "offline" : "error", "טעינה נכשלה");
    return { ok: false, status: 0, error: "טעינה נכשלה" };
  }
}

export async function saveToCloud(): Promise<SyncSaveResult> {
  const store = useKupaStore.getState();
  if (offline()) {
    store.setSyncStatus("offline", "אין חיבור לאינטרנט — הנתונים נשמרו מקומית בלבד");
    store.setPendingSync(true);
    return { ok: false, status: 0, error: "אין חיבור לאינטרנט — הנתונים נשמרו מקומית בלבד" };
  }
  if (store.syncStatus === "saving") {
    return { ok: false, status: 0, error: "שמירה כבר מתבצעת" };
  }
  store.setSyncStatus("saving");
  // Preserve unknown top-level keys via store.asAppData() (toAppData merge).
  const payload: AppData = store.asAppData();
  try {
    const res = await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevision: store.cloudRevision || 0,
        deviceId: getOrCreateDeviceId(),
        data: payload,
      }),
    });
    if (res.status === 401) {
      store.setSyncStatus("error", "נדרשת התחברות");
      return { ok: false, status: 401, error: "נדרשת התחברות" };
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      store.setSyncStatus("error", "תשובת שרת לא תקינה");
      return { ok: false, status: res.status, error: "תשובת שרת לא תקינה" };
    }
    if (res.status === 409 || json.error === "CLOUD_VERSION_CHANGED") {
      store.setSyncStatus("conflict", "CLOUD_VERSION_CHANGED");
      return {
        ok: false,
        status: 409,
        error: "CLOUD_VERSION_CHANGED",
        conflict: true,
        cloudRevision: typeof json.cloudRevision === "number" ? json.cloudRevision : undefined,
        cloudUpdatedAt: typeof json.cloudUpdatedAt === "string" ? json.cloudUpdatedAt : undefined,
      };
    }
    if (!res.ok) {
      store.setSyncStatus("error", typeof json.error === "string" ? json.error : "שמירה נכשלה");
      useKupaStore.setState({ dirty: true, pendingSync: true });
      return {
        ok: false,
        status: res.status,
        error: typeof json.error === "string" ? json.error : "שמירה נכשלה",
      };
    }
    const revision = Number(json.revision) || store.cloudRevision + 1;
    const updatedAt = typeof json.updatedAt === "string" ? json.updatedAt : new Date().toISOString();
    store.markSynced(revision, updatedAt);
    store.setPendingSync(false);
    clearLegacyWorkspaceLocal();
    return { ok: true, revision, updatedAt };
  } catch {
    store.setSyncStatus(offline() ? "offline" : "error", "שמירה נכשלה");
    useKupaStore.setState({ dirty: true, pendingSync: true });
    return { ok: false, status: 0, error: "שמירה נכשלה" };
  }
}
