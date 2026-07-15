"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { MOBILE_REGISTRY } from "./mobile-registry";
import {
  applyHideOptional,
  applyResetDefault,
  applyShowAll,
  preferencesForPreset,
  sanitizeHiddenIds,
} from "./presets";
import {
  defaultMobilePreferences,
  type MobilePresetId,
  type MobileUiPreferences,
} from "./types";

type PrefsState = {
  preferences: MobileUiPreferences;
  revision: number;
  dirty: boolean;
  pendingSync: boolean;
  status: "idle" | "loading" | "saving" | "synced" | "conflict" | "offline" | "error";
  lastError: string;
  hydrated: boolean;
};

type PrefsApi = PrefsState & {
  isHidden: (id: string) => boolean;
  setHidden: (id: string, hidden: boolean) => void;
  setPreset: (preset: MobilePresetId) => void;
  showAll: () => void;
  hideOptional: () => void;
  resetDefault: () => void;
  discardLocal: () => void;
  save: () => Promise<{ ok: boolean; conflict?: boolean; error?: string }>;
  load: () => Promise<void>;
  draft: MobileUiPreferences;
  setDraft: (p: MobileUiPreferences) => void;
};

const Ctx = createContext<PrefsApi | null>(null);

const MOBILE_MQ = "(max-width: 640px)";

function applyDomHidden(hiddenIds: string[], mobileViewport: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!mobileViewport) {
    root.classList.remove("kupa-mobile-prefs-active");
    root.removeAttribute("data-mobile-hidden-ids");
    document.querySelectorAll<HTMLElement>("[data-mobile-id]").forEach((node) => {
      node.removeAttribute("data-mobile-hidden");
    });
    return;
  }
  root.classList.add("kupa-mobile-prefs-active");
  const required = new Set(MOBILE_REGISTRY.filter((e) => e.required).map((e) => e.id));
  const hide = new Set(hiddenIds.filter((id) => !required.has(id)));
  root.setAttribute("data-mobile-hidden-ids", Array.from(hide).join(" "));
  document.querySelectorAll<HTMLElement>("[data-mobile-id]").forEach((node) => {
    const id = node.getAttribute("data-mobile-id") || "";
    if (hide.has(id)) node.setAttribute("data-mobile-hidden", "1");
    else node.removeAttribute("data-mobile-hidden");
  });
}

export function MobilePrefsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PrefsState>({
    preferences: defaultMobilePreferences(),
    revision: 0,
    dirty: false,
    pendingSync: false,
    status: "idle",
    lastError: "",
    hydrated: false,
  });
  const [draft, setDraft] = useState<MobileUiPreferences>(defaultMobilePreferences());
  const [mobileViewport, setMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_MQ);
    const update = () => setMobileViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    applyDomHidden(state.preferences.hiddenElementIds, mobileViewport);
  }, [state.preferences.hiddenElementIds, mobileViewport, state.hydrated]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setState((s) => ({ ...s, status: "offline", hydrated: true }));
        return;
      }
      const res = await fetch("/api/preferences", { cache: "no-store" });
      if (res.status === 401) {
        setState((s) => ({ ...s, status: "error", lastError: "נדרשת התחברות", hydrated: true }));
        return;
      }
      const json = (await res.json()) as {
        preferences?: MobileUiPreferences;
        revision?: number;
      };
      const preferences = json.preferences
        ? {
            version: 1 as const,
            preset: json.preferences.preset,
            hiddenElementIds: sanitizeHiddenIds(json.preferences.hiddenElementIds || []),
          }
        : defaultMobilePreferences();
      setDraft(preferences);
      setState({
        preferences,
        revision: Number(json.revision) || 0,
        dirty: false,
        pendingSync: false,
        status: "synced",
        lastError: "",
        hydrated: true,
      });
    } catch {
      setState((s) => ({
        ...s,
        status: "error",
        lastError: "טעינת העדפות נכשלה",
        hydrated: true,
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState((s) => ({
        ...s,
        preferences: draft,
        dirty: true,
        pendingSync: true,
        status: "offline",
        lastError: "אין חיבור — ממתין לסנכרון",
      }));
      return { ok: false, error: "אין חיבור" };
    }
    setState((s) => ({ ...s, status: "saving" }));
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: state.revision,
          deviceId: getOrCreateDeviceId(),
          preferences: {
            version: 1,
            preset: draft.preset,
            hiddenElementIds: sanitizeHiddenIds(draft.hiddenElementIds),
          },
        }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (res.status === 409 || json.error === "CLOUD_VERSION_CHANGED") {
        setState((s) => ({
          ...s,
          status: "conflict",
          lastError: "התנגשות בין מכשירים בהעדפות",
        }));
        return { ok: false, conflict: true };
      }
      if (!res.ok) {
        setState((s) => ({
          ...s,
          dirty: true,
          pendingSync: true,
          status: "error",
          lastError: typeof json.error === "string" ? json.error : "שמירה נכשלה",
        }));
        return { ok: false, error: "שמירה נכשלה" };
      }
      const preferences = (json.preferences as MobileUiPreferences) || draft;
      setDraft(preferences);
      setState({
        preferences,
        revision: Number(json.revision) || state.revision + 1,
        dirty: false,
        pendingSync: false,
        status: "synced",
        lastError: "",
        hydrated: true,
      });
      return { ok: true };
    } catch {
      setState((s) => ({
        ...s,
        dirty: true,
        pendingSync: true,
        status: "offline",
        lastError: "אין חיבור — ממתין לסנכרון",
      }));
      return { ok: false, error: "offline" };
    }
  }, [draft, state.revision]);

  useEffect(() => {
    function onOnline() {
      if (state.pendingSync || state.dirty) void save();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [save, state.pendingSync, state.dirty]);

  const api = useMemo<PrefsApi>(() => {
    return {
      ...state,
      draft,
      setDraft: (p) => {
        setDraft({
          version: 1,
          preset: "custom",
          hiddenElementIds: sanitizeHiddenIds(p.hiddenElementIds),
        });
        setState((s) => ({ ...s, dirty: true }));
      },
      isHidden: (id) => {
        const el = MOBILE_REGISTRY.find((e) => e.id === id);
        if (el?.required) return false;
        return draft.hiddenElementIds.includes(id);
      },
      setHidden: (id, hidden) => {
        const el = MOBILE_REGISTRY.find((e) => e.id === id);
        if (!el || el.required) return;
        setDraft((d) => {
          const set = new Set(d.hiddenElementIds);
          if (hidden) set.add(id);
          else set.delete(id);
          return {
            version: 1,
            preset: "custom",
            hiddenElementIds: sanitizeHiddenIds([...set]),
          };
        });
        setState((s) => ({ ...s, dirty: true }));
      },
      setPreset: (preset) => {
        const next = preferencesForPreset(preset);
        setDraft(next);
        setState((s) => ({ ...s, dirty: true }));
      },
      showAll: () => {
        setDraft(applyShowAll());
        setState((s) => ({ ...s, dirty: true }));
      },
      hideOptional: () => {
        setDraft(applyHideOptional());
        setState((s) => ({ ...s, dirty: true }));
      },
      resetDefault: () => {
        setDraft(applyResetDefault());
        setState((s) => ({ ...s, dirty: true }));
      },
      discardLocal: () => {
        setDraft(state.preferences);
        setState((s) => ({ ...s, dirty: false, lastError: "" }));
      },
      save,
      load,
    };
  }, [state, draft, save, load]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useMobilePrefs(): PrefsApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMobilePrefs outside provider");
  return ctx;
}

/** Marks a live-bound mobile UI element. Hidden via CSS when optional + unchecked. */
export function MobileMark({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-mobile-id={id} className={className}>
      {children}
    </div>
  );
}

export function MobileMarkSpan({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span data-mobile-id={id} className={className}>
      {children}
    </span>
  );
}
