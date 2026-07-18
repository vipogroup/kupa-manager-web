"use client";

import { FormEvent, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type CatalogItem = {
  id: string;
  name: string;
  model: string;
  unit: string;
  salePrice: number;
};

type Line = { productId: string; quantity: number; notes: string };

function money(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(n || 0);
}

function OrderRequestForm() {
  const params = useSearchParams();
  const vendor = params.get("vendor") || "";
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [error, setError] = useState("");
  const [idem] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  const [locked, setLocked] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [entrance, setEntrance] = useState("");
  const [floor, setFloor] = useState("");
  const [apartment, setApartment] = useState("");
  const [elevator, setElevator] = useState("unknown");
  const [accessNotes, setAccessNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: 1, notes: "" }]);
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [requestedPaymentMethod, setRequestedPaymentMethod] = useState("cashOnDelivery");
  const [cashCollectionRequested, setCashCollectionRequested] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  useEffect(() => {
    if (!vendor) {
      setLoadError("חסר קישור תקין לטופס");
      return;
    }
    void fetch(`/api/public/catalog?vendor=${encodeURIComponent(vendor)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setLoadError(j.error || "לא ניתן לטעון קטלוג");
          return;
        }
        setCatalog(Array.isArray(j.items) ? j.items : []);
      })
      .catch(() => setLoadError("אין חיבור"));
  }, [vendor]);

  const total = useMemo(() => {
    return lines.reduce((sum, line) => {
      const p = catalog.find((c) => c.id === line.productId);
      if (!p) return sum;
      return sum + p.salePrice * Math.max(0, Number(line.quantity) || 0);
    }, 0);
  }, [lines, catalog]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (locked || busy) return;
    setBusy(true);
    setError("");
    setLocked(true);
    try {
      const res = await fetch("/api/public/order-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor,
          fullName,
          phone,
          secondaryPhone,
          email,
          city,
          street,
          houseNumber,
          entrance,
          floor,
          apartment,
          elevator,
          accessNotes,
          items: lines
            .filter((l) => l.productId)
            .map((l) => ({
              productId: l.productId,
              quantity: Math.floor(Number(l.quantity) || 0),
              notes: l.notes,
            })),
          requestedDeliveryDate,
          requestedPaymentMethod,
          cashCollectionRequested:
            cashCollectionRequested.trim() === "" ? undefined : Number(cashCollectionRequested),
          customerNotes,
          consentAccepted: consent,
          website: honeypot,
          idempotencyKey: idem,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "שליחה נכשלה");
        setLocked(false);
        return;
      }
      setDone({ reference: j.reference || "" });
    } catch {
      setError("אין חיבור — נסו שוב");
      setLocked(false);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto min-h-dvh max-w-lg px-4 py-10" dir="rtl">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h1 className="text-2xl font-bold text-emerald-900">הבקשה התקבלה</h1>
          <p className="mt-3 text-sm leading-relaxed text-emerald-900/90">
            מספר בקשה: <span className="font-mono font-semibold">{done.reference}</span>
          </p>
          <p className="mt-2 text-sm text-emerald-900/80">
            זו אינה הזמנה מאושרת עדיין. העסק יבדוק את הפרטים ויחזור אליכם לאישור סופי.
          </p>
          <p className="mt-2 text-xs text-emerald-900/70">מומלץ לשמור צילום מסך של מספר הבקשה.</p>
          <a
            href={`/order-request?vendor=${encodeURIComponent(vendor)}`}
            className="mt-6 inline-block rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
          >
            בקשה חדשה
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-6" dir="rtl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">טופס הזמנה</h1>
        <p className="mt-1 text-sm text-neutral-600">מלאו את הפרטים — ההזמנה תאושר רק לאחר בדיקת העסק.</p>
      </header>

      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loadError}</p>
      ) : null}

      <form className="space-y-5" onSubmit={onSubmit}>
        {/* honeypot */}
        <div className="absolute -left-[9999px] opacity-0" aria-hidden="true">
          <label>
            אתר
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </label>
        </div>

        <section className="space-y-3 rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">פרטי קשר</h2>
          <label className="block text-sm">
            שם מלא *
            <input required className="mt-1 w-full rounded-xl border px-3 py-3" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label className="block text-sm">
            טלפון *
            <input required inputMode="tel" className="mt-1 w-full rounded-xl border px-3 py-3" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block text-sm">
            טלפון נוסף
            <input inputMode="tel" className="mt-1 w-full rounded-xl border px-3 py-3" dir="ltr" value={secondaryPhone} onChange={(e) => setSecondaryPhone(e.target.value)} />
          </label>
          <label className="block text-sm">
            אימייל
            <input type="email" className="mt-1 w-full rounded-xl border px-3 py-3" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </section>

        <section className="space-y-3 rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">כתובת משלוח</h2>
          <label className="block text-sm">
            יישוב *
            <input required className="mt-1 w-full rounded-xl border px-3 py-3" value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="block text-sm">
            רחוב *
            <input required className="mt-1 w-full rounded-xl border px-3 py-3" value={street} onChange={(e) => setStreet(e.target.value)} />
          </label>
          <label className="block text-sm">
            מספר בית *
            <input required className="mt-1 w-full rounded-xl border px-3 py-3" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm">
              כניסה
              <input className="mt-1 w-full rounded-xl border px-3 py-3" value={entrance} onChange={(e) => setEntrance(e.target.value)} />
            </label>
            <label className="block text-sm">
              קומה
              <input className="mt-1 w-full rounded-xl border px-3 py-3" value={floor} onChange={(e) => setFloor(e.target.value)} />
            </label>
            <label className="block text-sm">
              דירה
              <input className="mt-1 w-full rounded-xl border px-3 py-3" value={apartment} onChange={(e) => setApartment(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            מעלית
            <select className="mt-1 w-full rounded-xl border px-3 py-3" value={elevator} onChange={(e) => setElevator(e.target.value)}>
              <option value="unknown">לא ידוע</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
          </label>
          <label className="block text-sm">
            הערות גישה
            <textarea className="mt-1 w-full rounded-xl border px-3 py-3" rows={2} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} />
          </label>
        </section>

        <section className="space-y-3 rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">מוצרים</h2>
          {catalog.length === 0 && !loadError ? (
            <p className="text-sm text-neutral-500">אין מוצרים זמינים כרגע בטופס.</p>
          ) : null}
          {lines.map((line, idx) => (
            <div key={idx} className="space-y-2 rounded-xl border p-3">
              <label className="block text-sm">
                מוצר
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-3"
                  value={line.productId}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...line, productId: e.target.value };
                    setLines(next);
                  }}
                >
                  <option value="">בחרו מוצר</option>
                  {catalog.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.model ? ` · ${p.model}` : ""} · {money(p.salePrice)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                כמות
                <input
                  type="number"
                  min={1}
                  max={999}
                  className="mt-1 w-full rounded-xl border px-3 py-3"
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...line, quantity: Number(e.target.value) };
                    setLines(next);
                  }}
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            className="w-full rounded-xl border py-3 text-sm"
            onClick={() => setLines([...lines, { productId: "", quantity: 1, notes: "" }])}
          >
            הוסף מוצר
          </button>
          <p className="text-sm font-semibold">סה״כ משוער: {money(total)}</p>
          <p className="text-xs text-neutral-500">המחיר משוער בלבד — סופי רק לאחר אישור העסק.</p>
        </section>

        <section className="space-y-3 rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">אספקה ותשלום</h2>
          <label className="block text-sm">
            תאריך אספקה מבוקש
            <input type="date" className="mt-1 w-full rounded-xl border px-3 py-3" value={requestedDeliveryDate} onChange={(e) => setRequestedDeliveryDate(e.target.value)} />
          </label>
          <label className="block text-sm">
            אמצעי תשלום מבוקש
            <select className="mt-1 w-full rounded-xl border px-3 py-3" value={requestedPaymentMethod} onChange={(e) => setRequestedPaymentMethod(e.target.value)}>
              <option value="cashOnDelivery">מזומן לשליח</option>
              <option value="bankTransfer">העברה בנקאית</option>
              <option value="bit">Bit</option>
              <option value="other">אחר</option>
            </select>
          </label>
          <label className="block text-sm">
            סכום מזומן לגבייה (אם רלוונטי)
            <input className="mt-1 w-full rounded-xl border px-3 py-3" inputMode="decimal" value={cashCollectionRequested} onChange={(e) => setCashCollectionRequested(e.target.value)} />
          </label>
          <label className="block text-sm">
            הערות להזמנה
            <textarea className="mt-1 w-full rounded-xl border px-3 py-3" rows={3} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
          </label>
        </section>

        <label className="flex items-start gap-3 rounded-2xl border bg-white p-4 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>
            אני מאשר/ת שהפרטים שמסרתי נכונים וששליחת הטופס אינה מהווה אישור סופי להזמנה עד לקבלת אישור מהעסק.
          </span>
        </label>

        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}

        <button
          type="submit"
          disabled={busy || locked || !!loadError}
          className="w-full rounded-2xl bg-neutral-900 py-4 text-base font-semibold text-white disabled:opacity-50"
        >
          {busy ? "שולח…" : "שליחת בקשה"}
        </button>
      </form>
    </main>
  );
}

export default function OrderRequestPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center" dir="rtl">טוען…</div>}>
      <OrderRequestForm />
    </Suspense>
  );
}
