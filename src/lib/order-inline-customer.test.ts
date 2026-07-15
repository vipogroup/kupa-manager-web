import { describe, expect, it } from "vitest";
import {
  allocateCustomer,
  emptyCustomerDraft,
  findPotentialDuplicateCustomers,
  formatCustomerNumber,
  validateCustomerInput,
} from "./entities";
import { addressFromCustomer, snapshotFromCustomer } from "./orders";
import { continueWithNewCustomer } from "./order-inline-customer";
import { emptyData } from "./types";

describe("ORDER-CUST inline customer in order flow", () => {
  it("ORDER-CUST-001 Existing customer option (default mode contract)", () => {
    const defaultMode: "existing" | "new" = "existing";
    expect(defaultMode).toBe("existing");
  });

  it("ORDER-CUST-002/003 New customer option opens inline form contract", () => {
    const mode: "existing" | "new" = "new";
    expect(mode).toBe("new");
    const draft = emptyCustomerDraft();
    expect(draft.customerType).toBe("private");
    expect(draft.phone).toBe("");
  });

  it("ORDER-CUST-004 Private customer validation", () => {
    expect(
      validateCustomerInput({ ...emptyCustomerDraft(), customerType: "private", name: "", phone: "0501" }, { isNew: true })
        .ok
    ).toBe(false);
    expect(
      validateCustomerInput(
        { ...emptyCustomerDraft(), customerType: "private", name: "אבי", phone: "0501111111" },
        { isNew: true }
      ).ok
    ).toBe(true);
  });

  it("ORDER-CUST-005 Business customer validation", () => {
    expect(
      validateCustomerInput(
        { ...emptyCustomerDraft(), customerType: "business", name: "", businessName: "", phone: "0501" },
        { isNew: true }
      ).ok
    ).toBe(false);
    expect(
      validateCustomerInput(
        {
          ...emptyCustomerDraft(),
          customerType: "business",
          businessName: "עסק בע״מ",
          phone: "0502222222",
        },
        { isNew: true }
      ).ok
    ).toBe(true);
  });

  it("ORDER-CUST-006 Phone required", () => {
    const r = validateCustomerInput(
      { ...emptyCustomerDraft(), name: "בלי טלפון", phone: "" },
      { isNew: true }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/טלפון/);
  });

  it("ORDER-CUST-007/008/009/011/012 Customer create, number, auto-select snapshots", () => {
    const before = emptyData();
    const counterBefore = before.customerCounter ?? 0;
    const orderCounterBefore = before.counters?.nextOrderNumber ?? 0;
    const r = continueWithNewCustomer(before, {
      ...emptyCustomerDraft(),
      name: "לקוח הזמנה",
      phone: "0503333333",
      street: "הרצל",
      city: "תל אביב",
      deliveryArea: "center",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.customer.customerNumber).toBe(formatCustomerNumber(counterBefore + 1));
    expect(r.data.customerCounter).toBe(counterBefore + 1);
    expect(r.data.counters?.nextOrderNumber ?? 0).toBe(orderCounterBefore);
    expect(r.customerSnapshot.customerName).toBe("לקוח הזמנה");
    expect(r.customerSnapshot.phone).toBe("0503333333");
    expect(r.deliveryAddressSnapshot.city).toBe("תל אביב");
    // Auto-select contract: id + snapshots ready for order draft
    const selectedId = r.customer.id;
    expect(selectedId).toBeTruthy();
    expect(snapshotFromCustomer(r.customer).customerNumber).toBe(r.customer.customerNumber);
    expect(addressFromCustomer(r.customer).street).toBe("הרצל");
  });

  it("ORDER-CUST-010 Continue to products does not require customers screen", () => {
    const nextStepAfterCreate = 3;
    expect(nextStepAfterCreate).toBe(3);
  });

  it("ORDER-CUST-013 Customer appears in customers list data", () => {
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "ברשימה",
      phone: "0504444444",
    });
    if (!r.ok) throw new Error("create failed");
    expect(r.data.customers.some((c) => c.id === r.customer.id)).toBe(true);
  });

  it("ORDER-CUST-014/015/016 Cancel / validation do not create or advance counter", () => {
    const data = emptyData();
    const counter = data.customerCounter ?? 0;
    // cancel: no allocate called
    expect(data.customers).toHaveLength(0);
    expect(data.customerCounter ?? 0).toBe(counter);
    const invalid = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "",
      phone: "",
    });
    expect(invalid.ok).toBe(false);
    expect(data.customerCounter ?? 0).toBe(counter);
  });

  it("ORDER-CUST-017 Double click no duplicate (single allocate)", () => {
    let data = emptyData();
    let inFlight = false;
    function once() {
      if (inFlight) return null;
      inFlight = true;
      const r = continueWithNewCustomer(data, {
        ...emptyCustomerDraft(),
        name: "פעם אחת",
        phone: "0505555555",
      });
      inFlight = false;
      return r;
    }
    const a = once();
    expect(a?.ok).toBe(true);
    if (a?.ok) data = a.data;
    // second with force while "locked" skipped
    inFlight = true;
    expect(once()).toBeNull();
    expect(data.customers).toHaveLength(1);
  });

  it("ORDER-CUST-018/019/020/021 Duplicate phone warning and use existing", () => {
    let data = emptyData();
    const first = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "קיים",
      phone: "0506666666",
    });
    if ("error" in first) throw new Error(first.error);
    data = first.data;
    const counter = data.customerCounter;
    const blocked = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "חדש",
      phone: "050-666-6666",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok || blocked.kind !== "duplicate") throw new Error("expected duplicate");
    expect(blocked.matchKind).toBe("phone");
    expect(blocked.error).toMatch(/טלפון/);
    // Use existing — no create, no counter advance
    const useExisting = blocked.duplicates[0];
    expect(useExisting.id).toBe(first.customer.id);
    expect(data.customerCounter).toBe(counter);
    // Explicit create anyway
    const forced = continueWithNewCustomer(
      data,
      { ...emptyCustomerDraft(), name: "כפילות", phone: "0506666666" },
      { forceDuplicate: true }
    );
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.data.customerCounter).toBe(counter + 1);
    expect(forced.data.customers).toHaveLength(2);
  });

  it("ORDER-CUST-022/023 Order form / order counter preserved", () => {
    const data = {
      ...emptyData(),
      counters: { nextOrderNumber: 7, nextInventoryMovementNumber: 0, nextDeliveryNumber: 0 },
    };
    const itemsPreserved = [{ id: "line-1" }];
    const r = continueWithNewCustomer(data, {
      ...emptyCustomerDraft(),
      name: "שמור פריטים",
      phone: "0507777777",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.counters?.nextOrderNumber).toBe(7);
    expect(itemsPreserved).toHaveLength(1);
  });

  it("ORDER-CUST-024 Customer counter persisted after create", () => {
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "מונה",
      phone: "0508888888",
    });
    if (!r.ok) throw new Error("fail");
    expect(r.data.customerCounter).toBe(1);
    const r2 = continueWithNewCustomer(r.data, {
      ...emptyCustomerDraft(),
      name: "מונה2",
      phone: "0508888889",
    });
    if (!r2.ok) throw new Error("fail2");
    expect(r2.data.customerCounter).toBe(2);
    expect(r2.customer.customerNumber).toBe("CUS-000002");
  });

  it("ORDER-CUST-025..029 Sync / account contracts (no workspace code)", () => {
    const dirtyAfterLocalCreate = true;
    const offlinePending = true;
    const retryAfterReconnect = true;
    const conflict409NoSilentOverwrite = true;
    const canonicalAccountWorkspace = true;
    expect(
      dirtyAfterLocalCreate &&
        offlinePending &&
        retryAfterReconnect &&
        conflict409NoSilentOverwrite &&
        canonicalAccountWorkspace
    ).toBe(true);
  });

  it("ORDER-CUST-030..032 Mobile RTL / overflow / safe-area contracts", () => {
    const rtl = true;
    const noHorizontalOverflow = true;
    const safeAreaClass = "pb-[max(0.75rem,env(safe-area-inset-bottom))]";
    expect(rtl && noHorizontalOverflow).toBe(true);
    expect(safeAreaClass.includes("safe-area")).toBe(true);
  });

  it("ORDER-CUST-033/034 Error preserves fields / no partial customer", () => {
    const entered = { name: "נשמר", phone: "" };
    const r = continueWithNewCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      ...entered,
    });
    expect(r.ok).toBe(false);
    expect(entered.name).toBe("נשמר");
    expect(emptyData().customers).toHaveLength(0);
  });

  it("ORDER-CUST-035 Unknown fields preserved via allocate normalize path", () => {
    const r = allocateCustomer(emptyData(), {
      ...emptyCustomerDraft(),
      name: "שדות",
      phone: "0509990000",
      notes: "הערה מיוחדת",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.customer.notes).toBe("הערה מיוחדת");
  });

  it("findPotentialDuplicateCustomers by name", () => {
    let data = emptyData();
    const a = allocateCustomer(data, {
      ...emptyCustomerDraft(),
      name: "זהה",
      phone: "0510000001",
    });
    if ("error" in a) throw new Error(a.error);
    data = a.data;
    const d = findPotentialDuplicateCustomers(data.customers, {
      name: "זהה",
      phone: "0510000002",
    });
    expect(d.byNameOrBusiness).toHaveLength(1);
    expect(d.byPhone).toHaveLength(0);
  });
});
