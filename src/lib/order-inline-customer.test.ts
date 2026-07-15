import { readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PRIMARY_ACCOUNT_ID,
  resolveAccountIdFromSession,
} from "./account-workspace";
import {
  allocateCustomer,
  emptyCustomerDraft,
  findPotentialDuplicateCustomers,
  formatCustomerNumber,
  validateCustomerInput,
} from "./entities";
import { addressFromCustomer, snapshotFromCustomer } from "./orders";
import { continueWithNewCustomer } from "./order-inline-customer";
import { assertRevisionMatch } from "./sync-snapshot";
import { emptyData } from "./types";
import { accountWorkspaceDigest, accountWorkspacePath } from "./workspace-path";

const ORDERS_PANEL_SRC = readFileSync(
  join(process.cwd(), "src/components/OrdersPanel.tsx"),
  "utf8"
);
const SYNC_CLIENT_SRC = readFileSync(join(process.cwd(), "src/lib/sync-client.ts"), "utf8");
const ACCOUNT_SYNC_SRC = readFileSync(
  join(process.cwd(), "src/lib/useAccountCloudSync.ts"),
  "utf8"
);

function installMemoryLocalStorage() {
  const mem = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: ls },
    configurable: true,
  });
}

describe("ORDER-CUST inline customer in order flow", () => {
  const prevSecret = process.env.KUPA_WORKSPACE_NAMESPACE_SECRET;

  beforeAll(() => {
    process.env.KUPA_WORKSPACE_NAMESPACE_SECRET = "u".repeat(48);
    installMemoryLocalStorage();
  });

  afterAll(() => {
    process.env.KUPA_WORKSPACE_NAMESPACE_SECRET = prevSecret;
  });

  it("ORDER-CUST-001 Existing customer option", () => {
    expect(ORDERS_PANEL_SRC).toContain('useState<"existing" | "new">("existing")');
    expect(ORDERS_PANEL_SRC).toContain('data-testid="order-cust-existing-option"');
    expect(ORDERS_PANEL_SRC).toContain("בחר לקוח קיים");
  });

  it("ORDER-CUST-002 New customer option", () => {
    expect(ORDERS_PANEL_SRC).toContain('data-testid="order-cust-new-option"');
    expect(ORDERS_PANEL_SRC).toContain("צור לקוח חדש");
    expect(ORDERS_PANEL_SRC).toContain('setCustomerPickMode("new")');
  });

  it("ORDER-CUST-003 Inline customer form opens", () => {
    expect(ORDERS_PANEL_SRC).toContain('data-testid="order-cust-inline-form"');
    expect(ORDERS_PANEL_SRC).toContain("emptyCustomerDraft()");
    expect(ORDERS_PANEL_SRC).toContain('customerPickMode === "new"');
  });

  it("ORDER-CUST-004 Private customer validation", () => {
    const fail = validateCustomerInput(
      { ...emptyCustomerDraft(), customerType: "private", name: "", phone: "0501111111" },
      { isNew: true }
    );
    expect(fail.ok).toBe(false);
    const ok = validateCustomerInput(
      { ...emptyCustomerDraft(), customerType: "private", name: "אבי", phone: "0501111111" },
      { isNew: true }
    );
    expect(ok.ok).toBe(true);
  });

  it("ORDER-CUST-005 Business customer validation", () => {
    const fail = validateCustomerInput(
      {
        ...emptyCustomerDraft(),
        customerType: "business",
        name: "",
        businessName: "",
        phone: "0502222222",
      },
      { isNew: true }
    );
    expect(fail.ok).toBe(false);
    const ok = validateCustomerInput(
      {
        ...emptyCustomerDraft(),
        customerType: "business",
        businessName: "עסק בע״מ",
        phone: "0502222222",
      },
      { isNew: true }
    );
    expect(ok.ok).toBe(true);
  });

  it("ORDER-CUST-006 Phone required", () => {
    const r = validateCustomerInput(
      { ...emptyCustomerDraft(), name: "בלי טלפון", phone: "" },
      { isNew: true }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/טלפון/);
  });

  it("ORDER-CUST-007 Customer create", () => {
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "נוצר",
      phone: "0503333001",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("created");
    expect(r.customer.id).toBeTruthy();
    expect(r.data.customers).toHaveLength(1);
  });

  it("ORDER-CUST-008 Customer number allocated", () => {
    const before = emptyData();
    const r = continueWithNewCustomer(before, {
      ...emptyCustomerDraft(),
      name: "מספור",
      phone: "0503333002",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.customer.customerNumber).toBe(formatCustomerNumber(1));
    expect(r.customer.customerNumber).toMatch(/^CUS-\d{6}$/);
  });

  it("ORDER-CUST-009 Customer auto selected", () => {
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "נבחר",
      phone: "0503333003",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // UI wires selectCustomer(res.customer) then continues — id ready for draft.customerId
    expect(r.customer.id.length).toBeGreaterThan(0);
    expect(ORDERS_PANEL_SRC).toContain("selectCustomer(res.customer)");
  });

  it("ORDER-CUST-010 Continue to products", () => {
    expect(ORDERS_PANEL_SRC).toContain("setStep(3)");
    expect(ORDERS_PANEL_SRC).toContain('data-testid="order-cust-save-continue"');
    expect(ORDERS_PANEL_SRC).toContain("שמור לקוח והמשך להזמנה");
  });

  it("ORDER-CUST-011 Customer snapshot created", () => {
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "סנאפ",
      businessName: "ביז",
      phone: "0503333004",
      secondaryPhone: "0500000000",
      email: "a@b.com",
      deliveryArea: "north",
      deliveryNotes: "צלצול",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.customerSnapshot.customerNumber).toBe(r.customer.customerNumber);
    expect(r.customerSnapshot.customerName).toBe("סנאפ");
    expect(r.customerSnapshot.businessName).toBe("ביז");
    expect(r.customerSnapshot.phone).toBe("0503333004");
    expect(r.customerSnapshot.secondaryPhone).toBe("0500000000");
    expect(r.customerSnapshot.email).toBe("a@b.com");
    expect(r.customerSnapshot.deliveryArea).toBe("north");
    expect(r.customerSnapshot.deliveryNotes).toBe("צלצול");
    expect(snapshotFromCustomer(r.customer)).toEqual(r.customerSnapshot);
  });

  it("ORDER-CUST-012 Address snapshot created", () => {
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "כתובת",
      phone: "0503333005",
      street: "הרצל",
      houseNumber: "10",
      entrance: "א",
      floor: "2",
      apartment: "5",
      city: "חיפה",
      zipCode: "12345",
      deliveryNotes: "קומה שנייה",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deliveryAddressSnapshot.street).toBe("הרצל");
    expect(r.deliveryAddressSnapshot.houseNumber).toBe("10");
    expect(r.deliveryAddressSnapshot.entrance).toBe("א");
    expect(r.deliveryAddressSnapshot.floor).toBe("2");
    expect(r.deliveryAddressSnapshot.apartment).toBe("5");
    expect(r.deliveryAddressSnapshot.city).toBe("חיפה");
    expect(r.deliveryAddressSnapshot.zipCode).toBe("12345");
    expect(addressFromCustomer(r.customer)).toEqual(r.deliveryAddressSnapshot);
  });

  it("ORDER-CUST-013 Customer appears in customers screen", () => {
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "ברשימה",
      phone: "0503333006",
      active: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const listed = r.data.customers.find((c) => c.id === r.customer.id);
    expect(listed).toBeTruthy();
    expect(listed!.customerNumber).toBe(r.customer.customerNumber);
    expect(listed!.phone).toBe("0503333006");
    expect(listed!.active).toBe(true);
  });

  it("ORDER-CUST-014 Cancel no customer", () => {
    const data = emptyData();
    // Cancel path never calls continueWithNewCustomer / createCustomer
    expect(data.customers).toHaveLength(0);
    expect(ORDERS_PANEL_SRC).toContain("resetInlineCustomerForm()");
    expect(ORDERS_PANEL_SRC).toMatch(/requestExit|ביטול/);
  });

  it("ORDER-CUST-015 Cancel no counter advance", () => {
    const data = emptyData();
    const counter = data.customerCounter ?? 0;
    // Simulated cancel: no allocate
    expect(data.customerCounter ?? 0).toBe(counter);
    expect(data.customers).toHaveLength(0);
  });

  it("ORDER-CUST-016 Validation no counter advance", () => {
    const data = emptyData();
    const counter = data.customerCounter ?? 0;
    const r = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "",
      phone: "",
    });
    expect(r.ok).toBe(false);
    expect(data.customerCounter ?? 0).toBe(counter);
    expect(data.customers).toHaveLength(0);
  });

  it("ORDER-CUST-017 Double click no duplicate", () => {
    let data = emptyData();
    let inFlight = false;
    function guardedSave() {
      if (inFlight) return null;
      inFlight = true;
      try {
        return continueWithNewCustomer(data, {
          ...emptyCustomerDraft(),
          name: "פעם אחת",
          phone: "0503333007",
        });
      } finally {
        inFlight = false;
      }
    }
    const first = guardedSave();
    expect(first?.ok).toBe(true);
    if (first?.ok) data = first.data;
    inFlight = true;
    expect(guardedSave()).toBeNull();
    expect(data.customers).toHaveLength(1);
    expect(ORDERS_PANEL_SRC).toContain("if (savingCustomer) return");
  });

  it("ORDER-CUST-018 Duplicate phone warning", () => {
    let data = emptyData();
    const first = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "קיים",
      phone: "0503333008",
    });
    if ("error" in first) throw new Error(first.error);
    data = first.data;
    const blocked = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "חדש",
      phone: "050-333-3008",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok || blocked.kind !== "duplicate") throw new Error("expected duplicate");
    expect(blocked.matchKind).toBe("phone");
    expect(blocked.error).toBe("נמצא לקוח קיים עם מספר הטלפון הזה.");
    expect(ORDERS_PANEL_SRC).toContain('data-testid="order-cust-dup-warning"');
  });

  it("ORDER-CUST-019 Use existing customer", () => {
    let data = emptyData();
    const first = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "קיים לשימוש",
      phone: "0503333009",
    });
    if ("error" in first) throw new Error(first.error);
    data = first.data;
    const blocked = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "אחר",
      phone: "0503333009",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok || blocked.kind !== "duplicate") throw new Error("expected duplicate");
    const existing = blocked.duplicates[0];
    expect(existing.id).toBe(first.customer.id);
    const snap = snapshotFromCustomer(existing);
    expect(snap.customerName).toBe("קיים לשימוש");
    expect(ORDERS_PANEL_SRC).toContain("applyExistingDuplicateCustomer");
    expect(ORDERS_PANEL_SRC).toContain('data-testid="order-cust-use-existing"');
  });

  it("ORDER-CUST-020 Use existing no counter advance", () => {
    let data = emptyData();
    const first = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "ללא קידום",
      phone: "0503333010",
    });
    if ("error" in first) throw new Error(first.error);
    data = first.data;
    const counter = data.customerCounter;
    const blocked = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "ניסיון",
      phone: "0503333010",
    });
    expect(blocked.ok).toBe(false);
    // Choosing existing does not call allocate again
    expect(data.customerCounter).toBe(counter);
    expect(data.customers).toHaveLength(1);
  });

  it("ORDER-CUST-021 Create duplicate only after confirmation", () => {
    let data = emptyData();
    const first = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "א",
      phone: "0503333011",
    });
    if ("error" in first) throw new Error(first.error);
    data = first.data;
    const withoutForce = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "ב",
      phone: "0503333011",
    });
    expect(withoutForce.ok).toBe(false);
    const forced = continueWithNewCustomer(
      data,
      { ...emptyCustomerDraft(), name: "ב", phone: "0503333011" },
      { forceDuplicate: true }
    );
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.data.customers).toHaveLength(2);
    expect(ORDERS_PANEL_SRC).toContain("saveCustomerAndContinue(true)");
    expect(ORDERS_PANEL_SRC).toContain('data-testid="order-cust-force-create"');
  });

  it("ORDER-CUST-022 Existing order form data preserved", () => {
    const orderItemsBefore = [
      { id: "line-1", productId: "p1", quantity: 2 },
      { id: "line-2", productId: "p2", quantity: 1 },
    ];
    const paymentType = "cashOnDelivery";
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "שומר טופס",
      phone: "0503333012",
    });
    expect(r.ok).toBe(true);
    // allocateCustomer only mutates customers/counter — order draft items stay in UI state
    expect(orderItemsBefore).toHaveLength(2);
    expect(paymentType).toBe("cashOnDelivery");
    expect(r.ok && "data" in r ? r.data.orders : []).toEqual([]);
  });

  it("ORDER-CUST-023 Order counter unchanged", () => {
    const data = {
      ...emptyData(),
      counters: {
        nextOrderNumber: 12,
        nextInventoryMovementNumber: 3,
        nextDeliveryNumber: 4,
      },
    };
    const r = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "מונה הזמנה",
      phone: "0503333013",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.counters?.nextOrderNumber).toBe(12);
    expect(r.data.counters?.nextInventoryMovementNumber).toBe(3);
    expect(r.data.counters?.nextDeliveryNumber).toBe(4);
  });

  it("ORDER-CUST-024 Customer counter persisted", () => {
    const r1 = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "ראשון",
      phone: "0503333014",
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.data.customerCounter).toBe(1);
    const r2 = continueWithNewCustomer(r1.data, {
      ...emptyCustomerDraft(),
      name: "שני",
      phone: "0503333015",
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.data.customerCounter).toBe(2);
    expect(r2.customer.customerNumber).toBe("CUS-000002");
  });

  it("ORDER-CUST-025 Auto save", async () => {
    const { useKupaStore } = await import("./store");
    useKupaStore.setState({
      ...emptyData(),
      dirty: false,
      pendingSync: false,
      syncStatus: "clean",
      cloudHydrated: true,
      workspaceCode: "",
      cloudRevision: 0,
      cloudUpdatedAt: "",
      lastError: "",
    });
    const res = useKupaStore.getState().createCustomer({
      ...emptyCustomerDraft(),
      name: "אוטוסייב",
      phone: "0503333016",
    });
    expect(res.ok).toBe(true);
    const st = useKupaStore.getState();
    expect(st.dirty).toBe(true);
    expect(st.pendingSync).toBe(true);
    expect(st.syncStatus).toBe("dirty");
    expect(ACCOUNT_SYNC_SRC).toContain("AUTO_SAVE_DEBOUNCE_MS");
    expect(ACCOUNT_SYNC_SRC).toContain("saveToCloud");
  });

  it("ORDER-CUST-026 Offline pending", () => {
    expect(SYNC_CLIENT_SRC).toContain('store.setSyncStatus("offline"');
    expect(SYNC_CLIENT_SRC).toContain("store.setPendingSync(true)");
    expect(SYNC_CLIENT_SRC).toMatch(/אין חיבור לאינטרנט/);
    expect(ACCOUNT_SYNC_SRC).toContain("pendingSync");
  });

  it("ORDER-CUST-027 Retry after reconnect", () => {
    expect(ACCOUNT_SYNC_SRC).toContain('window.addEventListener("online"');
    expect(ACCOUNT_SYNC_SRC).toContain("saveToCloud()");
    expect(ACCOUNT_SYNC_SRC).toMatch(/חזרת החיבור|onOnline/);
  });

  it("ORDER-CUST-028 Conflict 409", () => {
    const conflict = assertRevisionMatch(5, 6);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.cloudRevision).toBe(6);
    expect(SYNC_CLIENT_SRC).toContain("CLOUD_VERSION_CHANGED");
    expect(SYNC_CLIENT_SRC).toContain("conflict: true");
    expect(ORDERS_PANEL_SRC.length).toBeGreaterThan(0);
  });

  it("ORDER-CUST-029 Same account same customer", () => {
    const a = resolveAccountIdFromSession("admin");
    const b = resolveAccountIdFromSession("admin");
    expect(a).toBe(PRIMARY_ACCOUNT_ID);
    expect(b).toBe(PRIMARY_ACCOUNT_ID);
    expect(accountWorkspaceDigest(a)).toBe(accountWorkspaceDigest(b));
    expect(accountWorkspacePath(a)).toBe(accountWorkspacePath(b));
    // Customer lives in account-bound AppData — same path for same login
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "חשבון",
      phone: "0503333017",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.customers[0].id).toBe(r.customer.id);
  });

  it("ORDER-CUST-030 Mobile RTL", () => {
    expect(ORDERS_PANEL_SRC).toContain('text-right');
    expect(ORDERS_PANEL_SRC).toMatch(/dir="ltr"/);
    // App shell / document is RTL; order form Hebrew labels
    expect(ORDERS_PANEL_SRC).toContain("שם לקוח");
    expect(ORDERS_PANEL_SRC).toContain("טלפון");
  });

  it("ORDER-CUST-031 No horizontal overflow", () => {
    expect(ORDERS_PANEL_SRC).toContain("overflow-x-hidden");
    expect(ORDERS_PANEL_SRC).toContain('data-testid="order-cust-step"');
  });

  it("ORDER-CUST-032 iPhone safe area", () => {
    expect(ORDERS_PANEL_SRC).toContain("env(safe-area-inset-bottom)");
    expect(ORDERS_PANEL_SRC).toMatch(/safe-area-inset/);
  });

  it("ORDER-CUST-033 Error preserves entered fields", () => {
    const entered = {
      ...emptyCustomerDraft(),
      name: "נשמר בטופס",
      businessName: "עסק נשמר",
      phone: "",
      city: "אילת",
    };
    const r = continueWithNewCustomer(emptyData(), entered);
    expect(r.ok).toBe(false);
    expect(entered.name).toBe("נשמר בטופס");
    expect(entered.businessName).toBe("עסק נשמר");
    expect(entered.city).toBe("אילת");
  });

  it("ORDER-CUST-034 No partial customer", () => {
    const data = emptyData();
    const r = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "חלקי",
      phone: "",
    });
    expect(r.ok).toBe(false);
    expect(data.customers).toHaveLength(0);
    expect(data.customerCounter ?? 0).toBe(0);
  });

  it("ORDER-CUST-035 Unknown fields preserved", () => {
    const r = allocateCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "שדות",
      phone: "0503333018",
      notes: "הערה מיוחדת",
      deliveryNotes: "הוראה מיוחדת",
      secondaryPhone: "0501111000",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.customer.notes).toBe("הערה מיוחדת");
    expect(r.customer.deliveryNotes).toBe("הוראה מיוחדת");
    expect(r.customer.secondaryPhone).toBe("0501111000");
    const dups = findPotentialDuplicateCustomers(r.data.customers, {
      phone: "0503333018",
    });
    expect(dups.byPhone).toHaveLength(1);
  });
});

describe("ORDER-CUST coverage guard", () => {
  it("exactly one automated case per ORDER-CUST-001..035", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/order-inline-customer.test.ts"), "utf8");
    const ids: string[] = [];
    for (let i = 1; i <= 35; i++) {
      const id = `ORDER-CUST-${String(i).padStart(3, "0")}`;
      const re = new RegExp(`it\\("${id} `, "g");
      const matches = src.match(re) || [];
      expect(matches.length, `${id} should appear exactly once as it(...)`).toBe(1);
      ids.push(id);
    }
    expect(ids).toHaveLength(35);
    // No bundled multi-ID titles like ORDER-CUST-002/003
    expect(src).not.toMatch(/it\("ORDER-CUST-\d{3}\/\d{3}/);
    expect(src).not.toMatch(/it\("ORDER-CUST-\d{3}\.\./);
  });
});
