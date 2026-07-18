import { NextRequest, NextResponse } from "next/server";
import { requireSession, securityHeaders, jsonError } from "@/lib/security";
import {
  resolveAccountIdFromSession,
  shortFingerprint,
  PRIMARY_ACCOUNT_ID,
  TEST_ACCOUNT_ID,
} from "@/lib/account-workspace";
import { accountWorkspacePath } from "@/lib/workspace-path";
import { readAccountWorkspaceSnapshot } from "@/lib/cloud";

export const runtime = "nodejs";

/** Mask account id for on-screen proof (never a secret, but avoid full dump in screenshots). */
function maskAccountId(accountId: string): string {
  const s = String(accountId || "");
  if (s.length <= 6) return "***";
  return `${s.slice(0, 4)}…${s.slice(-3)}`;
}

/**
 * Safe session/workspace proof for Web/Mobile.
 * Returns no tokens, cookies, or storage paths.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const accountId = resolveAccountIdFromSession(session.username);
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

  let revision = 0;
  try {
    const snap = await readAccountWorkspaceSnapshot(accountId);
    if (snap.exists && snap.snapshot) revision = snap.snapshot.revision;
  } catch {
    revision = 0;
  }

  return securityHeaders(
    NextResponse.json({
      ok: true,
      accountIdMasked: maskAccountId(accountId),
      accountKind:
        accountId === TEST_ACCOUNT_ID
          ? "test"
          : accountId === PRIMARY_ACCOUNT_ID
            ? "primary"
            : "other",
      workspaceFingerprint,
      revision,
      isTestWorkspace: accountId === TEST_ACCOUNT_ID,
      sessionStatus: "authenticated",
    })
  );
}

export function POST() {
  return jsonError(405, "Method not allowed");
}
