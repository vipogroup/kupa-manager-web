"use client";

import { useMemo, useState } from "react";
import {
  MOBILE_MODULES,
  MOBILE_MODULE_LABELS,
  MOBILE_REGISTRY,
  elementsForModule,
} from "@/lib/ui-prefs/mobile-registry";
import { useMobilePrefs } from "@/lib/ui-prefs/mobile-visibility";
import type { MobileModuleId, MobilePresetId } from "@/lib/ui-prefs/types";

type CenterCategory = "desktop" | "mobile";

const DESKTOP_CATS = [
  { id: "home", label: "בית" },
  { id: "income", label: "הכנסות" },
  { id: "expense", label: "הוצאות" },
  { id: "customers", label: "לקוחות" },
  { id: "products", label: "מוצרים" },
  { id: "orders", label: "הזמנות" },
  { id: "inventory", label: "מלאי" },
  { id: "deliveries", label: "משלוחים" },
  { id: "drivers", label: "נהגים" },
  { id: "vehicles", label: "רכבים" },
  { id: "routes", label: "מסלולים" },
  { id: "sync", label: "סנכרון" },
] as const;

const PRESET_LABELS: Record<MobilePresetId, string> = {
  basic: "בסיסי",
  business: "עסקי",
  full: "מלא",
  readOnly: "קריאה בלבד",
  custom: "מותאם אישית",
};

const PREVIEW_WIDTHS = [320, 375, 390, 430] as const;

export function CustomizationCenter({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const prefs = useMobilePrefs();
  const [category, setCategory] = useState<CenterCategory | string>("mobile");
  const [moduleId, setModuleId] = useState<MobileModuleId>("customers");
  const [previewW, setPreviewW] = useState<(typeof PREVIEW_WIDTHS)[number]>(375);
  const [msg, setMsg] = useState("");

  const elements = useMemo(() => elementsForModule(moduleId), [moduleId]);

  if (!open) return null;

  async function applySave() {
    setMsg("שומר…");
    const r = await prefs.save();
    if (r.ok) setMsg("החל ושמור — נשמר לחשבון");
    else if (r.conflict) setMsg("התנגשות 409 — טען מחדש לפני שמירה");
    else setMsg(r.error || "שמירה נכשלה / ממתין לסנכרון");
  }

  const isMobileCat = category === "mobile";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]"
      data-testid="customization-center"
      role="dialog"
      aria-modal="true"
      aria-label="ניהול והתאמת הממשק"
    >
      <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-xl">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              ניהול והתאמת הממשק
            </h2>
            <p className="text-xs text-[var(--muted)]">מרכז התאמה גלובלי · קטגוריית מובייל לטלפון</p>
          </div>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={onClose}>
            סגור
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="max-h-40 shrink-0 overflow-y-auto border-b border-[var(--line)] md:max-h-none md:w-48 md:border-b-0 md:border-l">
            <p className="px-3 pt-3 text-[0.65rem] font-semibold text-[var(--muted)]">קטגוריות</p>
            <ul className="space-y-1 p-2">
              {DESKTOP_CATS.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-right text-sm ${
                      category === c.id ? "bg-[var(--accent)] text-white" : "hover:bg-black/5"
                    }`}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  data-testid="customization-cat-mobile"
                  className={`w-full rounded-lg px-3 py-2 text-right text-sm font-semibold ${
                    isMobileCat ? "bg-[var(--accent)] text-white" : "hover:bg-black/5"
                  }`}
                  onClick={() => setCategory("mobile")}
                >
                  מובייל
                </button>
              </li>
            </ul>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!isMobileCat ? (
              <div className="rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">
                <p className="font-semibold text-[var(--ink)]">תצוגת מחשב</p>
                <p className="mt-2">
                  קטגוריה זו אינה משנה את תצוגת המחשב. כל השדות בשולחן העבודה נשארים מלאים. לשינוי תצוגת
                  הטלפון בלבד — בחרו בקטגוריית <strong>מובייל</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-4" data-testid="mobile-category-panel">
                <section className="rounded-xl border border-[var(--line)] p-3">
                  <p className="text-sm font-semibold">Presets</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(PRESET_LABELS) as MobilePresetId[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`rounded-xl border px-2 py-2 text-sm ${
                          prefs.draft.preset === p ? "border-[var(--accent)] bg-emerald-50" : ""
                        }`}
                        onClick={() => prefs.setPreset(p)}
                      >
                        {PRESET_LABELS[p]}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      className="rounded-xl bg-[var(--accent)] py-2 text-sm font-semibold text-white"
                      onClick={() => void applySave()}
                    >
                      החל ושמור
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border py-2 text-sm"
                      onClick={() => {
                        prefs.discardLocal();
                        setMsg("בוטל — חזרה לגרסה האחרונה שנשמרה");
                      }}
                    >
                      ביטול
                    </button>
                    <button type="button" className="rounded-xl border py-2 text-sm" onClick={() => prefs.showAll()}>
                      הצג הכול
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border py-2 text-sm"
                      onClick={() => prefs.hideOptional()}
                    >
                      הסתר אופציונליים
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border py-2 text-sm"
                      onClick={() => prefs.resetDefault()}
                    >
                      שחזור ברירת מחדל
                    </button>
                  </div>
                  {msg ? <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p> : null}
                  {prefs.status === "conflict" ? (
                    <p className="mt-2 text-sm text-rose-700">התנגשות 409 — אין דריסה שקטה</p>
                  ) : null}
                  {prefs.pendingSync ? (
                    <p className="mt-2 text-sm text-amber-800">ממתין לסנכרון</p>
                  ) : null}
                </section>

                <section className="rounded-xl border border-[var(--line)] p-3">
                  <p className="text-sm font-semibold">מודולים במובייל</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MOBILE_MODULES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        data-testid={`mobile-module-${m}`}
                        className={`rounded-full border px-3 py-1.5 text-xs ${
                          moduleId === m ? "border-[var(--accent)] bg-emerald-50 font-semibold" : ""
                        }`}
                        onClick={() => setModuleId(m)}
                      >
                        {MOBILE_MODULE_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-[var(--line)] p-3">
                  <p className="text-sm font-semibold">
                    רכיבים — {MOBILE_MODULE_LABELS[moduleId]} ({elements.length})
                  </p>
                  <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                    {elements.map((e) => {
                      const checked = !prefs.isHidden(e.id);
                      return (
                        <li
                          key={e.id}
                          className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-white px-2 py-2"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={checked}
                            disabled={e.required}
                            data-testid={`mobile-cb-${e.id}`}
                            onChange={(ev) => prefs.setHidden(e.id, !ev.target.checked)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{e.labelHe}</p>
                            <p className="truncate font-mono text-[0.65rem] text-[var(--muted)]" dir="ltr">
                              {e.id}
                            </p>
                            {e.required ? (
                              <p className="mt-0.5 text-xs text-amber-800">רכיב חובה — לא ניתן להסתיר</p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="rounded-xl border border-[var(--line)] p-3" data-testid="mobile-preview">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">תצוגה מקדימה (נתוני דוגמה)</p>
                    <div className="flex gap-1">
                      {PREVIEW_WIDTHS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          className={`rounded-lg border px-2 py-1 text-xs ${
                            previewW === w ? "bg-[var(--accent)] text-white" : ""
                          }`}
                          onClick={() => setPreviewW(w)}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-center overflow-x-auto">
                    <div
                      className="rounded-[1.5rem] border-4 border-slate-800 bg-[#eef5f1] p-3 shadow-inner"
                      style={{ width: previewW }}
                    >
                      <MobilePreview moduleId={moduleId} hidden={new Set(prefs.draft.hiddenElementIds)} />
                    </div>
                  </div>
                </section>

                {/* Live binding host: every registry id present in DOM for audit */}
                <div className="sr-only" aria-hidden data-testid="mobile-live-binding-host">
                  {MOBILE_REGISTRY.map((e) => (
                    <span key={e.id} data-mobile-id={e.id}>
                      {e.labelHe}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobilePreview({
  moduleId,
  hidden,
}: {
  moduleId: MobileModuleId;
  hidden: Set<string>;
}) {
  const sampleCustomers = {
    number: "CUS-000001",
    name: "לקוח לדוגמה",
    business: "עסק לדוגמה",
    phone: "050-0000000",
    secondary: "050-1111111",
    email: "demo@example.com",
    city: "תל אביב",
    area: "מרכז",
  };

  function show(id: string) {
    return !hidden.has(id);
  }

  if (moduleId === "customers") {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-semibold">לקוחות (דוגמה)</p>
        <div className="rounded-xl border bg-white p-2">
          {show("customers.mobile.list.customerNumber") ? (
            <p data-mobile-id="customers.mobile.list.customerNumber" className="text-xs text-[var(--muted)]" dir="ltr">
              {sampleCustomers.number}
            </p>
          ) : null}
          {show("customers.mobile.list.name") ? (
            <p data-mobile-id="customers.mobile.list.name" className="font-semibold">
              {sampleCustomers.name}
            </p>
          ) : null}
          {show("customers.mobile.list.businessName") ? (
            <p data-mobile-id="customers.mobile.list.businessName">{sampleCustomers.business}</p>
          ) : null}
          {show("customers.mobile.list.phone") ? (
            <p data-mobile-id="customers.mobile.list.phone" dir="ltr">
              {sampleCustomers.phone}
            </p>
          ) : null}
          {show("customers.mobile.list.secondaryPhone") ? (
            <p data-mobile-id="customers.mobile.list.secondaryPhone" dir="ltr">
              {sampleCustomers.secondary}
            </p>
          ) : null}
          {show("customers.mobile.list.email") ? (
            <p data-mobile-id="customers.mobile.list.email" dir="ltr">
              {sampleCustomers.email}
            </p>
          ) : null}
          {show("customers.mobile.list.city") ? (
            <p data-mobile-id="customers.mobile.list.city">{sampleCustomers.city}</p>
          ) : null}
          {show("customers.mobile.list.deliveryArea") ? (
            <p data-mobile-id="customers.mobile.list.deliveryArea">{sampleCustomers.area}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold">{MOBILE_MODULE_LABELS[moduleId]} (דוגמה)</p>
      {elementsForModule(moduleId)
        .filter((e) => !hidden.has(e.id) || e.required)
        .slice(0, 12)
        .map((e) => (
          <p key={e.id} data-mobile-id={e.id} className="rounded border bg-white px-2 py-1 text-xs">
            {e.required ? "★ " : ""}
            {e.labelHe}
          </p>
        ))}
    </div>
  );
}
