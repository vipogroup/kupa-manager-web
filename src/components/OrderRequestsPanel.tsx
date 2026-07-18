"use client";

import { useEffect, useMemo, useState } from "react";
import { useKupaStore, formatMoney } from "@/lib/store";
import { findCustomerMatches, type CustomerOrderRequest } from "@/lib/customer-order-requests";

type Filter = "all" | "New" | "UnderReview" | "Approved" | "Rejected";

export function OrderRequestsPanel() {
  const store = useKupaStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const requests = useMemo(() => {
    const raw = (store as unknown as { customerOrderRequests?: CustomerOrderRequest[] }).customerOrderRequests;
    return Array.isArray(raw) ? raw : [];
  }, [store]);

  const filtered = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const selected = requests.find((r) => r.id === selectedId) || null;
  const newCount = requests.filter((r) => r.status === "New").length;

  useEffect(() => {
    void fetch("/api/auth/public-form-link", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        if (j.url) setFormUrl(j.url);
      })
      .catch(() => {});
  }, []);

  async function reloadCloud() {
    const { applyCloudLoad } = await import("@/lib/sync-client");
    await applyCloudLoad(true);
  }

  async function runAction(actionType: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Ensure we have fresh revision/etag
      await reloadCloud();
      const rev = useKupaStore.getState().cloudRevision || 0;
      const res = await fetch("/api/desktop/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          actionType,
          payload,
          expectedRevision: rev,
          expectedETag: "",
          idempotencyKey: crypto.randomUUID().replace(/-/g, ""),
          deviceId: "web-admin-cor",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || j.message || "הפעולה נכשלה");
        if (res.status === 409) setError("הנתונים השתנו במכשיר אחר — רעננו ונסו שוב");
        return;
      }
      setMessage("בוצע בהצלחה");
      await reloadCloud();
    } catch {
      setError("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }

  const matches = selected
    ? findCustomerMatches(
        {
          customers: store.customers,
          products: store.products,
          orders: store.orders,
          incomes: store.incomes,
          expenses: store.expenses,
          inventoryMovements: store.inventoryMovements,
          deliveries: store.deliveries,
          version: 1,
          updatedAt: store.updatedAt,
        },
        selected.customerInput.phone,
        selected.customerInput.email
      )
    : [];

  return (
    <div className="space-y-4" data-testid="order-requests-panel">
      <section className="rounded-2xl border bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">בקשות הזמנה מלקוחות</h2>
          {newCount > 0 ? (
            <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white">{newCount} חדשות</span>
          ) : null}
        </div>
        {formUrl ? (
          <div className="mt-3 rounded-xl border bg-white p-3 text-sm">
            <p className="text-xs text-[var(--muted)]">קישור לטופס ציבורי (לשליחה ללקוח)</p>
            <p className="mt-1 break-all font-mono text-xs" dir="ltr">
              {formUrl}
            </p>
            <button
              type="button"
              className="mt-2 rounded-lg border px-3 py-2 text-xs"
              onClick={() => void navigator.clipboard.writeText(formUrl)}
            >
              העתק קישור
            </button>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "New", "UnderReview", "Approved", "Rejected"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "bg-[var(--accent)] text-white" : ""}`}
            >
              {f === "all" ? "הכל" : f}
            </button>
          ))}
          <button type="button" className="rounded-full border px-3 py-1 text-xs" onClick={() => void reloadCloud()} disabled={busy}>
            רענון
          </button>
        </div>
      </section>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {!selected ? (
        <ul className="space-y-2">
          {filtered.length === 0 ? (
            <li className="rounded-2xl border p-6 text-center text-sm text-[var(--muted)]">אין בקשות להצגה</li>
          ) : (
            filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full rounded-2xl border bg-white p-4 text-right"
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{r.customerInput.fullName}</span>
                    <span className="text-xs">{r.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]" dir="ltr">
                    {r.requestNumber} · {r.customerInput.phone}
                  </p>
                  <p className="text-sm">
                    {r.addressInput.city} · {r.requestedItems?.length || 0} פריטים · {formatMoney(r.totalSnapshot || 0)}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : (
        <section className="space-y-3 rounded-2xl border bg-white p-4">
          <button type="button" className="text-sm" onClick={() => setSelectedId(null)}>
            ← חזרה לרשימה
          </button>
          <h3 className="text-lg font-semibold">
            {selected.requestNumber} · {selected.status}
          </h3>
          <p>
            {selected.customerInput.fullName} · <span dir="ltr">{selected.customerInput.phone}</span>
          </p>
          <p className="text-sm">
            {selected.addressInput.city}, {selected.addressInput.street} {selected.addressInput.houseNumber}
          </p>
          <ul className="space-y-1 text-sm">
            {selected.requestedItems?.map((it, i) => (
              <li key={i}>
                {it.productName} × {it.quantity} = {formatMoney(it.lineTotalSnapshot)}
              </li>
            ))}
          </ul>
          <p className="font-semibold">סה״כ משוער: {formatMoney(selected.totalSnapshot || 0)}</p>
          <p className="text-sm">תשלום מבוקש: {selected.requestedPaymentMethod}</p>
          <p className="text-sm">גבייה מבוקשת: {formatMoney(selected.cashCollectionRequested || 0)}</p>
          {selected.customerNotes ? <p className="text-sm">הערות: {selected.customerNotes}</p> : null}
          {matches.length > 0 ? (
            <p className="rounded-xl bg-amber-50 p-2 text-sm">התאמות לקוח: {matches.length}</p>
          ) : (
            <p className="text-sm text-[var(--muted)]">לא נמצא לקוח קיים — ייווצר לקוח חדש באישור</p>
          )}
          {selected.status === "Approved" ? (
            <p className="text-sm text-emerald-700">
              נוצרה הזמנה: {selected.createdOrderId || "—"} · משלוח: {selected.createdDeliveryId || "—"}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-2 pt-2">
            {selected.status === "New" || selected.status === "UnderReview" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border py-3"
                  onClick={() => void runAction("startReviewCustomerOrderRequest", { id: selected.id })}
                >
                  התחל סקירה
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl bg-[var(--accent)] py-3 text-white"
                  onClick={() =>
                    void runAction("approveCustomerOrderRequest", {
                      id: selected.id,
                      forceNewCustomer: matches.length === 0,
                      selectedCustomerId: matches.length === 1 ? matches[0].id : undefined,
                      createDelivery: true,
                    })
                  }
                >
                  אישור ויצירת הזמנה
                </button>
                <input
                  className="rounded-xl border px-3 py-3 text-sm"
                  placeholder="סיבת דחייה"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-rose-300 py-3 text-rose-700"
                  onClick={() =>
                    void runAction("rejectCustomerOrderRequest", { id: selected.id, reason: rejectReason })
                  }
                >
                  דחייה
                </button>
              </>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
