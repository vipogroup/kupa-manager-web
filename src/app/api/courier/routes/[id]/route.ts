import { NextRequest, NextResponse } from "next/server";
import { securityHeaders, jsonError } from "@/lib/security";
import { requireCourierAccess } from "@/lib/courier-guard";
import { getCourierRouteById } from "@/lib/courier-access";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctxParams: Ctx) {
  const ctx = await requireCourierAccess(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await ctxParams.params;
  const got = getCourierRouteById(ctx.data, ctx.access, String(id || ""));
  if (!got.ok) {
    return jsonError(403, got.code);
  }

  return securityHeaders(
    NextResponse.json({
      ok: true,
      driverName: ctx.driver.displayName,
      fetchedAt: new Date().toISOString(),
      route: got.route,
    })
  );
}

export function POST() {
  return jsonError(405, "Method not allowed");
}
