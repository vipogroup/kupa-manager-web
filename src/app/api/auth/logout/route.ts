import { NextResponse } from "next/server";
import { SESSION_COOKIE, isProductionRuntime } from "@/lib/session";
import { jsonError, securityHeaders } from "@/lib/security";

export const runtime = "nodejs";

export async function POST() {
  const res = securityHeaders(NextResponse.json({ ok: true }));
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export function GET() {
  return jsonError(405, "Method not allowed");
}
