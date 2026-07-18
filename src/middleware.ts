import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

function extractToken(req: NextRequest): string | undefined {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) return cookie;
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return m?.[1];
}

function isCourierUsername(username: string): boolean {
  const testCourier = (process.env.KUPA_TEST_COURIER_USERNAME || "").trim();
  const primaryCourier = (process.env.KUPA_COURIER_USERNAME || "").trim();
  return Boolean(
    (testCourier && username === testCourier) || (primaryCourier && username === primaryCourier)
  );
}

function courierApiAllowed(pathname: string): boolean {
  if (pathname.startsWith("/api/courier/")) return true;
  if (pathname.startsWith("/api/auth/logout")) return true;
  if (pathname.startsWith("/api/auth/session")) return true;
  if (pathname.startsWith("/api/auth/whoami")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/login" ||
    pathname.startsWith("/order-request") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/desktop/login") ||
    pathname.startsWith("/api/public/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/")
  ) {
    return NextResponse.next();
  }

  let session: Awaited<ReturnType<typeof verifySessionToken>>;
  try {
    session = await verifySessionToken(extractToken(req));
  } catch {
    session = { ok: false, reason: "invalid" };
  }

  if (pathname.startsWith("/api/")) {
    if (!session.ok) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }
    if (isCourierUsername(session.username) && !courierApiAllowed(pathname)) {
      return NextResponse.json({ error: "COURIER_MODULE_FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (!session.ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isCourierUsername(session.username)) {
    if (!pathname.startsWith("/courier")) {
      const url = req.nextUrl.clone();
      url.pathname = "/courier";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
