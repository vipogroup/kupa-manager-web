import { createHmac } from "crypto";
import { sanitizeCode } from "./sanitize";

export function workspaceHmacDigest(code: string): string | null {
  const safe = sanitizeCode(code);
  if (!safe) return null;
  const secret = process.env.KUPA_WORKSPACE_NAMESPACE_SECRET || "";
  if (secret.length < 32) {
    throw new Error("workspace_namespace_secret_missing");
  }
  return createHmac("sha256", secret).update(safe, "utf8").digest("hex");
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
