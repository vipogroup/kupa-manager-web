import { NextRequest, NextResponse } from "next/server";
import { SESSION_MAX_AGE_SEC, createSessionToken } from "@/lib/session";
import {
  assertJsonContentType,
  jsonError,
  readJsonLimited,
  securityHeaders,
} from "@/lib/security";
import { RATE_IDS, enforceRateLimit } from "@/lib/rate-limit";
import { authenticateUser } from "@/lib/auth-accounts";
import { resolveAccountIdFromSession, shortFingerprint } from "@/lib/account-workspace";
import { accountWorkspacePath } from "@/lib/workspace-path";

export const runtime = "nodejs";

/**
 * Desktop (Windows) login — returns Bearer session token in JSON body.
 * Does not set browser cookies (Windows stores token via DPAPI).
 * No Origin check: desktop clients do not send browser Origin.
 * Never returns Blob URLs, workspace HMAC, or password material.
 */
export async function POST(req: NextRequest) {
  try {
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

    const auth = authenticateUser(username, password);
    if (!auth.ok) {
      if (!process.env.KUPA_ADMIN_USERNAME && !process.env.KUPA_TEST_ADMIN_USERNAME) {
        return jsonError(503, "התחברות אינה מוגדרת");
      }
      return jsonError(401, "שם משתמש או סיסמה אינם נכונים");
    }

    const token = await createSessionToken(auth.account.username);
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
    return securityHeaders(
      NextResponse.json({
        ok: true,
        token,
        expiresIn: SESSION_MAX_AGE_SEC,
        tokenType: "Bearer",
        readOnly: false,
        writeEnabled: true,
        accountBound: true,
        accountId,
        workspaceFingerprint,
        isTestWorkspace: auth.account.isTest,
        cloudContractVersion: 5,
      })
    );
  } catch {
    return jsonError(500, "שגיאת שרת");
  }
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
