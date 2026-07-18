import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_IDS } from "@/lib/rate-limit";
import { jsonError, securityHeaders } from "@/lib/security";
import { resolvePublicVendor } from "@/lib/public-form-vendor";
import { readAccountWorkspaceSnapshot } from "@/lib/cloud";
import { buildPublicCatalog } from "@/lib/customer-order-requests";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(RATE_IDS.syncGet, req);
  if (limited) return securityHeaders(limited);

  const vendor = req.nextUrl.searchParams.get("vendor") || "";
  const resolved = resolvePublicVendor(vendor);
  if (!resolved.ok) return jsonError(400, resolved.error);

  try {
    const snap = await readAccountWorkspaceSnapshot(resolved.accountId);
    const products = snap.exists && snap.snapshot?.data?.products ? snap.snapshot.data.products : [];
    const catalog = buildPublicCatalog(products);
    return securityHeaders(
      NextResponse.json({
        ok: true,
        items: catalog,
        formVersion: "1",
      })
    );
  } catch {
    return jsonError(503, "קטלוג אינו זמין כרגע");
  }
}
