import { checkRateLimit } from "@vercel/firewall";
import { NextRequest, NextResponse } from "next/server";

export const RATE_IDS = {
  login: "kupa-login",
  syncGet: "kupa-sync-get",
  syncPut: "kupa-sync-put",
  // Reuse configured Vercel Firewall rules (new rule names cause hard 500s).
  desktopLogin: "kupa-login",
  desktopSnapshot: "kupa-sync-get",
  desktopMutate: "kupa-sync-put",
} as const;

export async function enforceRateLimit(
  id: string,
  req: NextRequest,
  rateLimitKey?: string
): Promise<NextResponse | null> {
  let rateLimited = false;
  let error: string | undefined;
  try {
    const result = await checkRateLimit(id, {
      request: req as unknown as Request,
      headers: req.headers,
      rateLimitKey,
    });
    rateLimited = Boolean(result.rateLimited);
    error = result.error;
  } catch {
    if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "שירות מוגבל זמינות" }, { status: 503 });
    }
    return null;
  }

  if (error === "not-found") {
    // Firewall rule missing — treat as misconfiguration in production.
    if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "שירות מוגבל זמינות" }, { status: 503 });
    }
    // Allow local/dev without firewall rules so unit tests can run.
    return null;
  }

  if (rateLimited || error === "blocked") {
    return NextResponse.json(
      { error: "יותר מדי בקשות. נסו שוב מאוחר יותר." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return null;
}
