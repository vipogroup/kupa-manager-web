import { NextRequest, NextResponse } from "next/server";
import { cloudMode, readAccountWorkspaceSnapshot } from "@/lib/cloud";
import { resolveAccountIdFromSession } from "@/lib/account-workspace";
import { dataContentSha256 } from "@/lib/sync-snapshot";
import { validateAppData } from "@/lib/validate-data";
import { jsonError, requireSession, securityHeaders } from "@/lib/security";
import { RATE_IDS, enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Read-only desktop cloud snapshot.
 * - Auth: cookie or Bearer (Windows)
 * - Workspace: server-side account mapping only
 * - No PUT/write, no revision bump, no backup creation
 * - Never returns Blob URL / HMAC path / secrets
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(RATE_IDS.desktopSnapshot, req);
  if (limited) return securityHeaders(limited);

  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const accountId = resolveAccountIdFromSession(session.username);

  try {
    const result = await readAccountWorkspaceSnapshot(accountId);
    if (!result.exists) {
      return securityHeaders(
        NextResponse.json({
          ok: true,
          mode: cloudMode(),
          exists: false,
          readOnly: true,
          revision: null,
          updatedAt: null,
          schemaVersion: null,
          contentSha256: null,
          etag: null,
          data: null,
          accountBound: true,
          counts: {
            customers: 0,
            products: 0,
            orders: 0,
            deliveries: 0,
            inventoryMovements: 0,
            incomes: 0,
            expenses: 0,
          },
        })
      );
    }

    const validated = validateAppData(result.snapshot.data);
    if (!validated.ok) {
      return jsonError(500, "נתוני ענן אינם תקינים");
    }

    const data = validated.data;
    const contentSha = dataContentSha256(data);
    const etag = result.etag || `"${contentSha.slice(0, 32)}"`;

    return securityHeaders(
      NextResponse.json({
        ok: true,
        mode: cloudMode(),
        exists: true,
        readOnly: true,
        revision: result.snapshot.revision,
        updatedAt: result.snapshot.updatedAt,
        schemaVersion: result.snapshot.schemaVersion,
        legacy: result.snapshot.legacy,
        contentSha256: contentSha,
        etag,
        data,
        accountBound: true,
        counts: {
          customers: (data.customers || []).length,
          products: (data.products || []).length,
          orders: (data.orders || []).length,
          deliveries: (data.deliveries || []).length,
          inventoryMovements: (data.inventoryMovements || []).length,
          incomes: (data.incomes || []).length,
          expenses: (data.expenses || []).length,
        },
      })
    );
  } catch {
    return jsonError(500, "שגיאת שרת");
  }
}

export function POST() {
  return jsonError(405, "Method not allowed");
}

export function PUT() {
  return jsonError(405, "Method not allowed");
}

export function DELETE() {
  return jsonError(405, "Method not allowed");
}
