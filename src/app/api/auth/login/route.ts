import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  isProductionRuntime,
  sessionCookieOptions,
} from "@/lib/session";
import {
  assertJsonContentType,
  jsonError,
  readJsonLimited,
  securityHeaders,
  validateOrigin,
} from "@/lib/security";
import { RATE_IDS, enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(RATE_IDS.login, req);
  if (limited) return securityHeaders(limited);

  const originErr = validateOrigin(req);
  if (originErr) return originErr;

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

  // Always run password verify to reduce user-enumeration timing differences.
  const dummyHash =
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const passOk = verifyPassword(password, expectedHash || dummyHash);
  const userOk = username === expectedUser;
  if (!userOk || !passOk) {
    return jsonError(401, "שם משתמש או סיסמה אינם נכונים");
  }

  const token = createSessionToken(expectedUser);
  const res = securityHeaders(NextResponse.json({ ok: true }));
  res.cookies.set(SESSION_COOKIE, await token, sessionCookieOptions(isProductionRuntime()));
  return res;
}

export function GET() {
  return jsonError(405, "Method not allowed");
}
