"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "שם משתמש או סיסמה אינם נכונים");
        return;
      }
      router.replace(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch {
      setError("לא ניתן להתחבר כרגע");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-sm">
        <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[var(--accent)]">KUPA MANAGER</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold">התחברות</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">גישה מאובטחת לממשק הניהול</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium">
            שם משתמש
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            סיסמה
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "מתחבר…" : "התחברות"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center">טוען…</div>}>
      <LoginForm />
    </Suspense>
  );
}
