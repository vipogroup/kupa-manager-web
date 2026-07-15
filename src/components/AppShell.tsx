"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ensureWorkspaceCode,
  formatMoney,
  sumAmounts,
  todayISO,
  useKupaStore,
} from "@/lib/store";
import type { AppData, TabId } from "@/lib/types";
import { applyCloudLoad, saveToCloud } from "@/lib/sync-client";
import { CustomersPanel } from "@/components/CustomersPanel";
import { ProductsPanel } from "@/components/ProductsPanel";

const tabs: { id: TabId; label: string }[] = [
  { id: "home", label: "בית" },
  { id: "income", label: "הכנסות" },
  { id: "expense", label: "הוצאות" },
  { id: "customers", label: "לקוחות" },
  { id: "products", label: "מוצרים" },
  { id: "sync", label: "סנכרון" },
];

export function AppShell() {
  const [tab, setTab] = useState<TabId>("home");
  const [ready, setReady] = useState(false);
  const [pendingDirtyLoad, setPendingDirtyLoad] = useState(false);
  const [banner, setBanner] = useState("");
  const store = useKupaStore();

  useEffect(() => {
    const finish = () => {
      const current = useKupaStore.getState();
      const code = current.workspaceCode || ensureWorkspaceCode();
      if (!current.workspaceCode) current.hydrateWorkspaceCode(code);
      setReady(true);
    };
    const unsub = useKupaStore.persist.onFinishHydration(finish);
    if (useKupaStore.persist.hasHydrated()) finish();
    return unsub;
  }, []);

  // Auto-load after login / refresh / app open (no polling).
  useEffect(() => {
    if (!ready) return;
    const code = useKupaStore.getState().workspaceCode;
    if (!code) return;
    let cancelled = false;
    void (async () => {
      const state = useKupaStore.getState();
      if (state.dirty) {
        setPendingDirtyLoad(true);
        setBanner("קיימים שינויים שלא נשמרו. טעינת הענן תחליף אותם.");
        return;
      }
      const result = await applyCloudLoad(code, true);
      if (cancelled) return;
      if (!result.ok && result.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!result.ok) {
        setBanner(result.error || "טעינה מהענן נכשלה — הנתונים המקומיים נשמרו");
        return;
      }
      if (!result.exists) {
        setBanner("לא נמצאו נתונים שמורים בענן עבור סביבת העבודה הזאת.");
        return;
      }
      setBanner("נטען מהענן לאחר פתיחה / רענון.");
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const incomeTotal = useMemo(() => sumAmounts(store.incomes), [store.incomes]);
  const expenseTotal = useMemo(() => sumAmounts(store.expenses), [store.expenses]);
  const balance = incomeTotal - expenseTotal;

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
        טוען…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/95 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[var(--accent)]">
              KUPA MANAGER
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">
              ניהול הכנסות והוצאות
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">ממשק נייד מאובטח</p>
          </div>
          <button
            type="button"
            className="mt-1 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]"
            onClick={() => {
              void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                window.location.href = "/login";
              });
            }}
          >
            יציאה
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        {pendingDirtyLoad ? (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="font-medium text-amber-950">קיימים שינויים שלא נשמרו. טעינת הענן תחליף אותם.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl border border-[var(--line)] bg-white py-2 font-semibold"
                onClick={() => {
                  setPendingDirtyLoad(false);
                  setBanner("טעינה מהענן בוטלה — השינויים המקומיים נשמרו");
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--accent)] py-2 font-semibold text-white"
                onClick={() => {
                  void (async () => {
                    const code = useKupaStore.getState().workspaceCode;
                    setPendingDirtyLoad(false);
                    const result = await applyCloudLoad(code, true);
                    if (!result.ok && result.status === 401) {
                      window.location.href = "/login";
                      return;
                    }
                    if (!result.ok) {
                      setBanner(result.error || "טעינה נכשלה");
                      return;
                    }
                    if (!result.exists) {
                      setBanner("לא נמצאו נתונים שמורים בענן עבור סביבת העבודה הזאת.");
                      return;
                    }
                    setBanner("נטען מהענן בהצלחה");
                  })();
                }}
              >
                טען מהענן
              </button>
            </div>
          </div>
        ) : null}
        {banner ? (
          <p className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)]">
            {banner}
          </p>
        ) : null}
        {tab === "home" && (
          <HomeView
            incomeTotal={incomeTotal}
            expenseTotal={expenseTotal}
            balance={balance}
            customers={store.customers.length}
            products={store.products.length}
            onGo={setTab}
          />
        )}
        {tab === "income" && (
          <MoneyView
            kind="income"
            rows={store.incomes}
            onAdd={store.addIncome}
            onRemove={store.removeIncome}
          />
        )}
        {tab === "expense" && (
          <MoneyView
            kind="expense"
            rows={store.expenses}
            onAdd={store.addExpense}
            onRemove={store.removeExpense}
          />
        )}
        {tab === "customers" && <CustomersPanel />}
        {tab === "products" && <ProductsPanel />}
        {tab === "sync" && <SyncView />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--line)] bg-[var(--panel)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-6 gap-1 px-1 py-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-1 py-2 text-[0.72rem] font-medium transition ${
                tab === t.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-black/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function HomeView({
  incomeTotal,
  expenseTotal,
  balance,
  customers,
  products,
  onGo,
}: {
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  customers: number;
  products: number;
  onGo: (t: TabId) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl bg-[linear-gradient(145deg,#0f3d2e_0%,#1f6f4a_55%,#c4a35a_140%)] p-5 text-white shadow-lg">
        <p className="text-sm text-white/80">יתרה נוכחית</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">
          {formatMoney(balance)}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-white/70">הכנסות</p>
            <p className="mt-1 text-lg font-semibold">{formatMoney(incomeTotal)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-white/70">הוצאות</p>
            <p className="mt-1 text-lg font-semibold">{formatMoney(expenseTotal)}</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <QuickCard label="לקוחות" value={String(customers)} onClick={() => onGo("customers")} />
        <QuickCard label="מוצרים" value={String(products)} onClick={() => onGo("products")} />
        <QuickCard label="הוסף הכנסה" value="+" onClick={() => onGo("income")} />
        <QuickCard label="הוסף הוצאה" value="+" onClick={() => onGo("expense")} />
      </section>
    </div>
  );
}

function QuickCard({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-right shadow-sm transition active:scale-[0.98]"
    >
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold">{value}</p>
    </button>
  );
}

function MoneyView({
  kind,
  rows,
  onAdd,
  onRemove,
}: {
  kind: "income" | "expense";
  rows: AppData["incomes"];
  onAdd: (input: {
    title: string;
    amount: number;
    date: string;
    category: string;
    note: string;
  }) => void;
  onRemove: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(kind === "income" ? "מכירות" : "תפעול");
  const [note, setNote] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!title.trim() || !Number.isFinite(n) || n <= 0) return;
    onAdd({
      title: title.trim(),
      amount: n,
      date: todayISO(),
      category,
      note: note.trim(),
    });
    setTitle("");
    setAmount("");
    setNote("");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          {kind === "income" ? "הכנסה חדשה" : "הוצאה חדשה"}
        </h2>
        <Field label="תיאור" value={title} onChange={setTitle} placeholder="למשל: הזמנה 120" />
        <Field label="סכום" value={amount} onChange={setAmount} placeholder="0" type="number" />
        <Field label="קטגוריה" value={category} onChange={setCategory} />
        <Field label="הערה" value={note} onChange={setNote} placeholder="אופציונלי" />
        <button
          type="submit"
          className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white"
        >
          שמירה
        </button>
      </form>

      <ListEmpty empty={rows.length === 0} text="אין רשומות עדיין" />
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3"
          >
            <div>
              <p className="font-semibold">{r.title}</p>
              <p className="text-sm text-[var(--muted)]">
                {r.date} · {r.category}
              </p>
              {r.note ? <p className="mt-1 text-sm">{r.note}</p> : null}
            </div>
            <div className="text-left">
              <p
                className={`font-semibold ${
                  kind === "income" ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatMoney(r.amount)}
              </p>
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                className="mt-2 text-xs text-[var(--muted)] underline"
              >
                מחק
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function syncStatusLabel(status: string, dirty: boolean): string {
  switch (status) {
    case "saving":
      return "שמירה מתבצעת…";
    case "loading":
      return "טעינה מתבצעת…";
    case "synced":
      return "מסונכרן";
    case "conflict":
      return "התנגשות בין מכשירים";
    case "offline":
      return "אין חיבור לאינטרנט";
    case "error":
      return "שגיאה — הנתונים המקומיים נשמרו";
    case "dirty":
      return "יש שינויים שלא נשמרו";
    case "clean":
      return dirty ? "יש שינויים שלא נשמרו" : "מוכן";
    default:
      return status;
  }
}

function SyncView() {
  const store = useKupaStore();
  const [code, setCode] = useState(store.workspaceCode);
  const [message, setMessage] = useState("");
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const saving = store.syncStatus === "saving";
  const loading = store.syncStatus === "loading";

  useEffect(() => {
    setCode(store.workspaceCode);
  }, [store.workspaceCode]);

  async function pushCloud() {
    setMessage("");
    const result = await saveToCloud(code);
    if (!result.ok && result.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (result.ok) {
      setMessage("שמירה הצליחה");
      setConflictOpen(false);
      return;
    }
    if (result.conflict) {
      setConflictOpen(true);
      setMessage("הנתונים בענן השתנו ממכשיר אחר. טען את הגרסה החדשה לפני שמירה נוספת.");
      return;
    }
    setMessage(result.error || "שמירה נכשלה");
  }

  async function pullCloud(force: boolean) {
    if (!force && store.dirty) {
      setConfirmLoad(true);
      return;
    }
    setConfirmLoad(false);
    setMessage("");
    const result = await applyCloudLoad(code, true);
    if (!result.ok && result.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!result.ok) {
      setMessage(result.error || "טעינה נכשלה — הנתונים המקומיים נשמרו");
      return;
    }
    if (!result.exists) {
      setMessage("לא נמצאו נתונים שמורים בענן עבור סביבת העבודה הזאת.");
      return;
    }
    setConflictOpen(false);
    setMessage("טעינה הצליחה");
  }

  async function refreshStatus() {
    setMessage("מרענן מצב…");
    const result = await applyCloudLoad(code, !store.dirty);
    if (!result.ok && result.error === "DIRTY_CONFIRM_REQUIRED") {
      setConfirmLoad(true);
      setMessage("קיימים שינויים שלא נשמרו. טעינת הענן תחליף אותם.");
      return;
    }
    if (!result.ok && result.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!result.ok) {
      setMessage(result.error || "רענון נכשל");
      return;
    }
    if (!result.exists) {
      setMessage("לא נמצאו נתונים שמורים בענן עבור סביבת העבודה הזאת.");
      return;
    }
    setMessage("מצב עודכן מהענן");
  }

  function copyCode() {
    void navigator.clipboard?.writeText(code);
    setMessage("הקוד הועתק");
  }

  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">סנכרון בין מכשירים</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          שינויים ממכשיר אחר יופיעו לאחר רענון או טעינה מהענן.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">מצב חיבור</dt>
            <dd className="font-semibold">{online ? "מחובר" : "לא מחובר"}</dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">מצב סנכרון</dt>
            <dd className="font-semibold">{syncStatusLabel(store.syncStatus, store.dirty)}</dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">שמירה אחרונה בענן</dt>
            <dd className="font-semibold text-xs break-all">{store.cloudUpdatedAt || "—"}</dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">revision נוכחי</dt>
            <dd className="font-semibold">{store.cloudRevision || 0}</dd>
          </div>
        </dl>

        <label className="mt-4 block text-sm font-medium">
          קוד סביבת עבודה
          <input
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 font-mono text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            dir="ltr"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={saving || loading || !code}
            onClick={() => void pushCloud()}
            className="rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            שמור לענן
          </button>
          <button
            type="button"
            disabled={saving || loading || !code}
            onClick={() => void pullCloud(false)}
            className="rounded-xl border border-[var(--line)] bg-white py-3 text-sm font-semibold disabled:opacity-50"
          >
            טען מהענן
          </button>
        </div>
        <button
          type="button"
          disabled={saving || loading || !code}
          onClick={() => void refreshStatus()}
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white py-2 text-sm font-semibold disabled:opacity-50"
        >
          רענן מצב
        </button>
        <button type="button" onClick={copyCode} className="mt-2 w-full py-2 text-sm text-[var(--accent)] underline">
          העתק קוד
        </button>

        {confirmLoad ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
            <p>קיימים שינויים שלא נשמרו. טעינת הענן תחליף אותם.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-lg border bg-white py-2" onClick={() => setConfirmLoad(false)}>
                ביטול
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] py-2 text-white"
                onClick={() => void pullCloud(true)}
              >
                טען מהענן
              </button>
            </div>
          </div>
        ) : null}

        {conflictOpen ? (
          <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm">
            <p>הנתונים בענן השתנו ממכשיר אחר. טען את הגרסה החדשה לפני שמירה נוספת.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-lg border bg-white py-2" onClick={() => setConflictOpen(false)}>
                ביטול
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] py-2 text-white"
                onClick={() => void pullCloud(true)}
              >
                טען מהענן
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p className="mt-3 text-sm text-[var(--ink)]">{message}</p> : null}
        {store.lastError && store.syncStatus === "error" ? (
          <p className="mt-2 text-xs text-rose-700">{store.lastError}</p>
        ) : null}
        <p className="mt-3 text-xs text-[var(--muted)]">עודכן מקומית: {store.updatedAt || "—"}</p>
        {store.dirty ? (
          <p className="mt-1 text-xs font-semibold text-amber-800">יש שינויים שלא נשמרו</p>
        ) : null}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base outline-none ring-[var(--accent)] focus:ring-2"
      />
    </label>
  );
}

function ListEmpty({ empty, text }: { empty: boolean; text: string }) {
  if (!empty) return null;
  return (
    <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
      {text}
    </p>
  );
}
