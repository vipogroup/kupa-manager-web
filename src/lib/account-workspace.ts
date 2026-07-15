/**
 * Account-linked canonical workspace (server-side only).
 * Client must never choose or send the storage path/material.
 */

/** Stable internal account id for the single-tenant business account. */
export const PRIMARY_ACCOUNT_ID = "primary-admin";

/**
 * Map authenticated session identity → stable account workspace id.
 * Username is not used as path material (display name may change).
 */
export function resolveAccountIdFromSession(username: string): string {
  // Single-tenant: any authenticated session maps to the primary account workspace.
  // Username is accepted for future multi-account mapping; unused today.
  void username;
  return PRIMARY_ACCOUNT_ID;
}

/** Short safe fingerprint for reports (never log full HMAC). */
export function shortFingerprint(digest: string): string {
  if (!digest || digest.length < 16) return "n/a";
  return `${digest.slice(0, 8)}…${digest.slice(-6)}`;
}
