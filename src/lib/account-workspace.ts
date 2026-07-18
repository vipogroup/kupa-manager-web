/**
 * Account-linked canonical workspace (server-side only).
 * Client must never choose or send the storage path/material.
 */

/** Stable internal account id for the single-tenant business account. */
export const PRIMARY_ACCOUNT_ID = "primary-admin";

/** Isolated Phase 9A.2 test workspace — never shares blob path with production. */
export const TEST_ACCOUNT_ID = "phase9a2-test-workspace";

/**
 * Map authenticated session identity → stable account workspace id.
 * Test admin + test courier → TEST_ACCOUNT_ID.
 * Primary admin + primary courier → PRIMARY_ACCOUNT_ID.
 */
export function resolveAccountIdFromSession(username: string): string {
  const u = String(username || "").trim();
  const testAdmin = (process.env.KUPA_TEST_ADMIN_USERNAME || "").trim();
  const testCourier = (process.env.KUPA_TEST_COURIER_USERNAME || "").trim();
  if ((testAdmin && u === testAdmin) || (testCourier && u === testCourier)) {
    return TEST_ACCOUNT_ID;
  }
  return PRIMARY_ACCOUNT_ID;
}

/** Short safe fingerprint for reports (never log full HMAC). */
export function shortFingerprint(digest: string): string {
  if (!digest || digest.length < 16) return "n/a";
  return `${digest.slice(0, 8)}…${digest.slice(-6)}`;
}
