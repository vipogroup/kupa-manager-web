import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { securityHeaders } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const result = await verifySessionToken(token);
  if (!result.ok) {
    return securityHeaders(NextResponse.json({ ok: false, authenticated: false }, { status: 401 }));
  }
  return securityHeaders(
    NextResponse.json({ ok: true, authenticated: true, username: result.username })
  );
}
