import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isProductionRuntime, verifySessionToken } from "./session";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function securityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function jsonError(status: number, message: string): NextResponse {
  return securityHeaders(NextResponse.json({ error: message }, { status }));
}

export function requireSession(req: NextRequest): Promise<{ username: string } | NextResponse> {
  return (async () => {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const result = await verifySessionToken(token);
    if (!result.ok) {
      return jsonError(401, "נדרשת התחברות");
    }
    return { username: result.username };
  })();
}

export function validateOrigin(req: NextRequest): NextResponse | null {
  if (!isProductionRuntime()) return null;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) {
    return jsonError(403, "בקשה נדחתה");
  }
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return jsonError(403, "בקשה נדחתה");
  }
  if (originHost !== host) {
    return jsonError(403, "בקשה נדחתה");
  }
  return null;
}

export function assertJsonContentType(req: NextRequest): NextResponse | null {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonError(400, "Content-Type לא תקין");
  }
  return null;
}

export async function readJsonLimited(req: NextRequest): Promise<
  { ok: true; value: unknown } | { ok: false; response: NextResponse }
> {
  const len = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError(413, "הבקשה גדולה מדי") };
  }
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
      return { ok: false, response: jsonError(413, "הבקשה גדולה מדי") };
    }
    if (!text) {
      return { ok: false, response: jsonError(400, "גוף בקשה ריק") };
    }
    const value = JSON.parse(text) as unknown;
    if (hasPrototypePollution(value)) {
      return { ok: false, response: jsonError(400, "מבנה נתונים לא תקין") };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, response: jsonError(400, "JSON לא תקין") };
  }
}

function hasPrototypePollution(value: unknown, depth = 0): boolean {
  if (depth > 20 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((v) => hasPrototypePollution(v, depth + 1));
  }
  for (const key of Object.keys(value as object)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return true;
    }
    if (hasPrototypePollution((value as Record<string, unknown>)[key], depth + 1)) {
      return true;
    }
  }
  return false;
}

export const MAX_BODY_BYTES_PUBLIC = MAX_BODY_BYTES;
