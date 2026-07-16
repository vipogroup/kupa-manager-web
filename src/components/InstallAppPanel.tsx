"use client";

import { useEffect, useState } from "react";
import {
  clearKupaServiceWorkerCaches,
  detectClientPlatform,
  isStandaloneDisplay,
  type BeforeInstallPromptEventLike,
} from "@/lib/pwa";

let deferredPrompt: BeforeInstallPromptEventLike | null = null;

export function InstallAppPanel() {
  const [standalone, setStandalone] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [platform, setPlatform] = useState<"windows" | "android" | "ios" | "other">("other");
  const [hint, setHint] = useState("");

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setPlatform(detectClientPlatform());

    const onBip = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEventLike;
      setCanPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    const onInstalled = () => {
      deferredPrompt = null;
      setCanPrompt(false);
      setStandalone(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installDesktop() {
    if (!deferredPrompt) {
      setHint("הדפדפן אינו מציע התקנה אוטומטית כרגע. השתמשו בהוראות למטה.");
      return;
    }
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      setHint("לא ניתן להשלים התקנה אוטומטית. נסו דרך תפריט הדפדפן.");
    } finally {
      deferredPrompt = null;
      setCanPrompt(false);
      setStandalone(isStandaloneDisplay());
    }
  }

  if (standalone) {
    return (
      <section
        className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"
        data-testid="install-app-panel"
        data-installed="1"
      >
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">התקנת Kupa Manager</h2>
        <p className="mt-2 text-sm text-[var(--muted)]" data-testid="install-standalone-active">
          האפליקציה פועלת כעת במצב מותקן (חלון נפרד).
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"
      data-testid="install-app-panel"
      data-installed="0"
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">התקנת Kupa Manager</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        {platform === "windows" || platform === "other"
          ? "התקן את Kupa Manager במחשב כדי לפתוח אותה מחלון ואייקון נפרדים."
          : "הוסף את Kupa Manager למסך הבית."}
      </p>

      {canPrompt ? (
        <button
          type="button"
          className="mt-3 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white"
          data-testid="install-desktop-button"
          onClick={() => void installDesktop()}
        >
          התקן כאפליקציה במחשב
        </button>
      ) : (
        <p className="mt-3 text-xs text-[var(--muted)]" data-testid="install-prompt-unavailable">
          אין כרגע הצעת התקנה אוטומטית מהדפדפן. ניתן להתקין לפי ההוראות למטה.
        </p>
      )}

      {hint ? <p className="mt-2 text-xs text-amber-800">{hint}</p> : null}

      <div className="mt-4 space-y-3 text-sm" data-testid="install-guidance">
        <details open={platform === "windows"} className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
          <summary className="cursor-pointer font-semibold">הוראות ל-Windows (Chrome / Edge)</summary>
          <ol className="mt-2 list-decimal space-y-1 pr-5 text-[var(--muted)]">
            <li>פתחו את האתר ב-Chrome או Edge.</li>
            <li>בתפריט הדפדפן בחרו «התקן אפליקציה» / Install.</li>
            <li>אשרו — ייפתח חלון ואייקון בשולחן העבודה.</li>
          </ol>
        </details>
        <details open={platform === "android"} className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
          <summary className="cursor-pointer font-semibold" data-testid="install-android-guidance">
            הוראות ל-Android
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pr-5 text-[var(--muted)]">
            <li>פתחו ב-Chrome.</li>
            <li>תפריט ⋮ ← «התקן אפליקציה» או «הוסף למסך הבית».</li>
            <li>אשרו — האייקון יופיע במסך הבית.</li>
          </ol>
        </details>
        <details open={platform === "ios"} className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
          <summary className="cursor-pointer font-semibold" data-testid="install-iphone-guidance">
            הוראות ל-iPhone
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pr-5 text-[var(--muted)]">
            <li>פתחו ב-Safari.</li>
            <li>לחצו «שיתוף» (ריבוע עם חץ).</li>
            <li>בחרו «הוסף למסך הבית» ואשרו.</li>
          </ol>
        </details>
      </div>

      <button
        type="button"
        className="mt-3 text-xs text-[var(--muted)] underline"
        data-testid="install-clear-static-cache"
        onClick={() => void clearKupaServiceWorkerCaches()}
      >
        נקה מטמון סטטי של האפליקציה
      </button>
    </section>
  );
}
