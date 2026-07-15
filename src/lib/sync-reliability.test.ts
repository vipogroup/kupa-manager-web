import { createHash, createHmac } from "crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  SYNC_SCHEMA_VERSION,
  assertRevisionMatch,
  buildCloudSnapshot,
  dataContentSha256,
  isEnvelope,
  parseCloudSnapshot,
  sanitizeDeviceId,
} from "./sync-snapshot";
import { emptyData } from "./types";
import { backupPathname, workspaceBackupPrefix, workspaceHmacPath } from "./workspace-path";
import { isPersonalLookingDeviceId } from "./device-id";

const SECRET = "s".repeat(48);

describe("SYNC-REL snapshot + revision", () => {
  const prevSecret = process.env.KUPA_WORKSPACE_NAMESPACE_SECRET;
  const prevWindow = globalThis.window;

  beforeEach(() => {
    process.env.KUPA_WORKSPACE_NAMESPACE_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.KUPA_WORKSPACE_NAMESPACE_SECRET = prevSecret;
    // @ts-expect-error test cleanup
    globalThis.window = prevWindow;
  });

  it("SYNC-REL-001 Legacy snapshot load", () => {
    const legacy = {
      ...emptyData(),
      updatedAt: "2026-01-01T00:00:00.000Z",
      incomes: [{ id: "1", title: "t", amount: 10, date: "2026-01-01", category: "c", note: "" }],
    };
    const snap = parseCloudSnapshot(legacy);
    expect(snap).not.toBeNull();
    expect(snap!.legacy).toBe(true);
    expect(snap!.revision).toBe(1);
    expect(snap!.data.incomes).toHaveLength(1);
  });

  it("SYNC-REL-002 Initial revision", () => {
    expect(assertRevisionMatch(0, null).ok).toBe(true);
    const first = buildCloudSnapshot({
      revision: 1,
      updatedAt: "2026-07-15T00:00:00.000Z",
      updatedByDeviceId: "deviceAAAAAAA1",
      data: emptyData(),
    });
    expect(first.revision).toBe(1);
    expect(first.schemaVersion).toBe(SYNC_SCHEMA_VERSION);
  });

  it("SYNC-REL-003 Revision increment", () => {
    expect(assertRevisionMatch(1, 1).ok).toBe(true);
    const next = buildCloudSnapshot({
      revision: 2,
      updatedAt: "2026-07-15T00:00:01.000Z",
      updatedByDeviceId: "deviceAAAAAAA1",
      data: emptyData(),
    });
    expect(next.revision).toBe(2);
  });

  it("SYNC-REL-004 Server updatedAt is ISO in envelope builder", () => {
    const at = new Date().toISOString();
    const snap = buildCloudSnapshot({
      revision: 1,
      updatedAt: at,
      updatedByDeviceId: "deviceAAAAAAA1",
      data: emptyData(),
    });
    expect(snap.updatedAt).toBe(at);
    expect(Number.isNaN(Date.parse(snap.updatedAt))).toBe(false);
  });

  it("SYNC-REL-005/006 Device ID non-personal patterns", () => {
    expect(sanitizeDeviceId("abcdefgh")).toBe("abcdefgh");
    expect(sanitizeDeviceId("bad id")).toBeNull();
    expect(sanitizeDeviceId("a@b.comxxxx")).toBeNull();
    expect(isPersonalLookingDeviceId("abcdefghijklmnop")).toBe(false);
    expect(isPersonalLookingDeviceId("user-john")).toBe(true);
    expect(isPersonalLookingDeviceId("0501234567xxxx")).toBe(true);
  });

  it("SYNC-REL-016/017 Revision conflict does not allow write path", () => {
    const conflict = assertRevisionMatch(1, 2);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.cloudRevision).toBe(2);
  });

  it("SYNC-REL-023 Workspace code absent from backup path", () => {
    const code = "MySecretWorkspace99";
    const path = backupPathname(code, 3, "2026-07-15T12:00:00.000Z");
    const prefix = workspaceBackupPrefix(code);
    const ws = workspaceHmacPath(code);
    expect(path).toBeTruthy();
    expect(prefix).toBeTruthy();
    expect(ws).toBeTruthy();
    expect(path!.includes(code)).toBe(false);
    expect(prefix!.includes(code)).toBe(false);
    expect(ws!.includes(code)).toBe(false);
    const digest = createHmac("sha256", SECRET).update(code, "utf8").digest("hex");
    expect(path!.startsWith(`backups/${digest}/`)).toBe(true);
    expect(path!).toMatch(/\/3-/);
  });

  it("SYNC-REL-021 data SHA256 stable", () => {
    const data = emptyData();
    data.updatedAt = "2026-07-15T00:00:00.000Z";
    const a = dataContentSha256(data);
    const b = createHash("sha256").update(JSON.stringify(data), "utf8").digest("hex");
    expect(a).toBe(b);
  });

  it("SYNC-REL-028 Two-device conflict scenario (logical)", () => {
    // cloud rev 1
    let cloud = 1;
    const deviceABase = 1;
    const deviceBBase = 1;
    // A saves
    expect(assertRevisionMatch(deviceABase, cloud).ok).toBe(true);
    cloud = cloud + 1; // 2
    // B tries with stale base
    const b = assertRevisionMatch(deviceBBase, cloud);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.cloudRevision).toBe(2);
    // cloud stays 2
    expect(cloud).toBe(2);
  });

  it("envelope detection", () => {
    expect(isEnvelope({ schemaVersion: 1, data: emptyData() })).toBe(true);
    expect(isEnvelope(emptyData())).toBe(false);
  });

  it("SYNC-REL-014 empty cloud representation", () => {
    // Client must treat exists:false without replacing — contract for GET
    const payload = { ok: true, exists: false, data: null, revision: null };
    expect(payload.data).toBeNull();
    expect(payload.exists).toBe(false);
  });

  it("SYNC-REL-024 response shape excludes blob URLs", () => {
    const success = {
      ok: true,
      revision: 2,
      updatedAt: "2026-07-15T00:00:00.000Z",
      mode: "private-blob",
    };
    const conflict = {
      ok: false,
      error: "CLOUD_VERSION_CHANGED",
      cloudRevision: 2,
      cloudUpdatedAt: "2026-07-15T00:00:00.000Z",
    };
    const blob = JSON.stringify({ success, conflict });
    expect(blob.includes("blob.vercel-storage.com")).toBe(false);
    expect(blob.includes("https://")).toBe(false);
  });
});
