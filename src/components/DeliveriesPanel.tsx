"use client";

import { useMemo, useRef, useState } from "react";
import { formatMoney, useKupaStore } from "@/lib/store";
import { paymentTypeLabel } from "@/lib/orders";
import {
  customerDisplayName,
  DELIVERY_AREAS,
  deliveryAreaLabelHe,
  deliveryStatusLabel,
  deliverySummary,
  filterDeliveries,
  formatFullDeliveryAddress,
  formatProductsSummary,
  formatScheduledDateDisplay,
  hasAnyDeliveryForOrder,
  todayISODate,
  type DeliveryFilterArea,
  type DeliveryFilterDate,
  type DeliveryFilterStatus,
} from "@/lib/deliveries";
import type { Delivery, DeliveryArea, DeliveryStatus, Order } from "@/lib/types";

type Mode = "list" | "form" | "view";

type FormState = {
  orderId: string;
  scheduledDate: string;
  deliveryAreaSnapshot: DeliveryArea;
  deliveryNotes: string;
  status: DeliveryStatus;
};

function emptyForm(orderId = ""): FormState {
  return {
    orderId,
    scheduledDate: "",
    deliveryAreaSnapshot: "unassigned",
    deliveryNotes: "",
    status: "pending",
  };
}

function formFromDelivery(d: Delivery): FormState {
  return {
    orderId: d.orderId,
    scheduledDate: d.scheduledDate || "",
    deliveryAreaSnapshot: d.deliveryAreaSnapshot,
    deliveryNotes: d.deliveryNotes || "",
    status: d.status === "cancelled" ? "cancelled" : d.status,
  };
}

function formFromOrderId(orderId: string): FormState {
  const order = (useKupaStore.getState().orders || []).find((o) => o.id === orderId);
  return {
    ...emptyForm(orderId),
    deliveryAreaSnapshot: order?.deliveryAreaSnapshot || "unassigned",
    deliveryNotes: order?.deliveryAddressSnapshot?.deliveryNotes || "",
  };
}

export function DeliveriesPanel({ initialOrderId }: { initialOrderId?: string | null }) {
  const store = useKupaStore();
  const [mode, setMode] = useState<Mode>(initialOrderId ? "form" : "list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewDelivery, setViewDelivery] = useState<Delivery | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    initialOrderId ? formFromOrderId(initialOrderId) : emptyForm()
  );
  const [formDirty, setFormDirty] = useState(Boolean(initialOrderId));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState<DeliveryFilterArea>("all");
  const [statusFilter, setStatusFilter] = useState<DeliveryFilterStatus>("all");
  const [dateMode, setDateMode] = useState<DeliveryFilterDate>("all");
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmExit, setConfirmExit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const pendingLeaveRef = useRef<(() => void) | null>(null);

  const eligibleOrders = useMemo(() => {
    const deliveries = store.deliveries || [];
    return (store.orders || []).filter(
      (o) => o.status === "confirmed" && !hasAnyDeliveryForOrder(deliveries, o.id)
    );
  }, [store.orders, store.deliveries]);

  const filtered = useMemo(
    () =>
      filterDeliveries(store.deliveries || [], {
        query,
        area: areaFilter,
        status: statusFilter,
        dateMode,
        selectedDate,
      }),
    [store.deliveries, query, areaFilter, statusFilter, dateMode, selectedDate]
  );

  const summary = useMemo(() => deliverySummary(store.deliveries || []), [store.deliveries]);

  const selectedOrderPreview: Order | undefined = useMemo(
    () => (store.orders || []).find((o) => o.id === form.orderId),
    [store.orders, form.orderId]
  );

  function patchForm(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
    setFormDirty(true);
  }

  function requestLeaveForm(next: () => void) {
    if (formDirty) {
      pendingLeaveRef.current = next;
      setConfirmExit(true);
      return;
    }
    next();
  }

  function confirmLeave() {
    const pending = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    setConfirmExit(false);
    setFormDirty(false);
    pending?.();
  }

  function openCreate() {
    requestLeaveForm(() => {
      setMode("form");
      setEditingId(null);
      setViewDelivery(null);
      setForm(emptyForm());
      setFormDirty(false);
      setError("");
      setMessage("");
      setShowCancel(false);
      setConfirmRefresh(false);
    });
  }

  function openEdit(d: Delivery) {
    if (d.status === "cancelled") {
      setViewDelivery(d);
      setMode("view");
      setEditingId(null);
      setError("");
      return;
    }
    requestLeaveForm(() => {
      setMode("form");
      setEditingId(d.id);
      setViewDelivery(null);
      setForm(formFromDelivery(d));
      setFormDirty(false);
      setError("");
      setMessage("");
      setShowCancel(false);
      setConfirmRefresh(false);
    });
  }

  function openView(d: Delivery) {
    requestLeaveForm(() => {
      setViewDelivery(d);
      setMode("view");
      setEditingId(null);
      setFormDirty(false);
      setError("");
      setShowCancel(false);
      setConfirmRefresh(false);
    });
  }

  function backToList() {
    requestLeaveForm(() => {
      setMode("list");
      setEditingId(null);
      setViewDelivery(null);
      setForm(emptyForm());
      setFormDirty(false);
      setError("");
      setShowCancel(false);
      setConfirmRefresh(false);
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onPickOrder(orderId: string) {
    const order = (store.orders || []).find((o) => o.id === orderId);
    patchForm({
      orderId,
      deliveryAreaSnapshot: order?.deliveryAreaSnapshot || form.deliveryAreaSnapshot,
      deliveryNotes: order?.deliveryAddressSnapshot?.deliveryNotes || form.deliveryNotes,
    });
  }

  function saveForm() {
    setError("");
    if (editingId) {
      const res = store.updateDelivery(editingId, {
        scheduledDate: form.scheduledDate,
        deliveryAreaSnapshot: form.deliveryAreaSnapshot,
        deliveryNotes: form.deliveryNotes,
        status: form.status === "cancelled" ? undefined : form.status,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("משלוח עודכן");
      setFormDirty(false);
      setMode("list");
      setEditingId(null);
      return;
    }
    const res = store.createDelivery({
      orderId: form.orderId,
      scheduledDate: form.scheduledDate,
      deliveryAreaSnapshot: form.deliveryAreaSnapshot,
      deliveryNotes: form.deliveryNotes,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessage("משלוח נוצר");
    setFormDirty(false);
    setMode("list");
    setEditingId(null);
  }

  function doCancel() {
    const id = editingId || viewDelivery?.id;
    if (!id) return;
    const res = store.cancelDelivery(id, cancelReason);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setShowCancel(false);
    setCancelReason("");
    setMessage("משלוח בוטל");
    setFormDirty(false);
    setMode("list");
    setEditingId(null);
    setViewDelivery(null);
  }

  function doRefresh() {
    const id = editingId || viewDelivery?.id;
    if (!id) return;
    const res = store.refreshDeliverySnapshot(id);
    if (!res.ok) {
      setError(res.error);
      setConfirmRefresh(false);
      return;
    }
    setConfirmRefresh(false);
    setMessage("פרטי ההזמנה רועננו למשלוח");
    if (mode === "form") {
      setForm(formFromDelivery(res.delivery));
      setFormDirty(false);
    } else {
      setViewDelivery(res.delivery);
    }
  }

  if (mode === "form") {
    const existing = editingId
      ? (store.deliveries || []).find((d) => d.id === editingId)
      : undefined;
    const readOnlyCancelled = existing?.status === "cancelled";
    const snapshotSource = existing || undefined;
    const previewItems = snapshotSource?.itemsSnapshot;
    const previewCustomer = snapshotSource?.customerSnapshot || selectedOrderPreview?.customerSnapshot;
    const previewAddress =
      snapshotSource?.addressSnapshot || selectedOrderPreview?.deliveryAddressSnapshot;
    const previewTotal =
      snapshotSource?.orderTotalSnapshot ?? selectedOrderPreview?.totalAmount ?? 0;
    const products = previewItems ? formatProductsSummary(previewItems, { maxLines: 4 }) : null;

    return (
      <div
        className="space-y-3 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom))]"
        data-testid="dlv-form"
      >
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            {editingId ? "עריכת משלוח" : "משלוח חדש"}
          </h2>
          {existing ? (
            <p className="mt-1 text-sm text-[var(--muted)]" dir="ltr">
              {existing.deliveryNumber}
            </p>
          ) : null}

          {!editingId ? (
            <label className="mt-3 block text-sm font-medium">
              הזמנה מאושרת
              <select
                data-testid="dlv-order-select"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
                value={form.orderId}
                onChange={(e) => onPickOrder(e.target.value)}
              >
                <option value="">בחירת הזמנה…</option>
                {eligibleOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} —{" "}
                    {o.customerSnapshot.businessName || o.customerSnapshot.customerName || "לקוח"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-3 text-sm">
              הזמנה: <span dir="ltr">{existing?.orderNumberSnapshot || "—"}</span>
            </p>
          )}

          <label className="mt-3 block text-sm font-medium">
            תאריך משלוח
            <input
              data-testid="dlv-scheduled-date"
              type="date"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
              value={form.scheduledDate}
              disabled={readOnlyCancelled}
              onChange={(e) => patchForm({ scheduledDate: e.target.value })}
            />
          </label>

          <label className="mt-3 block text-sm font-medium">
            אזור משלוח
            <select
              data-testid="dlv-area"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
              value={form.deliveryAreaSnapshot}
              disabled={readOnlyCancelled}
              onChange={(e) => patchForm({ deliveryAreaSnapshot: e.target.value as DeliveryArea })}
            >
              {DELIVERY_AREAS.map((a) => (
                <option key={a} value={a}>
                  {deliveryAreaLabelHe[a]}
                </option>
              ))}
            </select>
          </label>

          {editingId && !readOnlyCancelled ? (
            <label className="mt-3 block text-sm font-medium">
              סטטוס
              <select
                data-testid="dlv-status"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
                value={form.status}
                onChange={(e) => patchForm({ status: e.target.value as DeliveryStatus })}
              >
                <option value="pending">{deliveryStatusLabel.pending}</option>
                <option value="ready">{deliveryStatusLabel.ready}</option>
              </select>
            </label>
          ) : null}

          <label className="mt-3 block text-sm font-medium">
            הערות משלוח
            <textarea
              data-testid="dlv-notes"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
              rows={3}
              value={form.deliveryNotes}
              disabled={readOnlyCancelled}
              onChange={(e) => patchForm({ deliveryNotes: e.target.value })}
            />
          </label>

          {(previewCustomer || previewAddress || products) && (
            <div className="mt-4 space-y-2 rounded-xl bg-black/5 p-3 text-sm">
              {previewCustomer ? (
                <>
                  <p className="font-semibold">{customerDisplayName(previewCustomer)}</p>
                  <p className="text-[var(--muted)]" dir="ltr">
                    {previewCustomer.phone || "—"}
                  </p>
                </>
              ) : null}
              {previewAddress ? (
                <p className="text-[var(--muted)]">{formatFullDeliveryAddress(previewAddress)}</p>
              ) : null}
              {products ? (
                <div>
                  {products.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {products.moreCount > 0 ? (
                    <p className="text-[var(--muted)]">+{products.moreCount} נוספים</p>
                  ) : null}
                </div>
              ) : null}
              <p className="font-semibold">
                סה״כ לתשלום במזומן: {formatMoney(previewTotal)} ({paymentTypeLabel.cashOnDelivery})
              </p>
            </div>
          )}

          {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl border py-3" onClick={backToList}>
              חזרה
            </button>
            {!readOnlyCancelled ? (
              <button
                type="button"
                data-testid="dlv-save"
                className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-white"
                onClick={saveForm}
              >
                שמירה
              </button>
            ) : (
              <button type="button" className="rounded-xl border py-3 opacity-50" disabled>
                לקריאה בלבד
              </button>
            )}
          </div>

          {editingId && !readOnlyCancelled ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="dlv-refresh"
                className="rounded-xl border py-3 text-sm font-semibold"
                onClick={() => setConfirmRefresh(true)}
              >
                רענון מהזמנה
              </button>
              <button
                type="button"
                data-testid="dlv-cancel-btn"
                className="rounded-xl border py-3 text-sm font-semibold text-rose-700"
                onClick={() => {
                  setShowCancel(true);
                  setCancelReason("");
                }}
              >
                ביטול משלוח
              </button>
            </div>
          ) : null}
        </div>

        {confirmExit ? (
          <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">יש שינויים שלא נשמרו. לצאת בכל זאת?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={() => setConfirmExit(false)}>
                הישאר
              </button>
              <button type="button" className="rounded-xl bg-[var(--accent)] py-3 text-white" onClick={confirmLeave}>
                צא
              </button>
            </div>
          </div>
        ) : null}

        {confirmRefresh ? (
          <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">
              לרענן את פרטי הלקוח, הכתובת והמוצרים מההזמנה הנוכחית? תאריך, אזור והערות המשלוח יישארו.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={() => setConfirmRefresh(false)}>
                ביטול
              </button>
              <button type="button" className="rounded-xl bg-[var(--accent)] py-3 text-white" onClick={doRefresh}>
                רענון
              </button>
            </div>
          </div>
        ) : null}

        {showCancel ? (
          <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">סיבת ביטול משלוח</p>
            <input
              data-testid="dlv-cancel-reason"
              className="mt-2 w-full rounded-xl border px-3 py-3"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="לפחות 3 תווים"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={() => setShowCancel(false)}>
                חזרה
              </button>
              <button type="button" className="rounded-xl bg-rose-700 py-3 text-white" onClick={doCancel}>
                אישור ביטול
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (mode === "view" && viewDelivery) {
    const d =
      (store.deliveries || []).find((x) => x.id === viewDelivery.id) || viewDelivery;
    const products = formatProductsSummary(d.itemsSnapshot || [], { maxLines: 8 });
    const cancelled = d.status === "cancelled";

    return (
      <div
        className="space-y-3 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom))]"
        data-testid="dlv-view"
      >
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold" dir="ltr">
            {d.deliveryNumber}
          </h2>
          <p className="mt-1 text-sm">{deliveryStatusLabel[d.status]}</p>
          <p className="mt-2 text-sm" dir="ltr">
            הזמנה: {d.orderNumberSnapshot || "—"}
          </p>
          <p className="mt-2 font-semibold">{customerDisplayName(d.customerSnapshot)}</p>
          <p className="text-sm" dir="ltr">
            {d.customerSnapshot.phone || "—"}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {formatFullDeliveryAddress(d.addressSnapshot)}
          </p>
          <p className="mt-1 text-sm">אזור: {deliveryAreaLabelHe[d.deliveryAreaSnapshot]}</p>
          <p className="mt-1 text-sm">תאריך: {formatScheduledDateDisplay(d.scheduledDate)}</p>
          <p className="mt-1 text-sm">{paymentTypeLabel.cashOnDelivery}</p>
          <ul className="mt-3 space-y-2">
            {products.lines.map((line) => (
              <li key={line} className="rounded-xl border bg-white px-3 py-2 text-sm">
                {line}
              </li>
            ))}
          </ul>
          {products.moreCount > 0 ? (
            <p className="mt-1 text-xs text-[var(--muted)]">+{products.moreCount} פריטים נוספים</p>
          ) : null}
          <p className="mt-3 text-lg font-semibold">
            סה״כ: {formatMoney(d.orderTotalSnapshot)}
          </p>
          {d.deliveryNotes ? <p className="mt-2 text-sm">הערות: {d.deliveryNotes}</p> : null}
          {cancelled && d.cancellationReason ? (
            <p className="mt-2 text-sm text-rose-700">סיבת ביטול: {d.cancellationReason}</p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl border py-3" onClick={backToList}>
              חזרה
            </button>
            {!cancelled ? (
              <button
                type="button"
                className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-white"
                onClick={() => openEdit(d)}
              >
                עריכה
              </button>
            ) : (
              <button type="button" className="rounded-xl border py-3 opacity-50" disabled>
                לקריאה בלבד
              </button>
            )}
          </div>

          {!cancelled ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="dlv-refresh"
                className="rounded-xl border py-3 text-sm font-semibold"
                onClick={() => setConfirmRefresh(true)}
              >
                רענון מהזמנה
              </button>
              <button
                type="button"
                data-testid="dlv-cancel-btn"
                className="rounded-xl border py-3 text-sm font-semibold text-rose-700"
                onClick={() => {
                  setShowCancel(true);
                  setCancelReason("");
                }}
              >
                ביטול משלוח
              </button>
            </div>
          ) : null}
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        </div>

        {confirmRefresh ? (
          <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">
              לרענן את פרטי הלקוח, הכתובת והמוצרים מההזמנה הנוכחית?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={() => setConfirmRefresh(false)}>
                ביטול
              </button>
              <button type="button" className="rounded-xl bg-[var(--accent)] py-3 text-white" onClick={doRefresh}>
                רענון
              </button>
            </div>
          </div>
        ) : null}

        {showCancel ? (
          <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">סיבת ביטול משלוח</p>
            <input
              data-testid="dlv-cancel-reason"
              className="mt-2 w-full rounded-xl border px-3 py-3"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="לפחות 3 תווים"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={() => setShowCancel(false)}>
                חזרה
              </button>
              <button type="button" className="rounded-xl bg-rose-700 py-3 text-white" onClick={doCancel}>
                אישור ביטול
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="space-y-3 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom))]"
      data-testid="dlv-list"
    >
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">משלוחים</h2>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
          >
            משלוח חדש
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm" data-testid="dlv-summary">
          <div className="rounded-xl border bg-white px-3 py-2">פעילים: {summary.activeCount}</div>
          <div className="rounded-xl border bg-white px-3 py-2">ממתינים: {summary.pending}</div>
          <div className="rounded-xl border bg-white px-3 py-2">מוכנים: {summary.ready}</div>
          <div className="rounded-xl border bg-white px-3 py-2">
            סה״כ: {formatMoney(summary.totalAmount)}
          </div>
          <div className="rounded-xl border bg-white px-3 py-2">מרכז: {summary.center}</div>
          <div className="rounded-xl border bg-white px-3 py-2">צפון: {summary.north}</div>
          <div className="rounded-xl border bg-white px-3 py-2">דרום: {summary.south}</div>
          <div className="rounded-xl border bg-white px-3 py-2">לא הוגדר: {summary.unassigned}</div>
        </div>

        <input
          data-testid="dlv-search"
          className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
          placeholder="חיפוש: מספר, לקוח, טלפון, עיר, מוצר…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          data-testid="dlv-filter-area"
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value as DeliveryFilterArea)}
        >
          <option value="all">כל האזורים</option>
          {DELIVERY_AREAS.map((a) => (
            <option key={a} value={a}>
              {deliveryAreaLabelHe[a]}
            </option>
          ))}
        </select>
        <select
          data-testid="dlv-filter-status"
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeliveryFilterStatus)}
        >
          <option value="all">כל הסטטוסים</option>
          <option value="pending">{deliveryStatusLabel.pending}</option>
          <option value="ready">{deliveryStatusLabel.ready}</option>
          <option value="cancelled">{deliveryStatusLabel.cancelled}</option>
        </select>
        <select
          data-testid="dlv-filter-date"
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
          value={dateMode}
          onChange={(e) => setDateMode(e.target.value as DeliveryFilterDate)}
        >
          <option value="all">כל התאריכים</option>
          <option value="today">היום</option>
          <option value="none">ללא תאריך</option>
          <option value="selected">תאריך נבחר</option>
        </select>
        {dateMode === "selected" ? (
          <input
            data-testid="dlv-date-picker"
            type="date"
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        ) : null}
      </div>

      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          אין משלוחים להצגה
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((d) => {
            const products = formatProductsSummary(d.itemsSnapshot || [], { maxLines: 2 });
            return (
              <li
                key={d.id}
                data-testid="dlv-card"
                className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3"
              >
                <div className="flex items-start gap-3">
                  <label className="mt-1 shrink-0">
                    <input
                      data-testid="dlv-select"
                      type="checkbox"
                      checked={selectedIds.has(d.id)}
                      onChange={() => toggleSelect(d.id)}
                      className="h-5 w-5 accent-[var(--accent)]"
                      aria-label="בחירה מקומית"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--muted)]" dir="ltr">
                          {d.deliveryNumber}
                        </p>
                        <p className="font-semibold">{customerDisplayName(d.customerSnapshot)}</p>
                        <p className="text-sm text-[var(--muted)]" dir="ltr">
                          {d.customerSnapshot.phone || "—"}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {deliveryAreaLabelHe[d.deliveryAreaSnapshot]} ·{" "}
                          {formatScheduledDateDisplay(d.scheduledDate)} ·{" "}
                          {deliveryStatusLabel[d.status]}
                        </p>
                        <p className="text-xs text-[var(--muted)]" dir="ltr">
                          הזמנה {d.orderNumberSnapshot || "—"}
                        </p>
                        {products.lines.map((line) => (
                          <p key={line} className="text-xs text-[var(--muted)]">
                            {line}
                          </p>
                        ))}
                        {products.moreCount > 0 ? (
                          <p className="text-xs text-[var(--muted)]">+{products.moreCount}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-left">
                        <p className="font-semibold">{formatMoney(d.orderTotalSnapshot)}</p>
                        <button
                          type="button"
                          className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                          onClick={() => openView(d)}
                        >
                          צפייה
                        </button>
                        {d.status !== "cancelled" ? (
                          <button
                            type="button"
                            className="mt-1 block w-full rounded-lg border px-3 py-2 text-xs font-semibold"
                            onClick={() => openEdit(d)}
                          >
                            עריכה
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedIds.size > 0 ? (
        <p className="text-xs text-[var(--muted)]">נבחרו מקומית: {selectedIds.size} (לא נשמר בענן)</p>
      ) : null}
    </div>
  );
}
