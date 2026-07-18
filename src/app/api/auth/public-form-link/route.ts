import { NextRequest, NextResponse } from "next/server";
import { requireSession, securityHeaders, jsonError } from "@/lib/security";
import { resolveAccountIdFromSession } from "@/lib/account-workspace";
import { publicVendorTokenForAccount } from "@/lib/public-form-vendor";

export const runtime = "nodejs";

/** Authenticated managers can copy the public form URL for their account. */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  try {
    const accountId = resolveAccountIdFromSession(session.username);
    const vendor = publicVendorTokenForAccount(accountId);
    const origin = req.nextUrl.origin;
    const url = `${origin}/order-request?vendor=${encodeURIComponent(vendor)}`;
    return securityHeaders(
      NextResponse.json({
        ok: true,
        url,
        // vendor is a signed public id, not a workspace path
        vendor,
      })
    );
  } catch {
    return jsonError(503, "קישור הטופס אינו מוגדר");
  }
}
