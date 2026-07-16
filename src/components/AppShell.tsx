"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney, sumAmounts, todayISO, useKupaStore } from "@/lib/store";
import type { AppData, TabId } from "@/lib/types";
import { applyCloudLoad, saveToCloud } from "@/lib/sync-client";
import { useAccountCloudSync } from "@/lib/useAccountCloudSync";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { CustomersPanel } from "@/components/CustomersPanel";
import { ProductsPanel } from "@/components/ProductsPanel";
import { OrdersPanel } from "@/components/OrdersPanel";
import { InventoryPanel } from "@/components/InventoryPanel";
import { DeliveriesPanel } from "@/components/DeliveriesPanel";
import { CustomizationCenter } from "@/components/CustomizationCenter";
import { InstallAppPanel } from "@/components/InstallAppPanel";
import { clearKupaServiceWorkerCaches } from "@/lib/pwa";

const tabs: { id: TabId; label: string }[] = [
  { id: "home", label: "בית" },
  { id: "income", label: "הכנסות" },
  { id: "expense", label: "הוצאות" },
  { id: "customers", label: "לקוחות" },
  { id: "products", label: "מוצרים" },
  { id: "orders", label: "הזמנות" },
  { id: "inventory", label: "מלאי" },
  { id: "deliveries", label: "משלוחים" },
  { id: "sync", label: "סנכרון" },
];

export function AppShell() {
  const [tab, setTab] = useState<TabId>("home");
  const [inventoryFocusProductId, setInventoryFocusProductId] = useState<string | null>(null);
  const [deliveryFocusOrderId, setDeliveryFocusOrderId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pendingDirtyLoad, setPendingDirtyLoad] = useState(false);
  const [banner, setBanner] = useState("");
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const store = useKupaStore();
  const cloudHydrated = useKupaStore((s) => s.cloudHydrated);

  useEffect(() => {
    const finish = () => setReady(true);
    const unsub = useKupaStore.persist.onFinishHydration(finish);
    if (useKupaStore.persist.hasHydrated()) finish();
    return unsub;
  }, []);

  useAccountCloudSync(ready, {
    onBanner: setBanner,
    onDirtyCloudNewer: () => setPendingDirtyLoad(true),
    onAuthRequired: () => {
      window.location.href = "/login";
    },
  });

  const incomeTotal = useMemo(() => sumAmounts(store.incomes), [store.incomes]);
  const expenseTotal = useMemo(() => sumAmounts(store.expenses), [store.expenses]);
  const balance = incomeTotal - expenseTotal;

  if (!ready || !cloudHydrated) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-[var(--bg)] px-6 text-center text-[var(--ink)]"
        data-testid="acct-ws-cloud-loading"
      >
        <p className="font-[family-name:var(--font-display)] text-xl font-semibold">טוען נתונים מהענן…</p>
        <p className="text-sm text-[var(--muted)]">הנתונים מסונכרנים לחשבון המחובר</p>
      </div>
    );
  }

  function selectTab(next: TabId) {
    if (next !== "inventory") setInventoryFocusProductId(null);
    if (next !== "deliveries") setDeliveryFocusOrderId(null);
    setTab(next);
  }

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-[var(--bg)] text-[var(--ink)] md:max-w-[var(--kupa-shell-max,72rem)]"
      data-testid="kupa-app-root"
    >
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/95 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur md:px-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[var(--accent)]">
              KUPA MANAGER
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight md:text-3xl">
              ניהול הכנסות והוצאות
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)] md:hidden">ממשק מאובטח · מסונכרן לחשבון</p>
            <p className="mt-1 hidden text-sm text-[var(--muted)] md:block">
              ממשק שולחני ונייד · אותו חשבון בכל מכשיר
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start">
            <button
              type="button"
              className="mt-1 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]"
              data-testid="open-customization-center"
              onClick={() => setCustomizationOpen(true)}
            >
              התאמת ממשק
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]"
              data-testid="open-install-from-header"
              onClick={() => selectTab("sync")}
            >
              התקנת האפליקציה
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]"
              onClick={() => {
                void clearKupaServiceWorkerCaches().finally(() => {
                  void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                    window.location.href = "/login";
                  });
                });
              }}
            >
              יציאה
            </button>
          </div>
        </div>
        <nav className="kupa-desktop-nav mt-3" aria-label="ניווט שולחני" data-testid="desktop-nav">
          <div className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
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
      </header>

      <CustomizationCenter open={customizationOpen} onClose={() => setCustomizationOpen(false)} />

      <main className="kupa-main-pad flex-1 px-4 pb-28 pt-4 md:px-8" data-testid="kupa-main">
        {pendingDirtyLoad ? (
          <div
            className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm"
            data-testid="acct-ws-migration-conflict"
          >
            <p className="font-medium text-amber-950">
              קיימת גרסה חדשה בענן ושינויים מקומיים שטרם נשמרו.
            </p>
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
                    setPendingDirtyLoad(false);
                    const result = await applyCloudLoad(true);
                    if (!result.ok && result.status === 401) {
                      window.location.href = "/login";
                      return;
                    }
                    if (!result.ok) {
                      setBanner(result.error || "טעינה נכשלה");
                      return;
                    }
                    if (!result.exists) {
                      setBanner("אין עדיין נתונים בענן לחשבון זה.");
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
          <p
            className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)]"
            data-testid="acct-ws-banner"
          >
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
        {tab === "products" && (
          <ProductsPanel
            onManageInventory={(productId) => {
              setInventoryFocusProductId(productId);
              setTab("inventory");
            }}
          />
        )}
        {tab === "orders" && (
          <OrdersPanel
            onCreateDelivery={(orderId) => {
              setDeliveryFocusOrderId(orderId);
              setTab("deliveries");
            }}
          />
        )}
        {tab === "inventory" && (
          <InventoryPanel
            key={inventoryFocusProductId || "inv-list"}
            initialProductId={inventoryFocusProductId}
          />
        )}
        {tab === "deliveries" && (
          <DeliveriesPanel
            key={deliveryFocusOrderId || "dlv-list"}
            initialOrderId={deliveryFocusOrderId}
          />
        )}
        {tab === "sync" && <SyncView />}
      </main>

      <nav
        className="kupa-mobile-nav no-print fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--line)] bg-[var(--panel)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        data-testid="mobile-nav"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-0.5 px-1 py-2 md:max-w-none">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={`rounded-xl px-1 py-2 text-[0.68rem] font-medium transition ${
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
  const [message, setMessage] = useState("");
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [deviceDiag, setDeviceDiag] = useState("");
  const saving = store.syncStatus === "saving";
  const loading = store.syncStatus === "loading";

  useEffect(() => {
    setDeviceDiag(getOrCreateDeviceId().slice(0, 8));
  }, []);

  async function pushCloud() {
    setMessage("שומר…");
    const result = await saveToCloud();
    if (!result.ok && result.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (result.ok) {
      setMessage("נשמר בענן");
      setConflictOpen(false);
      return;
    }
    if (result.conflict) {
      setConflictOpen(true);
      setMessage("התנגשות בין מכשירים — הנתונים בענן השתנו ממכשיר אחר.");
      return;
    }
    if (result.status === 0) {
      setMessage(result.error || "אין חיבור — ממתין לסנכרון");
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
    const result = await applyCloudLoad(true);
    if (!result.ok && result.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!result.ok) {
      setMessage(result.error || "טעינה נכשלה — הנתונים המקומיים נשמרו");
      return;
    }
    if (!result.exists) {
      setMessage("אין עדיין נתונים בענן לחשבון זה.");
      return;
    }
    setConflictOpen(false);
    setMessage("טעינה הצליחה");
  }

  async function refreshStatus() {
    setMessage("מרענן מצב…");
    const result = await applyCloudLoad(!store.dirty);
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
      setMessage("אין עדיין נתונים בענן לחשבון זה.");
      return;
    }
    setMessage("מצב עודכן מהענן");
  }

  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  return (
    <div className="space-y-4" data-testid="acct-ws-sync-view">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">סנכרון בין מכשירים</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]" data-testid="acct-ws-account-bound-msg">
          הנתונים נשמרים בחשבון שלך ומופיעים בכל מכשיר שבו התחברת.
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          אין צורך בקוד סביבת עבודה. המאגר הוא חשבון הענן הקנוני — לא לפי מכשיר או דפדפן.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">מצב חיבור</dt>
            <dd className="font-semibold">{online ? "מחובר" : "לא מחובר"}</dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">מצב סנכרון</dt>
            <dd className="font-semibold" data-testid="acct-ws-sync-status">
              {syncStatusLabel(store.syncStatus, store.dirty)}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">שמירה אחרונה בענן</dt>
            <dd className="font-semibold text-xs break-all" data-testid="acct-ws-cloud-updated">
              {store.cloudUpdatedAt || "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">revision נוכחי</dt>
            <dd className="font-semibold" data-testid="acct-ws-revision">
              {store.cloudRevision || 0}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 col-span-2">
            <dt className="text-xs text-[var(--muted)]">מזהה מכשיר (אבחון בלבד)</dt>
            <dd className="font-mono text-xs" data-testid="acct-ws-device-diag" dir="ltr">
              {deviceDiag || "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void pushCloud()}
            className="rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white disabled:opacity-50"
            data-testid="acct-ws-manual-save"
          >
            שמור לענן
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void pullCloud(false)}
            className="rounded-xl border border-[var(--line)] bg-white py-3 text-sm font-semibold disabled:opacity-50"
            data-testid="acct-ws-manual-load"
          >
            טען מהענן
          </button>
        </div>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void refreshStatus()}
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white py-2 text-sm font-semibold disabled:opacity-50"
          data-testid="acct-ws-refresh-status"
        >
          רענן מצב
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

        {conflictOpen || store.syncStatus === "conflict" ? (
          <div
            className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm"
            data-testid="acct-ws-conflict"
          >
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
        {store.pendingSync ? (
          <p className="mt-2 text-xs font-semibold text-amber-800" data-testid="acct-ws-pending-sync">
            השינוי ממתין לסנכרון
          </p>
        ) : null}
        <p className="mt-3 text-xs text-[var(--muted)]">עודכן מקומית: {store.updatedAt || "—"}</p>
        {store.dirty ? (
          <p className="mt-1 text-xs font-semibold text-amber-800">יש שינויים שלא נשמרו</p>
        ) : null}
      </section>

      <InstallAppPanel />
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
