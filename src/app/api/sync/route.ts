import { NextRequest, NextResponse } from "next/server";
import { cloudMode, readWorkspace, writeWorkspace } from "@/lib/cloud";
import { emptyData } from "@/lib/types";
import { sanitizeCode } from "@/lib/sanitize";
import { validateAppData } from "@/lib/validate-data";
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
    const data = await readWorkspace(code);
    if (!data) {
      return securityHeaders(
        NextResponse.json({
          ok: true,
          mode: cloudMode(),
          data: emptyData(),
          exists: false,
        })
      );
    }
    return securityHeaders(
      NextResponse.json({
        ok: true,
        mode: cloudMode(),
        data,
        exists: true,
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

  const value = body.value as { code?: unknown; data?: unknown };
  const code = sanitizeCode(typeof value.code === "string" ? value.code : "");
  if (!code) return jsonError(400, "חסר קוד סביבה");

  const validated = validateAppData(value.data);
  if (!validated.ok) return jsonError(400, "מבנה נתונים לא תקין");

  try {
    await writeWorkspace(code, validated.data);
    return securityHeaders(
      NextResponse.json({
        ok: true,
        mode: cloudMode(),
        updatedAt: new Date().toISOString(),
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
