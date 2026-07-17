import { NextRequest, NextResponse } from "next/server";
import { resolveAccountIdFromSession } from "@/lib/account-workspace";
import { readAccountPreferences, saveAccountPreferencesGuarded } from "@/lib/ui-prefs/prefs-cloud";
import { defaultMobilePreferences, type MobileUiPreferences } from "@/lib/ui-prefs/types";
import { sanitizeHiddenIds } from "@/lib/ui-prefs/presets";
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

  const accountId = resolveAccountIdFromSession(session.username);
  try {
    const result = await readAccountPreferences(accountId);
    if (!result.exists) {
      return securityHeaders(
        NextResponse.json({
          ok: true,
          exists: false,
          revision: 0,
          updatedAt: null,
          preferences: defaultMobilePreferences(),
          accountBound: true,
        })
      );
    }
    return securityHeaders(
      NextResponse.json({
        ok: true,
        exists: true,
        revision: result.envelope.revision,
        updatedAt: result.envelope.updatedAt,
        preferences: result.envelope.preferences,
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
    baseRevision?: unknown;
    deviceId?: unknown;
    preferences?: unknown;
  };

  const accountId = resolveAccountIdFromSession(session.username);
  const deviceId = sanitizeDeviceId(value.deviceId);
  if (!deviceId) return jsonError(400, "מזהה מכשיר לא תקין");

  if (typeof value.baseRevision !== "number" || !Number.isInteger(value.baseRevision) || value.baseRevision < 0) {
    return jsonError(400, "baseRevision לא תקין");
  }

  const raw = value.preferences as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return jsonError(400, "העדפות לא תקינות");

  const preset =
    raw.preset === "basic" ||
    raw.preset === "business" ||
    raw.preset === "full" ||
    raw.preset === "readOnly" ||
    raw.preset === "custom"
      ? raw.preset
      : null;
  if (!preset) return jsonError(400, "preset לא תקין");

  const preferences: MobileUiPreferences = {
    version: 1,
    preset,
    hiddenElementIds: sanitizeHiddenIds(
      Array.isArray(raw.hiddenElementIds)
        ? raw.hiddenElementIds.filter((x): x is string => typeof x === "string")
        : []
    ),
    modulePermissions:
      raw.modulePermissions && typeof raw.modulePermissions === "object" && !Array.isArray(raw.modulePermissions)
        ? (raw.modulePermissions as MobileUiPreferences["modulePermissions"])
        : undefined,
  };

  try {
    const result = await saveAccountPreferencesGuarded({
      accountId,
      baseRevision: value.baseRevision,
      deviceId,
      preferences,
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
    if (!result.ok) return jsonError(500, "שמירת העדפות נכשלה");

    return securityHeaders(
      NextResponse.json({
        ok: true,
        revision: result.revision,
        updatedAt: result.updatedAt,
        preferences: result.preferences,
        accountBound: true,
      })
    );
  } catch {
    return jsonError(500, "שמירת העדפות נכשלה");
  }
}

export function POST() {
  return jsonError(405, "Method not allowed");
}
