import { createHmac } from "crypto";
import { sanitizeCode } from "./sanitize";

export function workspaceHmacPath(code: string): string | null {
  const safe = sanitizeCode(code);
  if (!safe) return null;
  const secret = process.env.KUPA_WORKSPACE_NAMESPACE_SECRET || "";
  if (secret.length < 32) {
    throw new Error("workspace_namespace_secret_missing");
  }
  const digest = createHmac("sha256", secret).update(safe, "utf8").digest("hex");
  return `workspaces/${digest}.json`;
}
