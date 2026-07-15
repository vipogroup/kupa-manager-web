"use client";

import { useEffect, useRef } from "react";
import { applyCloudLoad, fetchCloudRevision, saveToCloud } from "@/lib/sync-client";
import { useKupaStore } from "@/lib/store";

const AUTO_SAVE_DEBOUNCE_MS = 1500;
const REVISION_POLL_MS = 45_000;

type Handlers = {
  onBanner?: (msg: string) => void;
  onDirtyCloudNewer?: () => void;
  onAuthRequired?: () => void;
};

/**
 * Account-bound cloud sync: auto-load, debounced auto-save, focus/interval revision checks.
 */
export function useAccountCloudSync(ready: boolean, handlers: Handlers = {}) {
  const dirty = useKupaStore((s) => s.dirty);
  const pendingSync = useKupaStore((s) => s.pendingSync);
  const syncStatus = useKupaStore((s) => s.syncStatus);
  const cloudRevision = useKupaStore((s) => s.cloudRevision);
  const cloudHydrated = useKupaStore((s) => s.cloudHydrated);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingLock = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Initial load after persist hydration
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      const state = useKupaStore.getState();
      if (state.dirty) {
        handlersRef.current.onDirtyCloudNewer?.();
        // Still try to load? Spec: don't overwrite dirty — wait for confirm.
        // Mark as needing attention; do not leave false empty forever without probe.
        const probe = await fetchCloudRevision();
        if (cancelled) return;
        if (!probe.ok && probe.status === 401) {
          handlersRef.current.onAuthRequired?.();
          return;
        }
        if (probe.ok && probe.exists && probe.revision > (state.cloudRevision || 0)) {
          handlersRef.current.onBanner?.(
            "קיימת גרסה חדשה בענן ושינויים מקומיים שטרם נשמרו."
          );
        }
        useKupaStore.getState().setCloudHydrated(true);
        return;
      }
      const result = await applyCloudLoad(true);
      if (cancelled) return;
      if (!result.ok && result.status === 401) {
        handlersRef.current.onAuthRequired?.();
        return;
      }
      if (!result.ok) {
        handlersRef.current.onBanner?.(result.error || "טעינה מהענן נכשלה — הנתונים המקומיים נשמרו");
        useKupaStore.getState().setCloudHydrated(true);
        return;
      }
      if (!result.exists) {
        handlersRef.current.onBanner?.("אין עדיין נתונים בענן לחשבון זה.");
        return;
      }
      handlersRef.current.onBanner?.("נטען מהענן עבור החשבון המחובר.");
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // Debounced auto-save on dirty business mutations
  useEffect(() => {
    if (!ready || !cloudHydrated) return;
    if (!dirty && !pendingSync) return;
    if (syncStatus === "conflict") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        if (savingLock.current) return;
        const st = useKupaStore.getState();
        if (!st.dirty && !st.pendingSync) return;
        if (st.syncStatus === "conflict" || st.syncStatus === "saving") return;
        savingLock.current = true;
        handlersRef.current.onBanner?.("שומר…");
        const result = await saveToCloud();
        savingLock.current = false;
        if (!result.ok && result.status === 401) {
          handlersRef.current.onAuthRequired?.();
          return;
        }
        if (result.ok) {
          handlersRef.current.onBanner?.("נשמר בענן");
          return;
        }
        if (result.conflict) {
          handlersRef.current.onBanner?.(
            "הנתונים בענן השתנו ממכשיר אחר. טען את הגרסה החדשה לפני שמירה נוספת."
          );
          return;
        }
        if (result.status === 0) {
          handlersRef.current.onBanner?.(result.error || "אין חיבור — ממתין לסנכרון");
          return;
        }
        handlersRef.current.onBanner?.(result.error || "שמירה נכשלה");
      })();
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, cloudHydrated, dirty, pendingSync, syncStatus]);

  // Online retry
  useEffect(() => {
    if (!ready) return;
    function onOnline() {
      const st = useKupaStore.getState();
      if ((st.dirty || st.pendingSync) && st.syncStatus !== "conflict") {
        void saveToCloud().then((result) => {
          if (result.ok) handlersRef.current.onBanner?.("נשמר בענן לאחר חזרת החיבור");
        });
      }
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [ready]);

  // Focus / visibility + interval revision check
  useEffect(() => {
    if (!ready || !cloudHydrated) return;

    async function checkRevision(reason: string) {
      const st = useKupaStore.getState();
      if (st.syncStatus === "saving" || st.syncStatus === "loading") return;
      const probe = await fetchCloudRevision();
      if (!probe.ok) {
        if (probe.status === 401) handlersRef.current.onAuthRequired?.();
        return;
      }
      if (!probe.exists) return;
      if (probe.revision <= (st.cloudRevision || 0)) return;
      if (st.dirty || st.pendingSync) {
        handlersRef.current.onBanner?.(
          "קיימת גרסה חדשה בענן ושינויים מקומיים שטרם נשמרו."
        );
        return;
      }
      const loaded = await applyCloudLoad(true);
      if (loaded.ok && loaded.exists) {
        handlersRef.current.onBanner?.(`עודכן מהענן (${reason}).`);
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") {
        void checkRevision("חזרה לאפליקציה");
      }
    }
    function onFocus() {
      void checkRevision("מיקוד חלון");
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(() => {
      void checkRevision("בדיקה תקופתית");
    }, REVISION_POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [ready, cloudHydrated, cloudRevision]);
}
