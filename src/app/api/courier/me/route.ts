import { NextRequest, NextResponse } from "next/server";
import { securityHeaders } from "@/lib/security";
import { requireCourierAccess } from "@/lib/courier-guard";
import { todayYmd } from "@/lib/courier-access";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await requireCourierAccess(req);
  if (ctx instanceof NextResponse) return ctx;

  return securityHeaders(
    NextResponse.json({
      ok: true,
      role: "courier",
      driverName: ctx.driver.displayName,
      driverId: ctx.driver.id,
      today: todayYmd(),
      access: {
        isActive: ctx.access.isActive,
        allowedDateMode: ctx.access.allowedDateMode,
        allowedDateFrom: ctx.access.allowedDateFrom || null,
        allowedDateTo: ctx.access.allowedDateTo || null,
        canViewPhone: ctx.access.canViewPhone,
        canViewCashCollection: ctx.access.canViewCashCollection,
        canOpenNavigation: ctx.access.canOpenNavigation,
      },
    })
  );
}

export function POST() {
  return securityHeaders(NextResponse.json({ error: "Method not allowed" }, { status: 405 }));
}
