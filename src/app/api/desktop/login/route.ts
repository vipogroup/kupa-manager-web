import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { SESSION_MAX_AGE_SEC, createSessionToken } from "@/lib/session";
import {
  assertJsonContentType,
  jsonError,
  readJsonLimited,
  securityHeaders,
} from "@/lib/security";
import { RATE_IDS, enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Desktop (Windows) login — returns Bearer session token in JSON body.
 * Does not set browser cookies (Windows stores token via DPAPI).
 * No Origin check: desktop clients do not send browser Origin.
 * Never returns Blob URLs, workspace HMAC, or password material.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(RATE_IDS.desktopLogin, req);
  if (limited) return securityHeaders(limited);

  const ctErr = assertJsonContentType(req);
  if (ctErr) return ctErr;

  const body = await readJsonLimited(req);
  if (!body.ok) return body.response;

  const value = body.value as { username?: unknown; password?: unknown };
  const username = typeof value.username === "string" ? value.username.trim() : "";
  const password = typeof value.password === "string" ? value.password : "";

  if (!username || !password) {
    return jsonError(400, "שם משתמש או סיסמה אינם נכונים");
  }

  const expectedUser = process.env.KUPA_ADMIN_USERNAME || "";
  const expectedHash = process.env.KUPA_ADMIN_PASSWORD_HASH || "";
  if (!expectedUser || !expectedHash) {
    return jsonError(503, "התחברות אינה מוגדרת");
  }

  const dummyHash =
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const passOk = verifyPassword(password, expectedHash || dummyHash);
  const userOk = username === expectedUser;
  if (!userOk || !passOk) {
    return jsonError(401, "שם משתמש או סיסמה אינם נכונים");
  }

  const token = await createSessionToken(expectedUser);
  return securityHeaders(
    NextResponse.json({
      ok: true,
      token,
      expiresIn: SESSION_MAX_AGE_SEC,
      tokenType: "Bearer",
      readOnly: true,
      accountBound: true,
    })
  );
}

export function GET() {
  return jsonError(405, "Method not allowed");
}

export function PUT() {
  return jsonError(405, "Method not allowed");
}

export function DELETE() {
  return jsonError(405, "Method not allowed");
}
