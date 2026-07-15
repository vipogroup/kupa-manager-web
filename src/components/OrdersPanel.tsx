"use client";

import { useMemo, useState } from "react";
import { useKupaStore, formatMoney } from "@/lib/store";
import {
  addressFromCustomer,
  buildCopiedOrderDraft,
  buildOrderItemFromProduct,
  calcLineTotal,
  calcOrderGrandTotal,
  calcOrderItemsSubtotal,
  findDuplicateProductLine,
  formatAddressText,
  orderStatusLabel,
  parseShippingFee,
  paymentTypeLabel,
  sanitizeShippingFee,
  snapshotFromCustomer,
  validateOrderDraft,
  type OrderDraftInput,
} from "@/lib/orders";
import {
  customerTypeLabel,
  deliveryAreaLabel,
  emptyCustomerDraft,
  findPotentialDuplicateCustomers,
  type CustomerInput,
} from "@/lib/entities";
import {
  deliveryStatusLabel,
  findDeliveryForOrder,
  hasAnyDeliveryForOrder,
} from "@/lib/deliveries";
import type { Customer, CustomerType, DeliveryArea, Order, OrderItem, Product } from "@/lib/types";

type Filter =
  | "all"
  | "draft"
  | "confirmed"
  | "cancelled"
  | "center"
  | "north"
  | "south"
  | "unassigned";

type Mode = "list" | "form" | "view";

function emptyDraft(): OrderDraftInput {
  return {
    customerId: "",
    customerSnapshot: snapshotFromCustomer({
      id: "",
      customerNumber: "",
      customerType: "private",
      name: "",
      businessName: "",
      phone: "",
      secondaryPhone: "",
      email: "",
      street: "",
      houseNumber: "",
      entrance: "",
      floor: "",
      apartment: "",
      city: "",
      zipCode: "",
      deliveryArea: "unassigned",
      deliveryNotes: "",
      notes: "",
      active: true,
      createdAt: "",
      updatedAt: "",
    }),
    deliveryAreaSnapshot: "unassigned",
    deliveryAddressSnapshot: addressFromCustomer({
      id: "",
      customerNumber: "",
      customerType: "private",
      name: "",
      businessName: "",
      phone: "",
      secondaryPhone: "",
      email: "",
      street: "",
      houseNumber: "",
      entrance: "",
      floor: "",
      apartment: "",
      city: "",
      zipCode: "",
      deliveryArea: "unassigned",
      deliveryNotes: "",
      notes: "",
      active: true,
      createdAt: "",
      updatedAt: "",
    }),
    items: [],
    shippingFee: 0,
    orderNotes: "",
    paymentType: "cashOnDelivery",
  };
}

export function OrdersPanel({ onCreateDelivery }: { onCreateDelivery?: (orderId: string) => void }) {
  const store = useKupaStore();
  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OrderDraftInput>(emptyDraft());
  const [formDirty, setFormDirty] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [customerQuery, setCustomerQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [dupProduct, setDupProduct] = useState<OrderItem | null>(null);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmEditConfirmed, setConfirmEditConfirmed] = useState(false);
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [customerPickMode, setCustomerPickMode] = useState<"existing" | "new">("existing");
  const [customerDraft, setCustomerDraft] = useState<CustomerInput>(emptyCustomerDraft());
  const [customerMoreOpen, setCustomerMoreOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [dupCustomers, setDupCustomers] = useState<Customer[]>([]);
  const [dupMatchKind, setDupMatchKind] = useState<"phone" | "identity" | null>(null);
  const [pendingDupConfirm, setPendingDupConfirm] = useState(false);

  const activeCustomers = useMemo(
    () => store.customers.filter((c) => c.active),
    [store.customers]
  );
  const activeProducts = useMemo(() => store.products.filter((p) => p.active), [store.products]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return activeCustomers.slice(0, 20);
    return activeCustomers
      .filter((c) =>
        [c.name, c.businessName, c.phone, c.customerNumber, c.city].join(" ").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [activeCustomers, customerQuery]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return activeProducts.slice(0, 20);
    return activeProducts
      .filter((p) =>
        [p.name, p.model, p.sku, p.barcode, p.productNumber].join(" ").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [activeProducts, productQuery]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (store.orders || []).filter((o) => {
      if (filter === "draft" || filter === "confirmed" || filter === "cancelled") {
        if (o.status !== filter) return false;
      }
      if (filter === "center" || filter === "north" || filter === "south" || filter === "unassigned") {
        if (o.deliveryAreaSnapshot !== filter) return false;
      }
      if (!q) return true;
      const productHay = o.items
        .map((it) =>
          [it.productSnapshot.name, it.productSnapshot.model, it.productSnapshot.sku].join(" ")
        )
        .join(" ");
      const hay = [
        o.orderNumber,
        o.customerSnapshot.customerName,
        o.customerSnapshot.businessName,
        o.customerSnapshot.phone,
        o.customerSnapshot.city,
        o.deliveryAddressSnapshot.city,
        productHay,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [store.orders, query, filter]);

  const summary = useMemo(() => {
    const all = store.orders || [];
    const drafts = all.filter((o) => o.status === "draft").length;
    const confirmed = all.filter((o) => o.status === "confirmed");
    const cancelled = all.filter((o) => o.status === "cancelled").length;
    const confirmedSum = confirmed.reduce((a, o) => a + (o.totalAmount || 0), 0);
    return {
      all: all.length,
      drafts,
      confirmed: confirmed.length,
      cancelled,
      confirmedSum,
    };
  }, [store.orders]);

  const itemsSubtotal = calcOrderItemsSubtotal(draft.items);
  const shippingFee = sanitizeShippingFee(draft.shippingFee);
  const total = calcOrderGrandTotal(itemsSubtotal, shippingFee);

  function markFormDirty() {
    setFormDirty(true);
  }

  function selectCustomer(c: Customer) {
    setDraft((d) => ({
      ...d,
      customerId: c.id,
      customerSnapshot: snapshotFromCustomer(c),
      deliveryAreaSnapshot: c.deliveryArea,
      deliveryAddressSnapshot: addressFromCustomer(c),
    }));
    markFormDirty();
  }

  function resetInlineCustomerForm() {
    setCustomerDraft(emptyCustomerDraft());
    setCustomerMoreOpen(false);
    setSavingCustomer(false);
    setDupCustomers([]);
    setDupMatchKind(null);
    setPendingDupConfirm(false);
  }

  function saveCustomerAndContinue(forceDuplicate = false) {
    if (savingCustomer) return;
    setError("");
    setSavingCustomer(true);
    try {
      if (!forceDuplicate) {
        const dups = findPotentialDuplicateCustomers(store.customers, {
          phone: customerDraft.phone,
          name: customerDraft.name,
          businessName: customerDraft.businessName,
        });
        if (dups.all.length > 0) {
          setDupCustomers(dups.all);
          setDupMatchKind(dups.byPhone.length > 0 ? "phone" : "identity");
          setPendingDupConfirm(true);
          return;
        }
      }
      const res = store.createCustomer(customerDraft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      selectCustomer(res.customer);
      resetInlineCustomerForm();
      setCustomerPickMode("existing");
      setError("");
      setMessage("לקוח נשמר ונבחר להזמנה");
      setStep(3);
    } finally {
      setSavingCustomer(false);
    }
  }

  function applyExistingDuplicateCustomer(c: Customer) {
    selectCustomer(c);
    resetInlineCustomerForm();
    setCustomerPickMode("existing");
    setError("");
    setMessage("נבחר לקוח קיים");
    setStep(3);
  }

  function refreshCustomerSnapshot() {
    const c = store.customers.find((x) => x.id === draft.customerId);
    if (!c) {
      setError("לא ניתן לרענן — הלקוח אינו זמין");
      return;
    }
    setDraft((d) => ({
      ...d,
      customerSnapshot: snapshotFromCustomer(c),
      deliveryAreaSnapshot: c.deliveryArea,
      deliveryAddressSnapshot: addressFromCustomer(c),
    }));
    markFormDirty();
    setMessage("פרטי לקוח רועננו להזמנה זו");
  }

  function tryAddProduct(p: Product) {
    const existing = findDuplicateProductLine(draft.items, p.id);
    if (existing) {
      setDupProduct(existing);
      setPendingProduct(p);
      return;
    }
    const item = buildOrderItemFromProduct(p, 1);
    setDraft((d) => ({ ...d, items: [...d.items, item] }));
    markFormDirty();
  }

  function updateQtyOnExisting() {
    if (!dupProduct || !pendingProduct) return;
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) =>
        it.id === dupProduct.id
          ? {
              ...it,
              quantity: it.quantity + 1,
              lineTotal: calcLineTotal(it.quantity + 1, it.unitPrice),
            }
          : it
      ),
    }));
    setDupProduct(null);
    setPendingProduct(null);
    markFormDirty();
  }

  function addAnywayNewLine() {
    if (!pendingProduct) return;
    const item = buildOrderItemFromProduct(pendingProduct, 1);
    setDraft((d) => ({ ...d, items: [...d.items, item] }));
    setDupProduct(null);
    setPendingProduct(null);
    markFormDirty();
  }

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormDirty(false);
    setStep(1);
    setError("");
    setMessage("");
    setMode("form");
    setViewOrder(null);
    setCustomerPickMode("existing");
    resetInlineCustomerForm();
  }

  function openEdit(o: Order) {
    if (o.status === "cancelled") {
      setViewOrder(o);
      setMode("view");
      return;
    }
    if (o.status === "confirmed" && !confirmEditConfirmed) {
      setViewOrder(o);
      setConfirmEditConfirmed(true);
      setMode("view");
      return;
    }
    setEditingId(o.id);
    setDraft({
      customerId: o.customerId,
      customerSnapshot: { ...o.customerSnapshot },
      deliveryAreaSnapshot: o.deliveryAreaSnapshot,
      deliveryAddressSnapshot: { ...o.deliveryAddressSnapshot },
      items: o.items.map((it) => ({ ...it, productSnapshot: { ...it.productSnapshot } })),
      shippingFee: sanitizeShippingFee(o.shippingFee),
      orderNotes: o.orderNotes,
      paymentType: "cashOnDelivery",
    });
    setFormDirty(false);
    setStep(1);
    setError("");
    setMode("form");
    setViewOrder(null);
    setConfirmEditConfirmed(false);
    setCustomerPickMode("existing");
    resetInlineCustomerForm();
  }

  function requestExit() {
    if (formDirty) setConfirmExit(true);
    else {
      setMode("list");
      setEditingId(null);
    }
  }

  function saveDraft() {
    setError("");
    const v = validateOrderDraft(draft);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    // Do not trust client total — store recalculates
    const payload: OrderDraftInput = {
      ...draft,
      items: draft.items.map((it) => ({
        ...it,
        lineTotal: calcLineTotal(it.quantity, it.unitPrice),
      })),
    };
    if (editingId) {
      const existing = store.orders.find((o) => o.id === editingId);
      if (existing?.status === "confirmed" && !window.confirm("ההזמנה מאושרת. לעדכן בכל זאת?")) {
        return;
      }
      const res = store.updateOrder(editingId, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("הזמנה עודכנה");
    } else {
      const res = store.createOrder(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("הזמנה נוצרה");
    }
    setFormDirty(false);
    setMode("list");
    setEditingId(null);
  }

  function renderList() {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">הזמנות</h2>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
            >
              הזמנה חדשה
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border bg-white px-3 py-2">הכול: {summary.all}</div>
            <div className="rounded-xl border bg-white px-3 py-2">טיוטות: {summary.drafts}</div>
            <div className="rounded-xl border bg-white px-3 py-2">מאושרות: {summary.confirmed}</div>
            <div className="rounded-xl border bg-white px-3 py-2">מבוטלות: {summary.cancelled}</div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            סכום מאושרות: {formatMoney(summary.confirmedSum)}
          </p>
          <input
            className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
            placeholder="חיפוש: מספר, לקוח, טלפון, עיר, מוצר…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">הכול</option>
            <option value="draft">טיוטה</option>
            <option value="confirmed">מאושרת</option>
            <option value="cancelled">מבוטלת</option>
            <option value="center">מרכז</option>
            <option value="north">צפון</option>
            <option value="south">דרום</option>
            <option value="unassigned">לא הוגדר</option>
          </select>
        </div>

        {message ? <p className="text-sm text-emerald-800">{message}</p> : null}

        {filteredOrders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            אין הזמנות להצגה
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredOrders.map((o) => {
              const linkedDelivery = findDeliveryForOrder(store.deliveries || [], o.id);
              const canCreateDelivery =
                o.status === "confirmed" &&
                !hasAnyDeliveryForOrder(store.deliveries || [], o.id) &&
                Boolean(onCreateDelivery);
              return (
              <li key={o.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--muted)]" dir="ltr">
                      {o.orderNumber}
                    </p>
                    <p className="font-semibold">
                      {o.customerSnapshot.customerName || o.customerSnapshot.businessName || "לקוח"}
                    </p>
                    <p className="text-sm text-[var(--muted)]" dir="ltr">
                      {o.customerSnapshot.phone || "—"}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      {deliveryAreaLabel[o.deliveryAreaSnapshot]} · {o.items.length} פריטים ·{" "}
                      {orderStatusLabel[o.status]}
                    </p>
                    {linkedDelivery ? (
                      <p className="text-xs text-[var(--muted)]" dir="ltr">
                        משלוח {linkedDelivery.deliveryNumber} · {deliveryStatusLabel[linkedDelivery.status]}
                      </p>
                    ) : null}
                    <p className="text-xs text-[var(--muted)]">
                      {o.createdAt ? new Date(o.createdAt).toLocaleString("he-IL") : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-left" data-mobile-id="orders.mobile.list.totalAmount">
                    <p className="font-semibold">{formatMoney(o.totalAmount)}</p>
                    {sanitizeShippingFee(o.shippingFee) > 0 ? (
                      <p
                        className="mt-0.5 text-xs text-[var(--muted)]"
                        data-mobile-id="orders.mobile.summary.shippingFee"
                      >
                        משלוח {formatMoney(sanitizeShippingFee(o.shippingFee))}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                      onClick={() => {
                        setViewOrder(o);
                        setMode("view");
                      }}
                    >
                      צפייה
                    </button>
                    {canCreateDelivery ? (
                      <button
                        type="button"
                        className="mt-1 block w-full rounded-lg border px-3 py-2 text-xs font-semibold"
                        onClick={() => onCreateDelivery?.(o.id)}
                      >
                        צור משלוח
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  function renderView() {
    if (!viewOrder) return null;
    const o = viewOrder;
    const linkedDelivery = findDeliveryForOrder(store.deliveries || [], o.id);
    const canCreateDelivery =
      o.status === "confirmed" &&
      !hasAnyDeliveryForOrder(store.deliveries || [], o.id) &&
      Boolean(onCreateDelivery);
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            {o.orderNumber}
          </h2>
          <p className="mt-1 text-sm">{orderStatusLabel[o.status]}</p>
          <p className="mt-2 font-semibold">
            {o.customerSnapshot.customerName || o.customerSnapshot.businessName}
          </p>
          <p className="text-sm" dir="ltr">
            {o.customerSnapshot.phone}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {formatAddressText(o.deliveryAddressSnapshot)}
          </p>
          <p className="mt-1 text-sm">אזור: {deliveryAreaLabel[o.deliveryAreaSnapshot]}</p>
          <p className="mt-1 text-sm">{paymentTypeLabel.cashOnDelivery}</p>
          {linkedDelivery ? (
            <p className="mt-1 text-sm" dir="ltr">
              משלוח {linkedDelivery.deliveryNumber} · {deliveryStatusLabel[linkedDelivery.status]}
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {o.items.map((it) => (
              <li key={it.id} className="rounded-xl border bg-white px-3 py-2 text-sm">
                <p className="font-medium">{it.productSnapshot.name}</p>
                <p className="text-[var(--muted)]">
                  {it.quantity} × {formatMoney(it.unitPrice)} = {formatMoney(it.lineTotal)}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 text-sm">
            <p className="flex justify-between gap-2" data-mobile-id="orders.mobile.details.itemsSubtotal">
              <span>סכום מוצרים</span>
              <span>{formatMoney(o.itemsSubtotal ?? calcOrderItemsSubtotal(o.items))}</span>
            </p>
            <p className="flex justify-between gap-2" data-mobile-id="orders.mobile.details.shippingFee">
              <span>מחיר משלוח</span>
              <span>{formatMoney(sanitizeShippingFee(o.shippingFee))}</span>
            </p>
            <p
              className="flex justify-between gap-2 text-lg font-semibold"
              data-mobile-id="orders.mobile.details.totalAmount"
            >
              <span>סה״כ הזמנה</span>
              <span>{formatMoney(o.totalAmount)}</span>
            </p>
          </div>
          {o.status === "cancelled" && o.cancellationReason ? (
            <p className="mt-2 text-sm text-rose-700">סיבת ביטול: {o.cancellationReason}</p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl border py-3" onClick={() => setMode("list")}>
              חזרה
            </button>
            {o.status !== "cancelled" ? (
              <button type="button" className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-white" onClick={() => openEdit(o)}>
                עריכה
              </button>
            ) : (
              <button type="button" className="rounded-xl border py-3 opacity-50" disabled>
                לקריאה בלבד
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {o.status === "draft" ? (
              <button
                type="button"
                className="rounded-xl border py-3 font-semibold"
                onClick={() => {
                  const res = store.confirmOrder(o.id);
                  if (!res.ok) setError(res.error);
                  else {
                    setMessage("הזמנה אושרה");
                    setMode("list");
                  }
                }}
              >
                אישור הזמנה
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="rounded-xl border py-3"
              onClick={() => {
                setEditingId(null);
                setDraft(buildCopiedOrderDraft(o));
                setFormDirty(true);
                setStep(4);
                setError("");
                setMessage("עותק מוכן — ניתן לערוך מחיר משלוח לפני שמירה");
                setMode("form");
                setViewOrder(null);
                setCustomerPickMode("existing");
                resetInlineCustomerForm();
              }}
            >
              שכפול
            </button>
          </div>
          {canCreateDelivery ? (
            <button
              type="button"
              className="mt-2 w-full rounded-xl border py-3 font-semibold"
              onClick={() => onCreateDelivery?.(o.id)}
            >
              צור משלוח
            </button>
          ) : null}
          {o.status !== "cancelled" ? (
            <button
              type="button"
              className="mt-2 w-full rounded-xl py-3 text-sm text-rose-700 underline"
              onClick={() => {
                setShowCancel(true);
                setCancelReason("");
              }}
            >
              ביטול הזמנה
            </button>
          ) : null}
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        </div>

        {confirmEditConfirmed ? (
          <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">ההזמנה מאושרת. האם לערוך אותה?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={() => setConfirmEditConfirmed(false)}>
                ביטול
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--accent)] py-3 text-white"
                onClick={() => {
                  setConfirmEditConfirmed(false);
                  if (viewOrder) openEdit(viewOrder);
                }}
              >
                עריכה
              </button>
            </div>
          </div>
        ) : null}

        {showCancel ? (
          <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">סיבת ביטול</p>
            <input
              className="mt-2 w-full rounded-xl border px-3 py-3"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="לפחות 3 תווים"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={() => setShowCancel(false)}>
                חזרה
              </button>
              <button
                type="button"
                className="rounded-xl bg-rose-600 py-3 font-semibold text-white"
                onClick={() => {
                  const res = store.cancelOrder(o.id, cancelReason);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setShowCancel(false);
                  setMessage("הזמנה בוטלה");
                  setMode("list");
                }}
              >
                אישור ביטול
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderForm() {
    return (
      <div className="space-y-4 overflow-x-hidden pb-36">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              {editingId ? "עריכת הזמנה" : "הזמנה חדשה"}
            </h2>
            <button type="button" className="text-sm underline" onClick={requestExit}>
              ביטול
            </button>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">שלב {step} מתוך 5 · {paymentTypeLabel.cashOnDelivery}</p>

          {step === 1 && (
            <div className="mt-3 space-y-3 overflow-x-hidden" data-testid="order-cust-step">
              <p className="text-sm font-medium">בחירת לקוח</p>
              {!editingId ? (
                <div className="grid grid-cols-2 gap-2" data-testid="order-cust-pick-mode">
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                      customerPickMode === "existing"
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "bg-white"
                    }`}
                    data-testid="order-cust-existing-option"
                    onClick={() => {
                      setCustomerPickMode("existing");
                      resetInlineCustomerForm();
                      setError("");
                    }}
                  >
                    בחר לקוח קיים
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                      customerPickMode === "new"
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "bg-white"
                    }`}
                    data-testid="order-cust-new-option"
                    onClick={() => {
                      setCustomerPickMode("new");
                      setError("");
                    }}
                  >
                    צור לקוח חדש
                  </button>
                </div>
              ) : null}

              {customerPickMode === "existing" || editingId ? (
                <>
                  <input
                    className="w-full rounded-xl border px-3 py-3"
                    placeholder="חיפוש לקוח"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                  />
                  {draft.customerId ? (
                    <div className="rounded-xl border bg-white p-3 text-sm" data-testid="order-cust-selected">
                      <p className="font-semibold">
                        {draft.customerSnapshot.customerName || draft.customerSnapshot.businessName}
                      </p>
                      <p dir="ltr">{draft.customerSnapshot.phone}</p>
                      {editingId ? (
                        <button
                          type="button"
                          className="mt-2 text-xs text-[var(--accent)] underline"
                          onClick={refreshCustomerSnapshot}
                        >
                          רענן פרטי לקוח
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <ul className="max-h-64 space-y-2 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full rounded-xl border bg-white px-3 py-3 text-right text-sm"
                          onClick={() => selectCustomer(c)}
                        >
                          <span className="font-semibold">{c.name || c.businessName}</span>
                          <span className="mt-1 block text-[var(--muted)]" dir="ltr">
                            {c.phone}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="space-y-3" data-testid="order-cust-inline-form">
                  <label className="block text-sm font-medium">
                    סוג לקוח
                    <select
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                      value={customerDraft.customerType || "private"}
                      onChange={(e) =>
                        setCustomerDraft((d) => ({
                          ...d,
                          customerType: e.target.value as CustomerType,
                        }))
                      }
                    >
                      <option value="private">{customerTypeLabel.private}</option>
                      <option value="business">{customerTypeLabel.business}</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    שם לקוח
                    <input
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                      value={customerDraft.name || ""}
                      onChange={(e) => setCustomerDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    שם עסק
                    <input
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                      value={customerDraft.businessName || ""}
                      onChange={(e) =>
                        setCustomerDraft((d) => ({ ...d, businessName: e.target.value }))
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    טלפון
                    <input
                      type="tel"
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                      value={customerDraft.phone || ""}
                      onChange={(e) => setCustomerDraft((d) => ({ ...d, phone: e.target.value }))}
                      dir="ltr"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    עיר
                    <input
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                      value={customerDraft.city || ""}
                      onChange={(e) => setCustomerDraft((d) => ({ ...d, city: e.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    אזור משלוח
                    <select
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                      value={customerDraft.deliveryArea || "unassigned"}
                      onChange={(e) =>
                        setCustomerDraft((d) => ({
                          ...d,
                          deliveryArea: e.target.value as DeliveryArea,
                        }))
                      }
                    >
                      <option value="unassigned">{deliveryAreaLabel.unassigned}</option>
                      <option value="center">{deliveryAreaLabel.center}</option>
                      <option value="north">{deliveryAreaLabel.north}</option>
                      <option value="south">{deliveryAreaLabel.south}</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="text-sm font-semibold text-[var(--accent)] underline"
                    onClick={() => setCustomerMoreOpen((v) => !v)}
                    data-testid="order-cust-more-fields"
                  >
                    {customerMoreOpen ? "הסתר פרטים נוספים" : "פרטים נוספים"}
                  </button>

                  {customerMoreOpen ? (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium">
                        טלפון נוסף
                        <input
                          type="tel"
                          className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                          value={customerDraft.secondaryPhone || ""}
                          onChange={(e) =>
                            setCustomerDraft((d) => ({ ...d, secondaryPhone: e.target.value }))
                          }
                          dir="ltr"
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        דוא״ל
                        <input
                          type="email"
                          className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                          value={customerDraft.email || ""}
                          onChange={(e) => setCustomerDraft((d) => ({ ...d, email: e.target.value }))}
                          dir="ltr"
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        רחוב
                        <input
                          className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                          value={customerDraft.street || ""}
                          onChange={(e) => setCustomerDraft((d) => ({ ...d, street: e.target.value }))}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["houseNumber", "מספר בית"],
                            ["entrance", "כניסה"],
                            ["floor", "קומה"],
                            ["apartment", "דירה"],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="block text-sm font-medium">
                            {label}
                            <input
                              className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                              value={customerDraft[key] || ""}
                              onChange={(e) =>
                                setCustomerDraft((d) => ({ ...d, [key]: e.target.value }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <label className="block text-sm font-medium">
                        מיקוד
                        <input
                          className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                          value={customerDraft.zipCode || ""}
                          onChange={(e) =>
                            setCustomerDraft((d) => ({ ...d, zipCode: e.target.value }))
                          }
                          dir="ltr"
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        הוראות משלוח
                        <input
                          className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                          value={customerDraft.deliveryNotes || ""}
                          onChange={(e) =>
                            setCustomerDraft((d) => ({ ...d, deliveryNotes: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        הערות
                        <input
                          className="mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base"
                          value={customerDraft.notes || ""}
                          onChange={(e) => setCustomerDraft((d) => ({ ...d, notes: e.target.value }))}
                        />
                      </label>
                    </div>
                  ) : null}

                  {pendingDupConfirm && dupCustomers.length > 0 ? (
                    <div
                      className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
                      data-testid="order-cust-dup-warning"
                    >
                      <p className="font-medium">
                        {dupMatchKind === "phone"
                          ? "נמצא לקוח קיים עם מספר הטלפון הזה."
                          : "נמצא לקוח קיים עם שם או שם עסק דומה."}
                      </p>
                      <p className="mt-1 text-[var(--muted)]">
                        {dupCustomers[0].name || dupCustomers[0].businessName} ·{" "}
                        <span dir="ltr">{dupCustomers[0].phone}</span>
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        <button
                          type="button"
                          className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-white disabled:opacity-50"
                          disabled={savingCustomer}
                          data-testid="order-cust-use-existing"
                          onClick={() => applyExistingDuplicateCustomer(dupCustomers[0])}
                        >
                          השתמש בלקוח הקיים
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border bg-white py-3 font-semibold"
                          disabled={savingCustomer}
                          onClick={() => {
                            setPendingDupConfirm(false);
                            setDupCustomers([]);
                            setDupMatchKind(null);
                          }}
                        >
                          חזור לעריכה
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-amber-400 bg-white py-3 font-semibold disabled:opacity-50"
                          disabled={savingCustomer}
                          data-testid="order-cust-force-create"
                          onClick={() => saveCustomerAndContinue(true)}
                        >
                          צור בכל זאת
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={savingCustomer}
                    data-testid="order-cust-save-continue"
                    onClick={() => saveCustomerAndContinue(false)}
                  >
                    {savingCustomer ? "שומר לקוח…" : "שמור לקוח והמשך להזמנה"}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium">פרטי משלוח</p>
              {(
                [
                  ["street", "רחוב"],
                  ["houseNumber", "מספר בית"],
                  ["entrance", "כניסה"],
                  ["floor", "קומה"],
                  ["apartment", "דירה"],
                  ["city", "עיר"],
                  ["zipCode", "מיקוד"],
                  ["deliveryNotes", "הערות משלוח"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  {label}
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    value={draft.deliveryAddressSnapshot[key]}
                    onChange={(e) => {
                      setDraft((d) => ({
                        ...d,
                        deliveryAddressSnapshot: {
                          ...d.deliveryAddressSnapshot,
                          [key]: e.target.value,
                        },
                      }));
                      markFormDirty();
                    }}
                  />
                </label>
              ))}
              <label className="block text-sm">
                אזור משלוח
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-3"
                  value={draft.deliveryAreaSnapshot}
                  onChange={(e) => {
                    setDraft((d) => ({
                      ...d,
                      deliveryAreaSnapshot: e.target.value as DeliveryArea,
                    }));
                    markFormDirty();
                  }}
                >
                  <option value="unassigned">{deliveryAreaLabel.unassigned}</option>
                  <option value="center">{deliveryAreaLabel.center}</option>
                  <option value="north">{deliveryAreaLabel.north}</option>
                  <option value="south">{deliveryAreaLabel.south}</option>
                </select>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="mt-3 space-y-3">
              <p className="text-sm font-medium">הוספת מוצרים</p>
              <input
                className="w-full rounded-xl border px-3 py-3"
                placeholder="חיפוש מוצר"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
              />
              <ul className="max-h-40 space-y-2 overflow-y-auto">
                {filteredProducts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full rounded-xl border bg-white px-3 py-3 text-right text-sm"
                      onClick={() => tryAddProduct(p)}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="mt-1 block text-[var(--muted)]">{formatMoney(p.salePrice)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <ul className="space-y-2">
                {draft.items.map((it) => (
                  <li key={it.id} className="rounded-xl border bg-white p-3">
                    <p className="font-medium">{it.productSnapshot.name}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className="h-10 w-10 rounded-lg border text-lg"
                        onClick={() => {
                          const q = Math.max(0.001, Math.round((it.quantity - 1) * 1000) / 1000);
                          setDraft((d) => ({
                            ...d,
                            items: d.items.map((x) =>
                              x.id === it.id
                                ? { ...x, quantity: q, lineTotal: calcLineTotal(q, x.unitPrice) }
                                : x
                            ),
                          }));
                          markFormDirty();
                        }}
                      >
                        −
                      </button>
                      <input
                        className="w-20 rounded-lg border px-2 py-2 text-center"
                        value={String(it.quantity)}
                        onChange={(e) => {
                          const q = Number(e.target.value);
                          if (!Number.isFinite(q) || q <= 0) return;
                          setDraft((d) => ({
                            ...d,
                            items: d.items.map((x) =>
                              x.id === it.id
                                ? { ...x, quantity: q, lineTotal: calcLineTotal(q, x.unitPrice) }
                                : x
                            ),
                          }));
                          markFormDirty();
                        }}
                      />
                      <button
                        type="button"
                        className="h-10 w-10 rounded-lg border text-lg"
                        onClick={() => {
                          const q = Math.round((it.quantity + 1) * 1000) / 1000;
                          setDraft((d) => ({
                            ...d,
                            items: d.items.map((x) =>
                              x.id === it.id
                                ? { ...x, quantity: q, lineTotal: calcLineTotal(q, x.unitPrice) }
                                : x
                            ),
                          }));
                          markFormDirty();
                        }}
                      >
                        +
                      </button>
                    </div>
                    <label className="mt-2 block text-sm">
                      מחיר יחידה
                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={String(it.unitPrice)}
                        onChange={(e) => {
                          const p = Number(e.target.value);
                          if (!Number.isFinite(p) || p < 0) return;
                          setDraft((d) => ({
                            ...d,
                            items: d.items.map((x) =>
                              x.id === it.id
                                ? { ...x, unitPrice: p, lineTotal: calcLineTotal(x.quantity, p) }
                                : x
                            ),
                          }));
                          markFormDirty();
                        }}
                      />
                    </label>
                    <p className="mt-1 text-sm">שורה: {formatMoney(it.lineTotal)}</p>
                    <button
                      type="button"
                      className="mt-1 text-xs text-rose-700 underline"
                      onClick={() => {
                        if (!window.confirm("להסיר פריט?")) return;
                        setDraft((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }));
                        markFormDirty();
                      }}
                    >
                      הסר
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 4 && (
            <div className="mt-3 space-y-3 text-sm overflow-x-hidden">
              <p className="font-medium">סיכום</p>
              <p>
                {draft.customerSnapshot.customerName || draft.customerSnapshot.businessName} ·{" "}
                {draft.customerSnapshot.phone}
              </p>
              <p>{formatAddressText(draft.deliveryAddressSnapshot)}</p>
              <p>אזור: {deliveryAreaLabel[draft.deliveryAreaSnapshot]}</p>
              <ul className="space-y-2">
                {draft.items.map((it) => (
                  <li key={it.id} className="rounded-xl border bg-white px-3 py-2">
                    <p className="font-medium">{it.productSnapshot.name}</p>
                    <p className="text-[var(--muted)]">
                      {it.quantity} × {formatMoney(it.unitPrice)} = {formatMoney(it.lineTotal)}
                    </p>
                  </li>
                ))}
              </ul>
              <p
                className="flex justify-between gap-2"
                data-mobile-id="orders.mobile.form.itemsSubtotal"
              >
                <span>סכום מוצרים</span>
                <span>{formatMoney(itemsSubtotal)}</span>
              </p>
              <label
                className="block"
                data-mobile-id="orders.mobile.form.shippingFee"
              >
                מחיר משלוח
                <input
                  data-testid="order-shipping-fee"
                  className="mt-1 w-full min-h-12 rounded-xl border px-3 py-3 text-base"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={
                    draft.shippingFee === undefined || draft.shippingFee === null
                      ? ""
                      : String(draft.shippingFee)
                  }
                  onChange={(e) => {
                    const raw = e.target.value.trim().replace(",", ".");
                    if (raw === "") {
                      setDraft((d) => ({ ...d, shippingFee: 0 }));
                      markFormDirty();
                      return;
                    }
                    const parsed = parseShippingFee(raw);
                    if (parsed === null) return;
                    setDraft((d) => ({ ...d, shippingFee: parsed }));
                    markFormDirty();
                  }}
                />
              </label>
              <p
                className="flex justify-between gap-2 text-lg font-semibold"
                data-mobile-id="orders.mobile.form.totalAmount"
              >
                <span>סה״כ הזמנה</span>
                <span>{formatMoney(total)}</span>
              </p>
              <label className="block">
                הערות להזמנה
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-3"
                  value={draft.orderNotes || ""}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, orderNotes: e.target.value }));
                    markFormDirty();
                  }}
                />
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="mt-3 space-y-3 overflow-x-hidden">
              <p className="text-sm">שמירה מקומית. לאחר מכן ניתן לשמור לענן ממסך הסנכרון.</p>
              <p className="flex justify-between gap-2 text-sm" data-mobile-id="orders.mobile.form.itemsSubtotal">
                <span>סכום מוצרים</span>
                <span>{formatMoney(itemsSubtotal)}</span>
              </p>
              <p className="flex justify-between gap-2 text-sm" data-mobile-id="orders.mobile.form.shippingFee">
                <span>מחיר משלוח</span>
                <span>{formatMoney(shippingFee)}</span>
              </p>
              <p className="flex justify-between gap-2 text-lg font-semibold" data-mobile-id="orders.mobile.form.totalAmount">
                <span>סה״כ הזמנה</span>
                <span>{formatMoney(total)}</span>
              </p>
              {error ? <p className="text-sm text-rose-700">{error}</p> : null}
              <button
                type="button"
                className="w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-white"
                onClick={saveDraft}
              >
                שמירה
              </button>
            </div>
          )}

          {error && step !== 5 ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl border py-3"
              disabled={step <= 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
            >
              הקודם
            </button>
            <button
              type="button"
              className="rounded-xl border py-3 font-semibold"
              disabled={step >= 5}
              onClick={() => {
                if (step === 1 && !draft.customerId) {
                  setError("יש לבחור לקוח");
                  return;
                }
                if (step === 3 && draft.items.length === 0) {
                  setError("יש להוסיף לפחות מוצר אחד");
                  return;
                }
                setError("");
                setStep((s) => Math.min(5, s + 1));
              }}
            >
              הבא
            </button>
          </div>
        </div>

        <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-[var(--line)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-x-hidden">
          <div className="mx-auto flex max-w-lg min-w-0 items-center justify-between gap-2">
            <span className="text-sm text-[var(--muted)] shrink-0">סה״כ הזמנה</span>
            <span className="text-lg font-semibold truncate" data-mobile-id="orders.mobile.form.totalAmount">
              {formatMoney(total)}
            </span>
          </div>
        </div>

        {dupProduct && pendingProduct ? (
          <div className="fixed inset-x-3 bottom-28 z-40 mx-auto max-w-lg rounded-2xl border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">המוצר כבר קיים בהזמנה. לעדכן כמות בשורה הקיימת?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={addAnywayNewLine}>
                שורה חדשה
              </button>
              <button type="button" className="rounded-xl bg-[var(--accent)] py-3 text-white" onClick={updateQtyOnExisting}>
                עדכן כמות
              </button>
            </div>
            <button
              type="button"
              className="mt-2 w-full py-2 text-sm underline"
              onClick={() => {
                setDupProduct(null);
                setPendingProduct(null);
              }}
            >
              ביטול
            </button>
          </div>
        ) : null}

        {confirmExit ? (
          <div className="fixed inset-x-3 bottom-28 z-40 mx-auto max-w-lg rounded-2xl border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">יש שינויים שלא נשמרו. לצאת בכל זאת?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border py-3" onClick={() => setConfirmExit(false)}>
                חזרה
              </button>
              <button
                type="button"
                className="rounded-xl bg-rose-600 py-3 text-white"
                onClick={() => {
                  setConfirmExit(false);
                  setFormDirty(false);
                  setMode("list");
                  setEditingId(null);
                }}
              >
                יציאה
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (mode === "form") return renderForm();
  if (mode === "view") return renderView();
  return renderList();
}
