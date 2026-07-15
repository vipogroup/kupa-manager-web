import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "./session";
import { extractSessionToken } from "./security";
import { dataContentSha256 } from "./sync-snapshot";
import { emptyData } from "./types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DESKTOP-RO API contracts", () => {
  beforeEach(() => {
    process.env.KUPA_SESSION_SECRET = "x".repeat(48);
  });

  it("DESKTOP-RO-001 Bearer extract from Authorization", async () => {
    const token = await createSessionToken("admin");
    const req = new NextRequest("https://example.test/api/desktop/snapshot", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(extractSessionToken(req)).toBe(token);
  });

  it("DESKTOP-RO-002 Cookie still works", async () => {
    const token = await createSessionToken("admin");
    const req = new NextRequest("https://example.test/api/desktop/snapshot", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(extractSessionToken(req)).toBe(token);
  });

  it("DESKTOP-RO-003 Snapshot route GET-only / no save", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/desktop/snapshot/route.ts"), "utf8");
    expect(src).toContain("export async function GET");
    expect(src).toContain("Method not allowed");
    expect(src).toContain("readAccountWorkspaceSnapshot");
    expect(src).not.toContain("saveAccountWorkspaceGuarded");
    expect(src).toContain("readOnly: true");
    expect(src).toContain("contentSha256");
  });

  it("DESKTOP-RO-004 Anonymous requires session helper", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/desktop/snapshot/route.ts"), "utf8");
    expect(src).toContain("requireSession");
  });

  it("DESKTOP-RO-005 No blob URL / hmac in snapshot response builder", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/desktop/snapshot/route.ts"), "utf8");
    expect(src).not.toMatch(/blobUrl/);
    expect(src).not.toMatch(/accountWorkspacePath\(/);
    expect(src).toContain("accountBound: true");
  });

  it("DESKTOP-RO-006 Login returns bearer token contract", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/desktop/login/route.ts"), "utf8");
    expect(src).toContain("createSessionToken");
    expect(src).toContain("tokenType");
    expect(src).toContain("Bearer");
    expect(src).not.toContain("validateOrigin");
    expect(src).toContain("verifyPassword");
    expect(src).toMatch(/Method not allowed/);
  });

  it("DESKTOP-RO-007 Middleware allows desktop login + Bearer", () => {
    const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(src).toContain("/api/desktop/login");
    expect(src).toContain("Bearer");
  });

  it("DESKTOP-RO-008 contentSha256 stable helper", () => {
    const d = emptyData();
    expect(dataContentSha256(d)).toBe(dataContentSha256(d));
  });

  it("DESKTOP-RO-009 Rate limit ids registered", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/rate-limit.ts"), "utf8");
    expect(src).toContain("desktopLogin");
    expect(src).toContain("desktopSnapshot");
  });
});
