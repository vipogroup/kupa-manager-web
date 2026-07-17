"use client";

import { useMemo, useState } from "react";
import { useKupaStore } from "@/lib/store";
import { applyCloudLoad, saveToCloud } from "@/lib/sync-client";
import type { DeliveryRoute, Driver, Vehicle } from "@/lib/types";

async function pushAfterLocal(): Promise<string> {
  const r = await saveToCloud();
  if (!r.ok) {
    if (r.conflict) return "התנגשות גרסה — רענן מהענן ונסה שוב";
    return r.error || "שמירה לענן נכשלה";
  }
  return "";
}

export function DriversPanel() {
  const drivers = useKupaStore((s) => s.drivers || []);
  const replaceAll = useKupaStore((s) => s.replaceAll);
  const asAppData = useKupaStore((s) => s.asAppData);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [readOnly] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return drivers;
    return drivers.filter(
      (d) =>
        d.displayName.toLowerCase().includes(qq) ||
        d.phone.includes(qq) ||
        (d.driverNumber || d.id).toLowerCase().includes(qq)
    );
  }, [drivers, q]);

  async function createDriver() {
    if (readOnly) return;
    const displayName = name.trim();
    if (!displayName) {
      setMsg("שם נהג חובה");
      return;
    }
    const data = asAppData();
    const { allocateDriver } = await import("@/lib/phase9a-fleet");
    const r = allocateDriver(data, { displayName, phone: phone.trim() });
    if ("error" in r) {
      setMsg(r.error);
      return;
    }
    replaceAll(r.data);
    useKupaStore.getState().markDirty();
    const err = await pushAfterLocal();
    setMsg(err || `נוצר ${r.driver.id}`);
    setName("");
    setPhone("");
  }

  async function toggleActive(d: Driver) {
    if (readOnly) return;
    const data = asAppData();
    const { setDriverActiveInData } = await import("@/lib/phase9a-fleet");
    const r = setDriverActiveInData(data, d.id, !d.isActive);
    if ("error" in r) {
      setMsg(r.error);
      return;
    }
    replaceAll(r.data);
    useKupaStore.getState().markDirty();
    const err = await pushAfterLocal();
    setMsg(err || (d.isActive ? "הושבת" : "הופעל"));
  }

  return (
    <section className="space-y-3" data-testid="drivers-panel" data-mobile-id="drivers.mobile.list.root">
      <h2 className="text-lg font-semibold">נהגים</h2>
      <input
        className="w-full rounded-xl border px-3 py-2"
        placeholder="חיפוש"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-mobile-id="drivers.mobile.filters.search"
      />
      {!readOnly && (
        <div className="grid gap-2 rounded-xl border p-3" data-mobile-id="drivers.mobile.form.create">
          <input className="rounded-lg border px-3 py-2" placeholder="שם מלא" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded-lg border px-3 py-2" placeholder="טלפון" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button type="button" className="rounded-xl bg-[var(--accent)] px-3 py-2 text-white" onClick={createDriver}>
            צור נהג
          </button>
        </div>
      )}
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      <ul className="space-y-2" data-mobile-id="drivers.mobile.list.items">
        {filtered.map((d) => (
          <li key={d.id} className="rounded-xl border px-3 py-2">
            <div className="font-medium">{d.displayName}</div>
            <div className="text-xs text-[var(--muted)]">
              {d.driverNumber || d.id} · {d.phone || "—"} · {d.isActive ? "פעיל" : "מושבת"}
            </div>
            {!readOnly && (
              <button type="button" className="mt-2 text-sm underline" onClick={() => toggleActive(d)}>
                {d.isActive ? "השבת" : "הפעל"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="text-sm underline" onClick={() => applyCloudLoad().then(() => setMsg("רוענן מהענן"))}>
        רענון מהענן
      </button>
    </section>
  );
}

export function VehiclesPanel() {
  const vehicles = useKupaStore((s) => s.vehicles || []);
  const replaceAll = useKupaStore((s) => s.replaceAll);
  const asAppData = useKupaStore((s) => s.asAppData);
  const [q, setQ] = useState("");
  const [plate, setPlate] = useState("");
  const [msg, setMsg] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return vehicles;
    return vehicles.filter(
      (v) =>
        v.licensePlate.toLowerCase().includes(qq) ||
        v.displayName.toLowerCase().includes(qq) ||
        (v.vehicleNumber || v.id).toLowerCase().includes(qq)
    );
  }, [vehicles, q]);

  async function createVehicle() {
    const data = asAppData();
    const { allocateVehicle } = await import("@/lib/phase9a-fleet");
    const r = allocateVehicle(data, { licensePlate: plate, displayName: plate });
    if ("error" in r) {
      setMsg(r.error);
      return;
    }
    replaceAll(r.data);
    useKupaStore.getState().markDirty();
    const err = await pushAfterLocal();
    setMsg(err || `נוצר ${r.vehicle.id}`);
    setPlate("");
  }

  async function toggleActive(v: Vehicle) {
    const data = asAppData();
    const { setVehicleActiveInData } = await import("@/lib/phase9a-fleet");
    const r = setVehicleActiveInData(data, v.id, !v.isActive);
    if ("error" in r) {
      setMsg(r.error);
      return;
    }
    replaceAll(r.data);
    useKupaStore.getState().markDirty();
    const err = await pushAfterLocal();
    setMsg(err || "עודכן");
  }

  return (
    <section className="space-y-3" data-testid="vehicles-panel" data-mobile-id="vehicles.mobile.list.root">
      <h2 className="text-lg font-semibold">רכבים</h2>
      <input className="w-full rounded-xl border px-3 py-2" placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid gap-2 rounded-xl border p-3">
        <input className="rounded-lg border px-3 py-2" placeholder="מספר רישוי" value={plate} onChange={(e) => setPlate(e.target.value)} />
        <button type="button" className="rounded-xl bg-[var(--accent)] px-3 py-2 text-white" onClick={createVehicle}>
          צור רכב
        </button>
      </div>
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      <ul className="space-y-2">
        {filtered.map((v) => (
          <li key={v.id} className="rounded-xl border px-3 py-2">
            <div className="font-medium">{v.displayName || v.licensePlate}</div>
            <div className="text-xs text-[var(--muted)]">
              {v.vehicleNumber || v.id} · {v.licensePlate} · עומס {v.maxWeightKg}קג · {v.isActive ? "פעיל" : "מושבת"}
            </div>
            <button type="button" className="mt-2 text-sm underline" onClick={() => toggleActive(v)}>
              {v.isActive ? "השבת" : "הפעל"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoutesPanel() {
  const routes = useKupaStore((s) => s.deliveryRoutes || []);
  const replaceAll = useKupaStore((s) => s.replaceAll);
  const asAppData = useKupaStore((s) => s.asAppData);
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<DeliveryRoute | null>(null);

  async function createRoute() {
    const data = asAppData();
    const { allocateDeliveryRoute } = await import("@/lib/phase9a-fleet");
    const r = allocateDeliveryRoute(data, {
      routeName: name.trim() || "מסלול",
      routeDate: date,
      planningStatus: "Draft",
      stops: [],
    });
    if ("error" in r) {
      setMsg(r.error);
      return;
    }
    replaceAll(r.data);
    useKupaStore.getState().markDirty();
    const err = await pushAfterLocal();
    setMsg(err || `נוצר ${r.route.id}`);
    setName("");
  }

  return (
    <section className="space-y-3" data-testid="routes-panel" data-mobile-id="routes.mobile.list.root">
      <h2 className="text-lg font-semibold">מסלולי משלוח</h2>
      <div className="grid gap-2 rounded-xl border p-3">
        <input className="rounded-lg border px-3 py-2" placeholder="שם מסלול" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded-lg border px-3 py-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="rounded-xl bg-[var(--accent)] px-3 py-2 text-white" onClick={createRoute}>
          צור טיוטת מסלול
        </button>
      </div>
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      <ul className="space-y-2">
        {routes.map((r) => (
          <li key={r.id} className="rounded-xl border px-3 py-2">
            <button type="button" className="w-full text-right" onClick={() => setSelected(r)}>
              <div className="font-medium">{r.routeName || r.routeNumber || r.id}</div>
              <div className="text-xs text-[var(--muted)]">
                {r.routeDate} · {r.planningStatus} · תחנות {(r.stops || []).length}
                {r.isCancelled ? " · מבוטל" : ""}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <div className="rounded-xl border p-3" data-mobile-id="routes.mobile.details.root">
          <h3 className="font-semibold">פרטי מסלול</h3>
          <p className="text-sm">{selected.routeNumber || selected.id}</p>
          <ol className="mt-2 list-decimal pr-5 text-sm">
            {(selected.stops || []).map((s) => (
              <li key={s.id}>
                #{s.sequence} · {s.deliveryId || "ללא משלוח"} · {s.stopNotes || ""}
              </li>
            ))}
          </ol>
          <button type="button" className="mt-2 text-sm underline" onClick={() => setSelected(null)}>
            סגור
          </button>
        </div>
      ) : null}
    </section>
  );
}
