import { NextRequest, NextResponse } from "next/server";
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
import { authenticateUser } from "@/lib/auth-accounts";
import { resolveAccountIdFromSession, shortFingerprint } from "@/lib/account-workspace";
import { accountWorkspacePath } from "@/lib/workspace-path";

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

  const auth = authenticateUser(username, password);
  if (!auth.ok) {
    if (!process.env.KUPA_ADMIN_USERNAME && !process.env.KUPA_TEST_ADMIN_USERNAME) {
      return jsonError(503, "התחברות אינה מוגדרת");
    }
    return jsonError(401, "שם משתמש או סיסמה אינם נכונים");
  }

  const token = createSessionToken(auth.account.username);
  const accountId = resolveAccountIdFromSession(auth.account.username);
  let workspaceFingerprint = "n/a";
  try {
    const path = accountWorkspacePath(accountId);
    if (path) {
      const digest = path.replace(/^workspaces\//, "").replace(/\.json$/, "");
      workspaceFingerprint = shortFingerprint(digest);
    }
  } catch {
    workspaceFingerprint = "n/a";
  }
  const res = securityHeaders(
    NextResponse.json({
      ok: true,
      accountId: auth.account.accountId,
      workspaceFingerprint,
      isTestWorkspace: auth.account.isTest,
      sessionStatus: "authenticated",
    })
  );
  res.cookies.set(SESSION_COOKIE, await token, sessionCookieOptions(isProductionRuntime()));
  return res;
}

export function GET() {
  return jsonError(405, "Method not allowed");
}
