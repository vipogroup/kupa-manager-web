import { NextRequest, NextResponse } from "next/server";
import { resolveAccountIdFromSession } from "@/lib/account-workspace";
import {
  readIdempotencyReceipt,
  sanitizeIdempotencyKey,
  writeIdempotencyReceipt,
} from "@/lib/desktop-idempotency";
import {
  applyDesktopMutation,
  etagsMatch,
  finalizeMutatedData,
  isDesktopMutateAction,
} from "@/lib/desktop-mutate";
import { cloudMode, readAccountWorkspaceSnapshot, saveAccountWorkspaceGuarded } from "@/lib/cloud";
import { dataContentSha256, sanitizeDeviceId } from "@/lib/sync-snapshot";
import { emptyData } from "@/lib/types";
import {
  assertJsonContentType,
  jsonError,
  readJsonLimited,
  requireSession,
  securityHeaders,
} from "@/lib/security";
import { RATE_IDS, enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Controlled desktop cloud write.
 * Allowlisted actionType only — never accepts arbitrary snapshot patches.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(RATE_IDS.desktopMutate, req);
    if (limited) return securityHeaders(limited);

    const session = await requireSession(req);
    if (session instanceof NextResponse) return session;

    const ctErr = assertJsonContentType(req);
    if (ctErr) return ctErr;

    const body = await readJsonLimited(req);
    if (!body.ok) return body.response;

    const value = body.value as Record<string, unknown>;
    if (value.data !== undefined || value.snapshot !== undefined || value.patch !== undefined) {
      return jsonError(400, "עדכון כללי של Snapshot אינו מותר");
    }

    const actionType = value.actionType;
    if (!isDesktopMutateAction(actionType)) {
      return jsonError(400, "סוג פעולה אינו מותר");
    }

    const expectedRevision = Number(value.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return jsonError(400, "expectedRevision חובה");
    }

    const expectedETag =
      typeof value.expectedETag === "string"
        ? value.expectedETag
        : typeof value.ifMatch === "string"
          ? value.ifMatch
          : "";
    if (!expectedETag.trim() && expectedRevision > 0) {
      return jsonError(400, "expectedETag חובה");
    }

    const idempotencyKey = sanitizeIdempotencyKey(value.idempotencyKey);
    if (!idempotencyKey) {
      return jsonError(400, "idempotencyKey חובה");
    }

    const deviceId = sanitizeDeviceId(value.deviceId) || sanitizeDeviceId("windows-desktop-client");
    if (!deviceId) {
      return jsonError(400, "deviceId אינו תקין");
    }

    const payload = value.payload;
    if (payload === undefined || payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonError(400, "payload חובה");
    }

    const accountId = resolveAccountIdFromSession(session.username);

    const prior = await readIdempotencyReceipt(accountId, idempotencyKey);
    if (prior && prior.actionType === actionType) {
      return securityHeaders(
        NextResponse.json({
          ...prior.response,
          idempotentReplay: true,
        })
      );
    }

    let current;
    try {
      current = await readAccountWorkspaceSnapshot(accountId);
    } catch {
      return jsonError(500, "שגיאת קריאת ענן");
    }

    const cloudRevision = current.exists ? current.snapshot.revision : 0;
    if (expectedRevision !== cloudRevision) {
      return securityHeaders(
        NextResponse.json(
          {
            error: "הנתונים השתנו במכשיר אחר. יש לרענן את נתוני הענן לפני שמירה.",
            code: "CLOUD_VERSION_CHANGED",
            cloudRevision,
            cloudUpdatedAt: current.exists ? current.snapshot.updatedAt : "",
          },
          { status: 409 }
        )
      );
    }

    if (current.exists && expectedETag.trim()) {
      if (!etagsMatch(expectedETag, current.etag)) {
        return securityHeaders(
          NextResponse.json(
            {
              error: "הנתונים השתנו במכשיר אחר. יש לרענן את נתוני הענן לפני שמירה.",
              code: "CLOUD_ETAG_CHANGED",
              cloudRevision,
              cloudUpdatedAt: current.snapshot.updatedAt,
            },
            { status: 409 }
          )
        );
      }
    }

    const baseData = current.exists ? current.snapshot.data : emptyData();
    const applied = applyDesktopMutation(baseData, actionType, payload);
    if (!applied.ok) {
      return jsonError(422, applied.error);
    }

    const finalized = finalizeMutatedData(applied.data);
    if (!finalized.ok) {
      return jsonError(422, finalized.error);
    }

    const saved = await saveAccountWorkspaceGuarded({
      accountId,
      baseRevision: expectedRevision,
      deviceId,
      data: finalized.data,
    });

    if (!saved.ok) {
      if (saved.kind === "conflict") {
        return securityHeaders(
          NextResponse.json(
            {
              error: "הנתונים השתנו במכשיר אחר. יש לרענן את נתוני הענן לפני שמירה.",
              code: "CLOUD_VERSION_CHANGED",
              cloudRevision: saved.cloudRevision,
              cloudUpdatedAt: saved.cloudUpdatedAt,
            },
            { status: 409 }
          )
        );
      }
      if (saved.message === "rollback_failed") {
        return jsonError(500, "שמירה נכשלה ואימות שחזור נכשל");
      }
      if (String(saved.message || "").startsWith("readback_")) {
        return jsonError(500, "שמירה נכשלה באימות קריאה חוזרת");
      }
      return jsonError(500, "שמירת ענן נכשלה");
    }

    let readBack;
    try {
      readBack = await readAccountWorkspaceSnapshot(accountId);
    } catch {
      return jsonError(500, "אימות קריאה חוזרת נכשל");
    }
    if (!readBack.exists || readBack.snapshot.revision !== saved.revision) {
      return jsonError(500, "אימות קריאה חוזרת נכשל");
    }
    const contentSha = dataContentSha256(readBack.snapshot.data);
    const readBackVerified =
      dataContentSha256(finalized.data) === contentSha &&
      readBack.snapshot.revision === saved.revision;

    if (!readBackVerified) {
      return jsonError(500, "אימות קריאה חוזרת נכשל");
    }

    const responseBody = {
      success: true,
      ok: true,
      actionType,
      newRevision: saved.revision,
      newETag: readBack.etag,
      contentSha256: contentSha,
      updatedRecord: applied.record,
      recordKind: applied.recordKind,
      readBackVerified: true,
      serverTimestamp: saved.updatedAt,
      mode: cloudMode(),
      accountBound: true,
    };

    try {
      await writeIdempotencyReceipt(accountId, idempotencyKey, {
        actionType,
        createdAt: new Date().toISOString(),
        response: responseBody as unknown as Record<string, unknown>,
      });
    } catch {
      // Mutation already committed; receipt failure must not flip success to failure.
    }

    return securityHeaders(NextResponse.json(responseBody));
  } catch {
    return jsonError(500, "שגיאת שרת");
  }
}

export function GET() {
  return jsonError(405, "Method not allowed");
}

export function PUT() {
  return jsonError(405, "Method not allowed");
}

export function DELETE() {
  return jsonError(405, "Method not allowed");
}
