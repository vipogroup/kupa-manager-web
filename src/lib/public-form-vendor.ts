import { createHmac, timingSafeEqual } from "crypto";
import { PRIMARY_ACCOUNT_ID, TEST_ACCOUNT_ID } from "./account-workspace";

function formSecret(): string {
  const s =
    process.env.KUPA_PUBLIC_FORM_SECRET ||
    process.env.KUPA_WORKSPACE_NAMESPACE_SECRET ||
    "";
  if (s.length < 32) throw new Error("public_form_secret_missing");
  return s;
}

/** Stable public vendor token — not a workspace path; HMAC of account id. */
export function publicVendorTokenForAccount(accountId: string): string {
  const id = String(accountId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
  if (!id) throw new Error("invalid_account");
  return createHmac("sha256", formSecret())
    .update(`public-order-form:${id}`, "utf8")
    .digest("base64url")
    .slice(0, 32);
}

export function primaryPublicVendorToken(): string {
  return publicVendorTokenForAccount(PRIMARY_ACCOUNT_ID);
}

export function testPublicVendorToken(): string {
  return publicVendorTokenForAccount(TEST_ACCOUNT_ID);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Resolve signed public vendor → account workspace id.
 * Never accepts raw workspace paths or client-chosen account ids.
 */
export function resolvePublicVendor(vendor: unknown):
  | { ok: true; accountId: string; isTest: boolean }
  | { ok: false; error: string } {
  const v = typeof vendor === "string" ? vendor.trim() : "";
  if (!v || v.length < 16 || v.length > 64) {
    return { ok: false, error: "מזהה טופס אינו תקין" };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(v)) {
    return { ok: false, error: "מזהה טופס אינו תקין" };
  }
  try {
    const primary = primaryPublicVendorToken();
    if (safeEqual(v, primary)) {
      return { ok: true, accountId: PRIMARY_ACCOUNT_ID, isTest: false };
    }
    const test = testPublicVendorToken();
    if (safeEqual(v, test)) {
      return { ok: true, accountId: TEST_ACCOUNT_ID, isTest: true };
    }
  } catch {
    return { ok: false, error: "טופס ציבורי אינו מוגדר" };
  }
  return { ok: false, error: "מזהה טופס אינו תקין" };
}
