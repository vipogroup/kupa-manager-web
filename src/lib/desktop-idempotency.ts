import { createHash } from "crypto";
import { del, get, head, list, put } from "@vercel/blob";
import { accountWorkspaceDigest } from "./workspace-path";

const IDEMPOTENCY_RETENTION = 100;
const IDEMPOTENCY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function privateToken(): string {
  const t = process.env.KUPA_PRIVATE_READ_WRITE_TOKEN || "";
  if (!t) throw new Error("private_blob_token_missing");
  return t;
}

export function sanitizeIdempotencyKey(key: unknown): string | null {
  if (typeof key !== "string") return null;
  const s = key.trim();
  if (s.length < 8 || s.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(s)) return null;
  return s;
}

export function idempotencyPathname(accountId: string, key: string): string | null {
  const digest = accountWorkspaceDigest(accountId);
  if (!digest) return null;
  const keyHash = createHash("sha256").update(key, "utf8").digest("hex");
  return `idempotency/${digest}/${keyHash}.json`;
}

export function idempotencyPrefix(accountId: string): string | null {
  const digest = accountWorkspaceDigest(accountId);
  if (!digest) return null;
  return `idempotency/${digest}/`;
}

export type IdempotencyReceipt = {
  actionType: string;
  createdAt: string;
  response: Record<string, unknown>;
};

export async function readIdempotencyReceipt(
  accountId: string,
  key: string
): Promise<IdempotencyReceipt | null> {
  const path = idempotencyPathname(accountId, key);
  if (!path) return null;
  try {
    await head(path, { token: privateToken() });
    const result = await get(path, {
      access: "private",
      token: privateToken(),
      useCache: false,
    });
    if (!result?.stream) return null;
    const raw = await new Response(result.stream).text();
    const parsed = JSON.parse(raw) as IdempotencyReceipt;
    if (!parsed || typeof parsed !== "object" || !parsed.response) return null;
    const age = Date.now() - Date.parse(parsed.createdAt || "");
    if (!Number.isFinite(age) || age < 0 || age > IDEMPOTENCY_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeIdempotencyReceipt(
  accountId: string,
  key: string,
  receipt: IdempotencyReceipt
): Promise<void> {
  const path = idempotencyPathname(accountId, key);
  if (!path) throw new Error("idempotency_path_invalid");
  await put(path, JSON.stringify(receipt), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: privateToken(),
  });
  await pruneIdempotency(accountId);
}

async function pruneIdempotency(accountId: string): Promise<void> {
  const prefix = idempotencyPrefix(accountId);
  if (!prefix) return;
  try {
    const res = await list({ token: privateToken(), prefix, limit: 1000 });
    const sorted = [...res.blobs].sort((a, b) => {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return tb - ta;
    });
    for (const blob of sorted.slice(IDEMPOTENCY_RETENTION)) {
      await del(blob.url, { token: privateToken() });
    }
  } catch {
    /* ok */
  }
}
