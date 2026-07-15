import { checkRateLimit } from "@vercel/firewall";
import { NextRequest, NextResponse } from "next/server";

export const RATE_IDS = {
  login: "kupa-login",
  syncGet: "kupa-sync-get",
  syncPut: "kupa-sync-put",
} as const;

export async function enforceRateLimit(
  id: string,
  req: NextRequest,
  rateLimitKey?: string
): Promise<NextResponse | null> {
  const { rateLimited, error } = await checkRateLimit(id, {
    request: req as unknown as Request,
    headers: req.headers,
    rateLimitKey,
  });

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
