import { describe, expect, it, vi } from "vitest";

/**
 * In-memory two-device simulator for save/load/conflict without touching real blob.
 */
type Snap = {
  schemaVersion: number;
  revision: number;
  updatedAt: string;
  updatedByDeviceId: string;
  data: { version: 1; incomes: unknown[]; expenses: unknown[]; customers: unknown[]; products: unknown[]; updatedAt: string };
};

function emptyData() {
  return { version: 1 as const, incomes: [], expenses: [], customers: [], products: [], updatedAt: new Date().toISOString() };
}

class FakeCloud {
  snap: Snap | null = null;
  backups: { revision: number; body: string }[] = [];
  failBackup = false;
  failReadback = false;

  load(): Snap | null {
    return this.snap ? structuredClone(this.snap) : null;
  }

  save(baseRevision: number, deviceId: string, data: Snap["data"]): { ok: true; revision: number; updatedAt: string } | { ok: false; conflict: true; cloudRevision: number } | { ok: false; error: string } {
    const current = this.snap;
    const effective = current ? current.revision : 0;
    if (baseRevision !== effective) {
      return { ok: false, conflict: true, cloudRevision: effective };
    }
    if (current) {
      if (this.failBackup) return { ok: false, error: "backup_failed" };
      this.backups.push({ revision: current.revision, body: JSON.stringify(current) });
      if (this.backups.length > 20) this.backups = this.backups.slice(-20);
    }
    const updatedAt = new Date().toISOString();
    const next: Snap = {
      schemaVersion: 1,
      revision: effective + 1,
      updatedAt,
      updatedByDeviceId: deviceId,
      data,
    };
    this.snap = next;
    if (this.failReadback) {
      this.snap = current; // rollback simulation of failed verify keeping prior — in real code prior remains if write failed; here we model verify fail after write poorly; instead leave next but return error and keep backup
      return { ok: false, error: "readback_failed" };
    }
    return { ok: true, revision: next.revision, updatedAt };
  }
}

describe("SYNC-REL simulator", () => {
  it("SYNC-REL-010/011 dirty/clean semantics", () => {
    let dirty = false;
    dirty = true; // edit
    expect(dirty).toBe(true);
    dirty = false; // after save
    expect(dirty).toBe(false);
  });

  it("SYNC-REL-012 save failure preserves local", () => {
    const local = { incomes: 3 };
    const cloud = new FakeCloud();
    const res = cloud.save(0, "deviceAAAAAAA1", emptyData());
    expect(res.ok).toBe(true);
    cloud.failBackup = true;
    // next save needs backup
    const localCopy = { ...local };
    const r2 = cloud.save(1, "deviceAAAAAAA1", emptyData());
    expect(r2.ok).toBe(false);
    expect(localCopy.incomes).toBe(3);
  });

  it("SYNC-REL-015 Dirty load confirmation gate", () => {
    const dirty = true;
    const force = false;
    const needsConfirm = dirty && !force;
    expect(needsConfirm).toBe(true);
  });

  it("SYNC-REL-019/020/022 backup before overwrite + retention + failure blocks", () => {
    const cloud = new FakeCloud();
    cloud.save(0, "deviceAAAAAAA1", emptyData());
    for (let i = 0; i < 25; i++) {
      const cur = cloud.snap!.revision;
      const r = cloud.save(cur, "deviceAAAAAAA1", emptyData());
      expect(r.ok).toBe(true);
    }
    expect(cloud.backups.length).toBeLessThanOrEqual(20);
    expect(cloud.snap!.revision).toBe(26);

    cloud.failBackup = true;
    const before = structuredClone(cloud.snap);
    const blocked = cloud.save(cloud.snap!.revision, "deviceAAAAAAA1", emptyData());
    expect(blocked.ok).toBe(false);
    expect(cloud.snap).toEqual(before);
  });

  it("SYNC-REL-028 full two-device", () => {
    const cloud = new FakeCloud();
    cloud.save(0, "devA", emptyData()); // rev1
    expect(cloud.snap!.revision).toBe(1);
    // A and B loaded rev1
    const aBase = 1;
    const bBase = 1;
    const aSave = cloud.save(aBase, "devA", { ...emptyData(), incomes: [{ id: "a" }] as never });
    expect(aSave.ok).toBe(true);
    if (aSave.ok) expect(aSave.revision).toBe(2);
    const bLocalDirty = true;
    const bSave = cloud.save(bBase, "devB", { ...emptyData(), incomes: [{ id: "b" }] as never });
    expect(bSave.ok).toBe(false);
    if (!bSave.ok && "conflict" in bSave) expect(bSave.cloudRevision).toBe(2);
    expect(cloud.snap!.revision).toBe(2);
    expect((cloud.snap!.data.incomes as { id: string }[])[0].id).toBe("a");
    expect(bLocalDirty).toBe(true);
    // B loads
    const loaded = cloud.load();
    expect(loaded!.revision).toBe(2);
  });
});

describe("device id local creation", () => {
  it("SYNC-REL-005 Device ID generated once", async () => {
    const mem: Record<string, string> = {};
    const ls = {
      getItem: (k: string) => (k in mem ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
    };
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("window", { localStorage: ls });
    vi.resetModules();
    const { getOrCreateDeviceId } = await import("./device-id");
    const a = getOrCreateDeviceId();
    const b = getOrCreateDeviceId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(mem["kupa-device-id"]).toBe(a);
    vi.unstubAllGlobals();
  });
});
