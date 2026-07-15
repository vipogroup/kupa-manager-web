export const SESSION_COOKIE = "kupa_session";
export const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

type SessionPayload = {
  u: string;
  iat: number;
  exp: number;
};

function sessionSecret(): string {
  const s = process.env.KUPA_SESSION_SECRET || "";
  if (s.length < 32) {
    throw new Error("session_secret_missing");
  }
  return s;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]!);
  const b64 = btoa(str);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(username: string, now = Date.now()): Promise<string> {
  const payload: SessionPayload = {
    u: username,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SEC,
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await sign(body);
  return `${body}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  now = Date.now()
): Promise<{ ok: true; username: string } | { ok: false; reason: string }> {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "missing" };
  }
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return { ok: false, reason: "format" };
    const expected = await sign(body);
    if (!timingSafeEqualStr(sig, expected)) {
      return { ok: false, reason: "tampered" };
    }
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (!payload?.u || typeof payload.exp !== "number") {
      return { ok: false, reason: "payload" };
    }
    if (payload.exp * 1000 <= now) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true, username: String(payload.u) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}
