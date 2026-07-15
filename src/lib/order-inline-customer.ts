import {
  allocateCustomer,
  findPotentialDuplicateCustomers,
  validateCustomerInput,
  type CustomerInput,
} from "./entities";
import { addressFromCustomer, snapshotFromCustomer } from "./orders";
import type { AppData, Customer } from "./types";

export type InlineCustomerContinueResult =
  | { ok: false; kind: "validation"; error: string }
  | {
      ok: false;
      kind: "duplicate";
      error: string;
      matchKind: "phone" | "identity";
      duplicates: Customer[];
    }
  | {
      ok: true;
      kind: "created";
      data: AppData;
      customer: Customer;
      customerSnapshot: ReturnType<typeof snapshotFromCustomer>;
      deliveryAddressSnapshot: ReturnType<typeof addressFromCustomer>;
    };

/**
 * Pure helper: validate + optional duplicate gate + allocate customer for order flow.
 * Does not mutate store. Counter advances only on successful allocate.
 */
export function continueWithNewCustomer(
  data: AppData,
  input: CustomerInput,
  opts: { forceDuplicate?: boolean } = {}
): InlineCustomerContinueResult {
  const v = validateCustomerInput(input, { isNew: true });
  if (!v.ok) return { ok: false, kind: "validation", error: v.error };

  const dups = findPotentialDuplicateCustomers(data.customers, {
    phone: input.phone,
    name: input.name,
    businessName: input.businessName,
  });

  if (dups.all.length > 0 && !opts.forceDuplicate) {
    const matchKind = dups.byPhone.length > 0 ? "phone" : "identity";
    return {
      ok: false,
      kind: "duplicate",
      matchKind,
      duplicates: dups.all,
      error:
        matchKind === "phone"
          ? "נמצא לקוח קיים עם מספר הטלפון הזה."
          : "נמצא לקוח קיים עם שם או שם עסק דומה.",
    };
  }

  const allocated = allocateCustomer(data, input);
  if ("error" in allocated) {
    return { ok: false, kind: "validation", error: allocated.error };
  }

  return {
    ok: true,
    kind: "created",
    data: allocated.data,
    customer: allocated.customer,
    customerSnapshot: snapshotFromCustomer(allocated.customer),
    deliveryAddressSnapshot: addressFromCustomer(allocated.customer),
  };
}
