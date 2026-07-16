"use client";

import { useEffect } from "react";

/** Registers static-only service worker in production-like hosts. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const host = window.location.hostname;
    const allow =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app") ||
      host === "kupa-manager-web.vercel.app";
    if (!allow) return;

    let cancelled = false;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
