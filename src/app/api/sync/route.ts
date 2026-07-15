import { NextRequest, NextResponse } from "next/server";
import { cloudMode, readWorkspace, sanitizeCode, writeWorkspace } from "@/lib/cloud";
import { emptyData, type AppData } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = sanitizeCode(req.nextUrl.searchParams.get("code") || "");
  if (!code) {
    return NextResponse.json({ error: "חסר קוד סביבה" }, { status: 400 });
  }

  const data = await readWorkspace(code);
  return NextResponse.json({
    ok: true,
    mode: cloudMode(),
    data: data ?? emptyData(),
    exists: Boolean(data),
  });
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { code?: string; data?: AppData };
    const code = sanitizeCode(body.code || "");
    if (!code) {
      return NextResponse.json({ error: "חסר קוד סביבה" }, { status: 400 });
    }
    if (!body.data || body.data.version !== 1) {
      return NextResponse.json({ error: "מבנה נתונים לא תקין" }, { status: 400 });
    }

    await writeWorkspace(code, body.data);
    return NextResponse.json({ ok: true, mode: cloudMode(), updatedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שמירה";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
