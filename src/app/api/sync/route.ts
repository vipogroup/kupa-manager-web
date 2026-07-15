import { NextRequest, NextResponse } from "next/server";
import { cloudMode, readWorkspaceSnapshot, saveWorkspaceGuarded } from "@/lib/cloud";
import { sanitizeCode } from "@/lib/sanitize";
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

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(RATE_IDS.syncGet, req);
  if (limited) return securityHeaders(limited);

  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const code = sanitizeCode(req.nextUrl.searchParams.get("code") || "");
  if (!code) return jsonError(400, "חסר קוד סביבה");

  try {
    const result = await readWorkspaceSnapshot(code);
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
  const code = sanitizeCode(typeof value.code === "string" ? value.code : "");
  if (!code) return jsonError(400, "חסר קוד סביבה");

  const deviceId = sanitizeDeviceId(value.deviceId);
  if (!deviceId) return jsonError(400, "מזהה מכשיר לא תקין");

  if (typeof value.baseRevision !== "number" || !Number.isInteger(value.baseRevision) || value.baseRevision < 0) {
    return jsonError(400, "baseRevision לא תקין");
  }

  const validated = validateAppData(value.data);
  if (!validated.ok) return jsonError(400, "מבנה נתונים לא תקין");

  try {
    const result = await saveWorkspaceGuarded({
      code,
      baseRevision: value.baseRevision,
      deviceId,
      data: validated.data,
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
