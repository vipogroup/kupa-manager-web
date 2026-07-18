"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Stop = {
  stopId: string;
  sequence: number;
  customerName: string;
  phone: string | null;
  secondaryPhone: string | null;
  city: string;
  street: string;
  houseNumber: string;
  entrance: string;
  floor: string;
  apartment: string;
  elevator: string;
  accessNotes: string;
  items: Array<{ name: string; quantity: number; notes: string }>;
  orderNotes: string | null;
  deliveryNotes: string | null;
  stopNotes: string | null;
  cashCollectionAmount: number | null;
  paymentMethod: string | null;
  navigationQuery: string;
};

type Route = {
  id: string;
  routeNumber: string;
  routeName: string;
  routeDate: string;
  vehicleLabel: string;
  areaLabel: string;
  stopCount: number;
  stopsWithCash: number;
  stopsWithoutCash: number;
  totalCashToCollect: number;
  serverTotalVerified: boolean;
  updatedAt: string;
  stops: Stop[];
};

type RoutesPayload = {
  ok: boolean;
  date: string;
  driverName: string;
  routeCount: number;
  stopCount: number;
  stopsWithCash: number;
  totalCashToCollect: number;
  serverTotalVerified: boolean;
  fetchedAt: string;
  routes: Route[];
  error?: string;
};

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function mapsUrl(query: string): string {
  const q = encodeURIComponent(query);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function wazeUrl(query: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

export default function CourierDailyPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<RoutesPayload | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [cacheNote, setCacheNote] = useState("");

  const cacheKey = useMemo(() => `kupa-courier-cache:${date}`, [date]);

  const load = useCallback(
    async (forceNetwork = true) => {
      setLoading(true);
      setError("");
      setErrorCode("");
      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      setOffline(!online);

      if (!online) {
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const cached = JSON.parse(raw) as RoutesPayload & { cachedAt?: string };
            setData(cached);
            setCacheNote(`נתונים ממטמון — עודכנו לאחרונה: ${cached.cachedAt || cached.fetchedAt || "?"}`);
          } else {
            setData(null);
            setError("אין חיבור לאינטרנט ואין מטמון זמין");
          }
        } catch {
          setError("אין חיבור לאינטרנט");
        }
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/courier/routes?date=${encodeURIComponent(date)}`, {
          credentials: "include",
          cache: forceNetwork ? "no-store" : "default",
        });
        const j = (await res.json().catch(() => ({}))) as RoutesPayload & { error?: string };
        if (!res.ok) {
          setData(null);
          setErrorCode(j.error || "ERROR");
          if (j.error === "COURIER_ACCESS_DISABLED") setError("הגישה שלך הושבתה");
          else if (j.error === "COURIER_ACCESS_MISSING") setError("לא שובצת למסלול / אין גישת שליח");
          else if (j.error === "COURIER_DATE_FORBIDDEN") setError("תאריך אינו מורשה");
          else if (res.status === 401) setError("נדרשת התחברות");
          else setError("לא ניתן לטעון את המסלול");
          setLoading(false);
          return;
        }
        setData(j);
        setCacheNote("");
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ ...j, cachedAt: j.fetchedAt }));
        } catch {
          /* ignore quota */
        }
      } catch {
        setError("לא ניתן לטעון את המסלול");
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, date]
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const onOff = () => setOffline(!navigator.onLine);
    window.addEventListener("online", onOff);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOff);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login?next=/courier";
  }

  const routes = data?.routes || [];

  return (
    <div
      dir="rtl"
      className="min-h-dvh bg-gradient-to-b from-slate-100 to-slate-200 text-slate-900"
      data-testid="courier-daily-view"
    >
      <header className="sticky top-0 z-10 border-b border-slate-300/80 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-wide text-sky-700">KUPA · שליח</p>
            <h1 className="text-xl font-bold">{data?.driverName || "המשלוחים שלי"}</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {offline ? "אופליין" : "מחובר"} · {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString("he-IL") : "—"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-slate-300 px-2 py-2 text-sm"
              aria-label="תאריך"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void load(true)}
                className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white"
              >
                רענן
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-medium"
              >
                יציאה
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4 pb-24">
        {cacheNote ? (
          <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {cacheNote}
          </p>
        ) : null}
        {error ? (
          <div
            className="mb-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-4 text-rose-900"
            data-testid="courier-error"
            data-error-code={errorCode}
          >
            <p className="font-semibold">{error}</p>
            {errorCode ? <p className="mt-1 text-xs opacity-70">{errorCode}</p> : null}
          </div>
        ) : null}

        {loading ? <p className="text-center text-sm text-slate-600">טוען משלוחים…</p> : null}

        {!loading && !error && data && routes.length === 0 ? (
          <div className="rounded-2xl border border-slate-300 bg-white px-4 py-8 text-center">
            <p className="text-lg font-semibold">אין לך משלוחים להיום</p>
            <p className="mt-2 text-sm text-slate-600">לא שובצת למסלול בתאריך זה, או שהמסלול עדיין בטיוטה.</p>
          </div>
        ) : null}

        {!loading && data && routes.length > 0 ? (
          <>
            <section className="mb-4 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">סיכום יומי · {data.date}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold">{data.stopCount}</p>
                  <p className="text-xs text-slate-500">משלוחים</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{data.stopsWithCash}</p>
                  <p className="text-xs text-slate-500">עם גבייה</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-700">{money(data.totalCashToCollect)}</p>
                  <p className="text-xs text-slate-500">סה״כ לגבייה</p>
                </div>
              </div>
              {!data.serverTotalVerified ? (
                <p className="mt-2 text-xs text-amber-700">אזהרה: אימות סכום שרת לא תואם</p>
              ) : null}
            </section>

            {routes.map((route) => (
              <section key={route.id} className="mb-5">
                <div className="mb-2 rounded-2xl bg-slate-800 px-4 py-3 text-white">
                  <p className="text-sm opacity-80">{route.routeNumber}</p>
                  <h2 className="text-lg font-bold">{route.routeName || "מסלול"}</h2>
                  <p className="mt-1 text-sm opacity-90">
                    רכב: {route.vehicleLabel || "—"} · אזור: {route.areaLabel || "—"} · {route.stopCount} תחנות
                  </p>
                  <p className="mt-1 text-base font-semibold text-emerald-300">
                    לגבייה במסלול: {money(route.totalCashToCollect)}
                  </p>
                </div>

                <ol className="space-y-3">
                  {route.stops.map((stop) => {
                    const cash = stop.cashCollectionAmount;
                    const cashZero = cash === 0;
                    const cashHidden = cash == null;
                    return (
                      <li
                        key={stop.stopId}
                        className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"
                        data-testid="courier-stop-card"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-sky-700">תחנה {stop.sequence}</p>
                            <h3 className="text-lg font-bold">{stop.customerName}</h3>
                          </div>
                          {!cashHidden ? (
                            <div
                              className={`rounded-xl px-3 py-2 text-center ${
                                cashZero ? "bg-slate-100 text-slate-700" : "bg-emerald-100 text-emerald-900"
                              }`}
                            >
                              <p className="text-[0.65rem] font-semibold">לגבות</p>
                              <p className="text-lg font-bold leading-tight">{money(cash)}</p>
                            </div>
                          ) : null}
                        </div>

                        <p className="mt-2 text-sm leading-relaxed text-slate-700">
                          {[stop.street, stop.houseNumber].filter(Boolean).join(" ")}
                          {stop.city ? `, ${stop.city}` : ""}
                          <br />
                          {[
                            stop.entrance ? `כניסה ${stop.entrance}` : "",
                            stop.floor ? `קומה ${stop.floor}` : "",
                            stop.apartment ? `דירה ${stop.apartment}` : "",
                            stop.elevator && stop.elevator !== "unknown" ? `מעלית: ${stop.elevator}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {stop.accessNotes ? (
                          <p className="mt-1 text-sm text-slate-600">גישה: {stop.accessNotes}</p>
                        ) : null}

                        {stop.phone ? (
                          <a
                            href={`tel:${stop.phone.replace(/\s/g, "")}`}
                            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                          >
                            חייג {stop.phone}
                          </a>
                        ) : null}

                        {stop.items?.length ? (
                          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-sm">
                            {stop.items.map((it, i) => (
                              <li key={i}>
                                {it.name} × {it.quantity}
                                {it.notes ? ` · ${it.notes}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {stop.deliveryNotes ? (
                          <p className="mt-2 text-sm text-slate-600">הערות משלוח: {stop.deliveryNotes}</p>
                        ) : null}
                        {stop.stopNotes ? (
                          <p className="mt-1 text-sm text-slate-600">הערות תחנה: {stop.stopNotes}</p>
                        ) : null}
                        {stop.orderNotes ? (
                          <p className="mt-1 text-sm text-slate-600">הערות הזמנה: {stop.orderNotes}</p>
                        ) : null}
                        {stop.paymentMethod ? (
                          <p className="mt-1 text-xs text-slate-500">תשלום: {stop.paymentMethod}</p>
                        ) : null}

                        {stop.navigationQuery ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <a
                              href={mapsUrl(stop.navigationQuery)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
                            >
                              פתח ניווט (Maps)
                            </a>
                            <a
                              href={wazeUrl(stop.navigationQuery)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-cyan-700 px-3 py-2 text-sm font-semibold text-white"
                            >
                              Waze
                            </a>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </>
        ) : null}
      </main>
    </div>
  );
}
