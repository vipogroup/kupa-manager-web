"use client";

import { useMemo, useState } from "react";
import { useKupaStore } from "@/lib/store";
import {
  customerTypeLabel,
  deliveryAreaLabel,
  emptyCustomerDraft,
  findDuplicatePhoneCustomers,
  validateCustomerInput,
  type CustomerInput,
} from "@/lib/entities";
import type { Customer, CustomerType, DeliveryArea } from "@/lib/types";

type Filter =
  | "all"
  | "active"
  | "inactive"
  | "center"
  | "north"
  | "south"
  | "unassigned";

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base outline-none ring-[var(--accent)] focus:ring-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CustomersPanel() {
  const store = useKupaStore();
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomerInput>(emptyCustomerDraft());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [dupWarning, setDupWarning] = useState<Customer[]>([]);
  const [pendingConfirmSave, setPendingConfirmSave] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.customers.filter((c) => {
      if (filter === "active" && !c.active) return false;
      if (filter === "inactive" && c.active) return false;
      if (filter === "center" || filter === "north" || filter === "south" || filter === "unassigned") {
        if (c.deliveryArea !== filter) return false;
      }
      if (!q) return true;
      const hay = [c.name, c.businessName, c.phone, c.city, c.customerNumber]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [store.customers, query, filter]);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyCustomerDraft());
    setError("");
    setMessage("");
    setDupWarning([]);
    setPendingConfirmSave(false);
    setMode("form");
  }

  function openEdit(c: Customer) {
    setEditingId(c.id);
    setDraft({
      customerType: c.customerType,
      name: c.name,
      businessName: c.businessName,
      phone: c.phone,
      secondaryPhone: c.secondaryPhone,
      email: c.email,
      street: c.street,
      houseNumber: c.houseNumber,
      entrance: c.entrance,
      floor: c.floor,
      apartment: c.apartment,
      city: c.city,
      zipCode: c.zipCode,
      deliveryArea: c.deliveryArea,
      deliveryNotes: c.deliveryNotes,
      notes: c.notes,
      active: c.active,
    });
    setError("");
    setMessage("");
    setDupWarning([]);
    setPendingConfirmSave(false);
    setMode("form");
  }

  function cancelForm() {
    setMode("list");
    setEditingId(null);
    setDraft(emptyCustomerDraft());
    setError("");
    setDupWarning([]);
    setPendingConfirmSave(false);
  }

  function trySave(forceDuplicate = false) {
    setError("");
    const v = validateCustomerInput(draft, { isNew: !editingId });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    const dups = findDuplicatePhoneCustomers(store.customers, draft.phone || "", editingId || undefined);
    if (dups.length > 0 && !forceDuplicate) {
      setDupWarning(dups);
      setPendingConfirmSave(true);
      return;
    }
    if (editingId) {
      const res = store.updateCustomer(editingId, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("לקוח עודכן");
    } else {
      const res = store.createCustomer(draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("לקוח נוצר");
    }
    setPendingConfirmSave(false);
    setDupWarning([]);
    setMode("list");
    setEditingId(null);
    setDraft(emptyCustomerDraft());
  }

  return (
    <div className="space-y-4">
      {mode === "list" ? (
        <>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">לקוחות</h2>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
              >
                לקוח חדש
              </button>
            </div>
            <input
              className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
              placeholder="חיפוש: שם, עסק, טלפון, עיר, מספר"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
            >
              <option value="all">הכול</option>
              <option value="active">פעילים</option>
              <option value="inactive">לא פעילים</option>
              <option value="center">מרכז</option>
              <option value="north">צפון</option>
              <option value="south">דרום</option>
              <option value="unassigned">לא הוגדר</option>
            </select>
          </div>

          {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              אין לקוחות להצגה
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((c) => (
                <li key={c.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--muted)]" dir="ltr">
                        {c.customerNumber}
                      </p>
                      <p className="font-semibold">{c.name || c.businessName || "ללא שם"}</p>
                      <p className="text-sm text-[var(--muted)]" dir="ltr">
                        {c.phone || "—"}
                      </p>
                      <p className="text-sm text-[var(--muted)]">
                        {c.city || "ללא עיר"} · {deliveryAreaLabel[c.deliveryArea]} ·{" "}
                        {c.active ? "פעיל" : "לא פעיל"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold"
                      >
                        עריכה
                      </button>
                      {c.active ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeactivateId(c.id)}
                          className="rounded-lg px-3 py-2 text-xs text-rose-700 underline"
                        >
                          השבתה
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            store.setCustomerActive(c.id, true);
                            setMessage("לקוח הופעל מחדש");
                          }}
                          className="rounded-lg px-3 py-2 text-xs text-emerald-700 underline"
                        >
                          הפעלה
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {confirmDeactivateId ? (
            <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-4 shadow-lg">
              <p className="text-sm font-medium">להשבית את הלקוח?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-xl border py-3"
                  onClick={() => setConfirmDeactivateId(null)}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-rose-600 py-3 font-semibold text-white"
                  onClick={() => {
                    store.setCustomerActive(confirmDeactivateId, false);
                    setConfirmDeactivateId(null);
                    setMessage("לקוח הושבת");
                  }}
                >
                  השבתה
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <form
          className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            trySave(false);
          }}
        >
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            {editingId ? "עריכת לקוח" : "לקוח חדש"}
          </h2>
          {editingId ? (
            <p className="text-xs text-[var(--muted)]" dir="ltr">
              {store.customers.find((c) => c.id === editingId)?.customerNumber}
            </p>
          ) : null}

          <SelectField
            label="סוג לקוח"
            value={draft.customerType || "private"}
            onChange={(v) => setDraft((d) => ({ ...d, customerType: v as CustomerType }))}
            options={[
              { value: "private", label: customerTypeLabel.private },
              { value: "business", label: customerTypeLabel.business },
            ]}
          />
          <Field label="שם" value={draft.name || ""} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
          <Field
            label="שם עסק"
            value={draft.businessName || ""}
            onChange={(v) => setDraft((d) => ({ ...d, businessName: v }))}
          />
          <Field
            label="טלפון"
            value={draft.phone || ""}
            onChange={(v) => setDraft((d) => ({ ...d, phone: v }))}
            type="tel"
          />
          <Field
            label="טלפון נוסף"
            value={draft.secondaryPhone || ""}
            onChange={(v) => setDraft((d) => ({ ...d, secondaryPhone: v }))}
            type="tel"
          />
          <Field
            label="אימייל"
            value={draft.email || ""}
            onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
            type="email"
          />
          <Field label="רחוב" value={draft.street || ""} onChange={(v) => setDraft((d) => ({ ...d, street: v }))} />
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="מספר בית"
              value={draft.houseNumber || ""}
              onChange={(v) => setDraft((d) => ({ ...d, houseNumber: v }))}
            />
            <Field
              label="כניסה"
              value={draft.entrance || ""}
              onChange={(v) => setDraft((d) => ({ ...d, entrance: v }))}
            />
            <Field label="קומה" value={draft.floor || ""} onChange={(v) => setDraft((d) => ({ ...d, floor: v }))} />
            <Field
              label="דירה"
              value={draft.apartment || ""}
              onChange={(v) => setDraft((d) => ({ ...d, apartment: v }))}
            />
          </div>
          <Field label="עיר" value={draft.city || ""} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
          <Field label="מיקוד" value={draft.zipCode || ""} onChange={(v) => setDraft((d) => ({ ...d, zipCode: v }))} />
          <SelectField
            label="אזור משלוח"
            value={draft.deliveryArea || "unassigned"}
            onChange={(v) => setDraft((d) => ({ ...d, deliveryArea: v as DeliveryArea }))}
            options={[
              { value: "unassigned", label: deliveryAreaLabel.unassigned },
              { value: "center", label: deliveryAreaLabel.center },
              { value: "north", label: deliveryAreaLabel.north },
              { value: "south", label: deliveryAreaLabel.south },
            ]}
          />
          <Field
            label="הערות משלוח"
            value={draft.deliveryNotes || ""}
            onChange={(v) => setDraft((d) => ({ ...d, deliveryNotes: v }))}
          />
          <Field
            label="הערות כלליות"
            value={draft.notes || ""}
            onChange={(v) => setDraft((d) => ({ ...d, notes: v }))}
          />

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}

          {pendingConfirmSave && dupWarning.length > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium">יש לקוח אחר עם אותו טלפון ({dupWarning.length}).</p>
              <p className="mt-1 text-[var(--muted)]">אפשר לחזור לעריכה או לשמור בכל זאת.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-xl border bg-white py-3"
                  onClick={() => {
                    setPendingConfirmSave(false);
                    setDupWarning([]);
                  }}
                >
                  חזרה לעריכה
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-white"
                  onClick={() => trySave(true)}
                >
                  שמור בכל זאת
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={cancelForm} className="rounded-xl border border-[var(--line)] py-3 font-semibold">
              ביטול
            </button>
            <button type="submit" className="rounded-xl bg-[var(--accent)] py-3 font-semibold text-white">
              שמירה
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
