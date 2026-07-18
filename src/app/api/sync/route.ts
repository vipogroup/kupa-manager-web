import { NextRequest, NextResponse } from "next/server";
import {
  cloudMode,
  readAccountWorkspaceSnapshot,
  saveAccountWorkspaceGuarded,
} from "@/lib/cloud";
import { resolveAccountIdFromSession } from "@/lib/account-workspace";
import { validateAppData } from "@/lib/validate-data";
import { sanitizeDeviceId } from "@/lib/sync-snapshot";
import {
  assertJsonContentType,
  jsonError,
  readJsonLimited,
  requireSession,
  securityHeaders,
  validateOrigin,
} from "@/lib/security";
import { RATE_IDS, enforceRateLimit } from "@/lib/rate-limit";
import { mergeAppDataPreserveUnknown } from "@/lib/cloud-contract";

export const runtime = "nodejs";

/**
 * Workspace path is derived from authenticated session only.
 * Client-supplied workspace codes are ignored.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(RATE_IDS.syncGet, req);
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
          revision: null,
          updatedAt: null,
          schemaVersion: null,
          data: null,
          accountBound: true,
        })
      );
    }
    return securityHeaders(
      NextResponse.json({
        ok: true,
        mode: cloudMode(),
        exists: true,
        revision: result.snapshot.revision,
        updatedAt: result.snapshot.updatedAt,
        schemaVersion: result.snapshot.schemaVersion,
        legacy: result.snapshot.legacy,
        data: result.snapshot.data,
        accountBound: true,
      })
    );
  } catch {
    return jsonError(500, "שגיאת שרת");
  }
}

export async function PUT(req: NextRequest) {
  const limited = await enforceRateLimit(RATE_IDS.syncPut, req);
  if (limited) return securityHeaders(limited);

  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const originErr = validateOrigin(req);
  if (originErr) return originErr;

  const ctErr = assertJsonContentType(req);
  if (ctErr) return ctErr;

  const body = await readJsonLimited(req);
  if (!body.ok) return body.response;

  const value = body.value as {
    code?: unknown;
    data?: unknown;
    baseRevision?: unknown;
    deviceId?: unknown;
  };

  // Intentionally ignore client `code` — workspace is session-bound.
  void value.code;

  const accountId = resolveAccountIdFromSession(session.username);

  const deviceId = sanitizeDeviceId(value.deviceId);
  if (!deviceId) return jsonError(400, "מזהה מכשיר לא תקין");

  if (typeof value.baseRevision !== "number" || !Number.isInteger(value.baseRevision) || value.baseRevision < 0) {
    return jsonError(400, "baseRevision לא תקין");
  }

  const validated = validateAppData(value.data);
  if (!validated.ok) return jsonError(400, "מבנה נתונים לא תקין");

  try {
    // SAFE merge: preserve unknown top-level keys already in cloud that the client omitted.
    const existing = await readAccountWorkspaceSnapshot(accountId);
    let dataToSave = validated.data;
    const rawData =
      value.data && typeof value.data === "object" && !Array.isArray(value.data)
        ? (value.data as Record<string, unknown>)
        : {};
    if (existing.exists && existing.snapshot?.data) {
      const baseRec = existing.snapshot.data as unknown as Record<string, unknown>;
      const overlayRec = validated.data as unknown as Record<string, unknown>;
      const mergedRec = mergeAppDataPreserveUnknown(baseRec, overlayRec);
      // If overlay omitted a known collection key entirely, keep cloud value (missing ≠ delete).
      // Use RAW client payload for omit detection — validateAppData materializes [] for many keys.
      const preserveIfOmittedOrEmptyWipe = [
        "orders",
        "customers",
        "deliveries",
        "products",
        "inventoryMovements",
        "drivers",
        "vehicles",
        "deliveryRoutes",
        "customerOrderRequests",
        "courierAccess",
        "orderPayments",
        "payments",
        "warehouses",
        "transfers",
        "reversals",
        "reservations",
        "deliveryAreas",
        "deliveryLabels",
        "interfacePreferences",
        "mobilePreferences",
        "metadata",
        "audit",
      ];
      for (const key of preserveIfOmittedOrEmptyWipe) {
        if (!(key in rawData) && key in baseRec) {
          mergedRec[key] = baseRec[key];
          continue;
        }
        // Block silent empty wipe of non-empty cloud collections (stale/partial web clients).
        // Soft-delete / cancel paths keep rows; true empty arrays are almost always a bug.
        if (
          key in rawData &&
          Array.isArray(rawData[key]) &&
          (rawData[key] as unknown[]).length === 0 &&
          Array.isArray(baseRec[key]) &&
          (baseRec[key] as unknown[]).length > 0
        ) {
          mergedRec[key] = baseRec[key];
        }
      }
      const revalidated = validateAppData(mergedRec);
      if (!revalidated.ok) return jsonError(400, "מבנה נתונים לא תקין לאחר מיזוג");
      dataToSave = revalidated.data;
    }

    const result = await saveAccountWorkspaceGuarded({
      accountId,
      baseRevision: value.baseRevision,
      deviceId,
      data: dataToSave,
    });

    if (!result.ok && result.kind === "conflict") {
      return securityHeaders(
        NextResponse.json(
          {
            ok: false,
            error: "CLOUD_VERSION_CHANGED",
            cloudRevision: result.cloudRevision,
            cloudUpdatedAt: result.cloudUpdatedAt,
          },
          { status: 409 }
        )
      );
    }

    if (!result.ok) {
      const map: Record<string, string> = {
        backup_failed: "יצירת גיבוי נכשלה — השמירה בוטלה",
        write_failed: "שגיאת שמירה",
        readback_failed: "אימות שמירה נכשל",
        readback_missing: "אימות שמירה נכשל",
        readback_revision: "אימות שמירה נכשל",
        readback_updatedAt: "אימות שמירה נכשל",
        readback_sha: "אימות שמירה נכשל",
        cloud_read_failed: "קריאת הענן נכשלה",
        invalid_workspace: "סביבת עבודה לא תקינה",
      };
      return jsonError(500, map[result.message] || "שגיאת שמירה");
    }

    return securityHeaders(
      NextResponse.json({
        ok: true,
        mode: cloudMode(),
        revision: result.revision,
        updatedAt: result.updatedAt,
        accountBound: true,
      })
    );
  } catch {
    return jsonError(500, "שגיאת שמירה");
  }
}

export function POST() {
  return jsonError(405, "Method not allowed");
}

export function DELETE() {
  return jsonError(405, "Method not allowed");
}
