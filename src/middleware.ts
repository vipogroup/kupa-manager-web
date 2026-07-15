import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login")
  ) {
    return NextResponse.next();
  }

  // Session verify needs secret; if missing, fail closed for app pages.
  let session: Awaited<ReturnType<typeof verifySessionToken>>;
  try {
    session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    session = { ok: false, reason: "invalid" };
  }

  if (pathname.startsWith("/api/")) {
    if (!session.ok) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!session.ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
