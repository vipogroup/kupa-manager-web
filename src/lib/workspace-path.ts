import { createHmac } from "crypto";
import { sanitizeCode } from "./sanitize";

function namespaceSecret(): string {
  const secret = process.env.KUPA_WORKSPACE_NAMESPACE_SECRET || "";
  if (secret.length < 32) {
    throw new Error("workspace_namespace_secret_missing");
  }
  return secret;
}

function sanitizeAccountId(accountId: string): string | null {
  const s = String(accountId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
  return s || null;
}

/** Legacy browser workspace codes (HMAC of sanitized code). Kept for migration tools / tests. */
export function workspaceHmacDigest(code: string): string | null {
  const safe = sanitizeCode(code);
  if (!safe) return null;
  return createHmac("sha256", namespaceSecret()).update(safe, "utf8").digest("hex");
}

export function workspaceHmacPath(code: string): string | null {
  const digest = workspaceHmacDigest(code);
  if (!digest) return null;
  return `workspaces/${digest}.json`;
}

/** Prefix for private backups — HMAC only, never raw workspace code. */
export function workspaceBackupPrefix(code: string): string | null {
  const digest = workspaceHmacDigest(code);
  if (!digest) return null;
  return `backups/${digest}/`;
}

export function backupPathname(code: string, revision: number, timestampIso: string): string | null {
  const prefix = workspaceBackupPrefix(code);
  if (!prefix) return null;
  const stamp = timestampIso.replace(/[:.]/g, "-");
  return `${prefix}${revision}-${stamp}.json`;
}

/**
 * Account-canonical workspace digest:
 * HMAC(secret, "account-workspace:" + accountId)
 */
export function accountWorkspaceDigest(accountId: string): string | null {
  const id = sanitizeAccountId(accountId);
  if (!id) return null;
  const material = `account-workspace:${id}`;
  return createHmac("sha256", namespaceSecret()).update(material, "utf8").digest("hex");
}

export function accountWorkspacePath(accountId: string): string | null {
  const digest = accountWorkspaceDigest(accountId);
  if (!digest) return null;
  return `workspaces/${digest}.json`;
}

export function accountBackupPrefix(accountId: string): string | null {
  const digest = accountWorkspaceDigest(accountId);
  if (!digest) return null;
  return `backups/${digest}/`;
}

export function accountBackupPathname(
  accountId: string,
  revision: number,
  timestampIso: string
): string | null {
  const prefix = accountBackupPrefix(accountId);
  if (!prefix) return null;
  const stamp = timestampIso.replace(/[:.]/g, "-");
  return `${prefix}${revision}-${stamp}.json`;
}
