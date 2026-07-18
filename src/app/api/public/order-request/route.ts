import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_IDS } from "@/lib/rate-limit";
import {
  assertJsonContentType,
  jsonError,
  readJsonLimited,
  securityHeaders,
} from "@/lib/security";
import { resolvePublicVendor } from "@/lib/public-form-vendor";
import { readAccountWorkspaceSnapshot, saveAccountWorkspaceGuarded } from "@/lib/cloud";
import { validateAndCreateOrderRequest, type PublicSubmitInput } from "@/lib/customer-order-requests";
import { finalizeMutatedData } from "@/lib/desktop-mutate";

export const runtime = "nodejs";

function hashIp(ip: string): string {
  const salt = process.env.KUPA_PUBLIC_FORM_SECRET || process.env.KUPA_WORKSPACE_NAMESPACE_SECRET || "x";
  return createHash("sha256").update(`ip:${salt}:${ip}`, "utf8").digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(RATE_IDS.syncPut, req);
  if (limited) return securityHeaders(limited);

  const ctErr = assertJsonContentType(req);
  if (ctErr) return ctErr;

  const body = await readJsonLimited(req);
  if (!body.ok) return body.response;

  const value = body.value as Record<string, unknown>;
  const vendor = typeof value.vendor === "string" ? value.vendor : "";
  const resolved = resolvePublicVendor(vendor);
  if (!resolved.ok) return jsonError(400, resolved.error);

  // Reject admin-shaped payloads
  for (const banned of ["data", "snapshot", "orders", "customers", "revision", "workspaceId", "accountId"]) {
    if (banned in value) return jsonError(400, "בקשה אינה תקינה");
  }

  const input: PublicSubmitInput = {
    fullName: String(value.fullName || ""),
    phone: String(value.phone || ""),
    secondaryPhone: String(value.secondaryPhone || ""),
    email: String(value.email || ""),
    city: String(value.city || ""),
    street: String(value.street || ""),
    houseNumber: String(value.houseNumber || ""),
    entrance: String(value.entrance || ""),
    floor: String(value.floor || ""),
    apartment: String(value.apartment || ""),
    elevator: String(value.elevator || ""),
    accessNotes: String(value.accessNotes || ""),
    items: Array.isArray(value.items) ? (value.items as PublicSubmitInput["items"]) : [],
    requestedDeliveryDate: String(value.requestedDeliveryDate || ""),
    requestedPaymentMethod: String(value.requestedPaymentMethod || "cashOnDelivery"),
    cashCollectionRequested:
      typeof value.cashCollectionRequested === "number" ? value.cashCollectionRequested : undefined,
    customerNotes: String(value.customerNotes || ""),
    consentAccepted: value.consentAccepted === true,
    honeypot: String(value.website || value.honeypot || ""),
    idempotencyKey: String(value.idempotencyKey || ""),
  };

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0";
  const ua = (req.headers.get("user-agent") || "").slice(0, 120);

  try {
    const current = await readAccountWorkspaceSnapshot(resolved.accountId);
    const baseData = current.exists && current.snapshot?.data ? current.snapshot.data : null;
    if (!baseData) {
      return jsonError(503, "סביבת העסק אינה מוכנה לקבלת בקשות");
    }
    const baseRevision = current.exists ? current.snapshot!.revision : 0;

    const created = validateAndCreateOrderRequest(baseData, input, {
      sourceIpHash: hashIp(ip),
      userAgentSummary: ua,
      publicFormVersion: "1",
    });
    if (!created.ok) {
      const status = created.code === "HONEYPOT" ? 400 : 422;
      return jsonError(status, created.error);
    }

    if (created.duplicate) {
      return securityHeaders(
        NextResponse.json({
          ok: true,
          duplicate: true,
          reference: created.request.requestNumber,
          message: "הבקשה כבר התקבלה",
        })
      );
    }

    const finalized = finalizeMutatedData(created.data);
    if (!finalized.ok) return jsonError(400, "שמירת הבקשה נכשלה");

    const saved = await saveAccountWorkspaceGuarded({
      accountId: resolved.accountId,
      baseRevision,
      deviceId: "public-order-form",
      data: finalized.data,
    });

    if (!saved.ok && saved.kind === "conflict") {
      // Retry once after reload
      const again = await readAccountWorkspaceSnapshot(resolved.accountId);
      if (!again.exists || !again.snapshot?.data) return jsonError(409, "הנתונים השתנו — נסו שוב");
      const retry = validateAndCreateOrderRequest(again.snapshot.data, input, {
        sourceIpHash: hashIp(ip),
        userAgentSummary: ua,
        publicFormVersion: "1",
      });
      if (!retry.ok) return jsonError(422, retry.error);
      if (retry.duplicate) {
        return securityHeaders(
          NextResponse.json({
            ok: true,
            duplicate: true,
            reference: retry.request.requestNumber,
            message: "הבקשה כבר התקבלה",
          })
        );
      }
      const fin2 = finalizeMutatedData(retry.data);
      if (!fin2.ok) return jsonError(400, "שמירת הבקשה נכשלה");
      const saved2 = await saveAccountWorkspaceGuarded({
        accountId: resolved.accountId,
        baseRevision: again.snapshot.revision,
        deviceId: "public-order-form",
        data: fin2.data,
      });
      if (!saved2.ok) return jsonError(500, "שמירה נכשלה");
      return securityHeaders(
        NextResponse.json({
          ok: true,
          duplicate: false,
          reference: retry.request.requestNumber,
          message: "הבקשה התקבלה בהצלחה",
        })
      );
    }

    if (!saved.ok) return jsonError(500, "שמירה נכשלה");

    return securityHeaders(
      NextResponse.json({
        ok: true,
        duplicate: false,
        reference: created.request.requestNumber,
        message: "הבקשה התקבלה בהצלחה",
      })
    );
  } catch {
    return jsonError(500, "שגיאת שרת");
  }
}

export function GET() {
  return jsonError(405, "Method not allowed");
}
