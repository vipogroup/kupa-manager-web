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
  const store = useKupaStore();

  useEffect(() => {
    const unsub = useKupaStore.persist.onFinishHydration(() => {
      const current = useKupaStore.getState();
      const code = current.workspaceCode || ensureWorkspaceCode();
      if (!current.workspaceCode) current.hydrateWorkspaceCode(code);
      setReady(true);
    });
    if (useKupaStore.persist.hasHydrated()) {
      const current = useKupaStore.getState();
      const code = current.workspaceCode || ensureWorkspaceCode();
      if (!current.workspaceCode) current.hydrateWorkspaceCode(code);
      setReady(true);
    }
    return unsub;
  }, []);

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
        <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[var(--accent)]">
          KUPA MANAGER
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">
          ניהול הכנסות והוצאות
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">ממשק נייד לעדכון מכל מקום</p>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
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
        {tab === "customers" && (
          <CustomersView
            rows={store.customers}
            onAdd={store.addCustomer}
            onRemove={store.removeCustomer}
          />
        )}
        {tab === "products" && (
          <ProductsView
            rows={store.products}
            onAdd={store.addProduct}
            onRemove={store.removeProduct}
          />
        )}
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

function CustomersView({
  rows,
  onAdd,
  onRemove,
}: {
  rows: AppData["customers"];
  onAdd: (input: { name: string; phone: string; note: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim(), phone: phone.trim(), note: note.trim() });
    setName("");
    setPhone("");
    setNote("");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">לקוח חדש</h2>
        <Field label="שם" value={name} onChange={setName} />
        <Field label="טלפון" value={phone} onChange={setPhone} type="tel" />
        <Field label="הערה" value={note} onChange={setNote} />
        <button type="submit" className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white">
          שמירה
        </button>
      </form>
      <ListEmpty empty={rows.length === 0} text="אין לקוחות עדיין" />
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-[var(--muted)]" dir="ltr">
                  {c.phone || "ללא טלפון"}
                </p>
                {c.note ? <p className="mt-1 text-sm">{c.note}</p> : null}
              </div>
              <button type="button" onClick={() => onRemove(c.id)} className="text-xs text-[var(--muted)] underline">
                מחק
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductsView({
  rows,
  onAdd,
  onRemove,
}: {
  rows: AppData["products"];
  onAdd: (input: { name: string; price: number; sku: string; stock: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");
  const [stock, setStock] = useState("0");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(price);
    const s = Number(stock);
    if (!name.trim() || !Number.isFinite(p) || p < 0) return;
    onAdd({
      name: name.trim(),
      price: p,
      sku: sku.trim(),
      stock: Number.isFinite(s) ? s : 0,
    });
    setName("");
    setPrice("");
    setSku("");
    setStock("0");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">מוצר חדש</h2>
        <Field label="שם מוצר" value={name} onChange={setName} />
        <Field label="מחיר" value={price} onChange={setPrice} type="number" />
        <Field label="מק״ט" value={sku} onChange={setSku} />
        <Field label="מלאי" value={stock} onChange={setStock} type="number" />
        <button type="submit" className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white">
          שמירה
        </button>
      </form>
      <ListEmpty empty={rows.length === 0} text="אין מוצרים עדיין" />
      <ul className="space-y-2">
        {rows.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-sm text-[var(--muted)]">
                {p.sku ? `מק״ט ${p.sku} · ` : ""}
                מלאי {p.stock}
              </p>
            </div>
            <div className="text-left">
              <p className="font-semibold">{formatMoney(p.price)}</p>
              <button type="button" onClick={() => onRemove(p.id)} className="mt-2 text-xs text-[var(--muted)] underline">
                מחק
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SyncView() {
  const store = useKupaStore();
  const [code, setCode] = useState(store.workspaceCode);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode(store.workspaceCode);
  }, [store.workspaceCode]);

  async function pushCloud() {
    setBusy(true);
    setStatus("שומר לענן…");
    try {
      const payload: AppData = {
        version: 1,
        incomes: store.incomes,
        expenses: store.expenses,
        customers: store.customers,
        products: store.products,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, data: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "שמירה נכשלה");
      store.hydrateWorkspaceCode(code);
      if (typeof window !== "undefined") localStorage.setItem("kupa-workspace-code", code);
      setStatus(`נשמר בהצלחה (${json.mode})`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function pullCloud() {
    setBusy(true);
    setStatus("מושך מהענן…");
    try {
      const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "טעינה נכשלה");
      store.replaceAll(json.data);
      store.hydrateWorkspaceCode(code);
      if (typeof window !== "undefined") localStorage.setItem("kupa-workspace-code", code);
      setStatus(json.exists ? `נטען בהצלחה (${json.mode})` : "אין נתונים בענן לקוד הזה — אפשר לשמור עכשיו");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    void navigator.clipboard?.writeText(code);
    setStatus("הקוד הועתק");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">סנכרון בין מכשירים</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          שמרו את קוד הסביבה בטלפון/מחשב, לחצו ״שמור לענן״ במכשיר אחד ו״טען מהענן״ באחר.
        </p>
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
            disabled={busy || !code}
            onClick={() => void pushCloud()}
            className="rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            שמור לענן
          </button>
          <button
            type="button"
            disabled={busy || !code}
            onClick={() => void pullCloud()}
            className="rounded-xl border border-[var(--line)] bg-white py-3 text-sm font-semibold disabled:opacity-50"
          >
            טען מהענן
          </button>
        </div>
        <button type="button" onClick={copyCode} className="mt-2 w-full py-2 text-sm text-[var(--accent)] underline">
          העתק קוד
        </button>
        {status ? <p className="mt-3 text-sm text-[var(--ink)]">{status}</p> : null}
        <p className="mt-3 text-xs text-[var(--muted)]">עודכן מקומית: {store.updatedAt || "—"}</p>
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
