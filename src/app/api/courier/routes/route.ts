import { NextRequest, NextResponse } from "next/server";
import { securityHeaders, jsonError } from "@/lib/security";
import { requireCourierAccess } from "@/lib/courier-guard";
import { listCourierRoutesForDate, todayYmd } from "@/lib/courier-access";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await requireCourierAccess(req);
  if (ctx instanceof NextResponse) return ctx;

  const date = req.nextUrl.searchParams.get("date") || todayYmd();
  const listed = listCourierRoutesForDate(ctx.data, ctx.access, date);
  if (!listed.ok) {
    return jsonError(403, listed.code);
  }

  const totalCash = listed.routes.reduce((s, r) => s + (r.totalCashToCollect || 0), 0);
  const stopCount = listed.routes.reduce((s, r) => s + r.stopCount, 0);
  const withCash = listed.routes.reduce((s, r) => s + r.stopsWithCash, 0);

  return securityHeaders(
    NextResponse.json({
      ok: true,
      date,
      driverName: ctx.driver.displayName,
      routeCount: listed.routes.length,
      stopCount,
      stopsWithCash: withCash,
      totalCashToCollect: Math.round(totalCash * 100) / 100,
      serverTotalVerified: listed.routes.every((r) => r.serverTotalVerified),
      fetchedAt: new Date().toISOString(),
      routes: listed.routes.map((r) => ({
        id: r.id,
        routeNumber: r.routeNumber,
        routeName: r.routeName,
        routeDate: r.routeDate,
        planningStatus: r.planningStatus,
        vehicleLabel: r.vehicleLabel,
        areaLabel: r.areaLabel,
        stopCount: r.stopCount,
        stopsWithCash: r.stopsWithCash,
        stopsWithoutCash: r.stopsWithoutCash,
        totalCashToCollect: r.totalCashToCollect,
        serverTotalVerified: r.serverTotalVerified,
        updatedAt: r.updatedAt,
        stops: r.stops,
      })),
    })
  );
}

export function POST() {
  return jsonError(405, "Method not allowed");
}
