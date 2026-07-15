import { del, get, head, list, put, BlobPreconditionFailedError } from "@vercel/blob";
import { AppData } from "./types";
import {
  BACKUP_RETENTION,
  buildCloudSnapshot,
  dataContentSha256,
  NormalizedCloudSnapshot,
  parseCloudSnapshot,
} from "./sync-snapshot";
import {
  accountBackupPathname,
  accountBackupPrefix,
  accountWorkspacePath,
  backupPathname,
  workspaceBackupPrefix,
  workspaceHmacPath,
} from "./workspace-path";

function privateToken(): string {
  const t = process.env.KUPA_PRIVATE_READ_WRITE_TOKEN || "";
  if (!t) throw new Error("private_blob_token_missing");
  return t;
}

export function cloudMode(): "private-blob" {
  return "private-blob";
}

export type ReadSnapshotResult =
  | { exists: false }
  | {
      exists: true;
      snapshot: NormalizedCloudSnapshot;
      etag: string;
      rawText: string;
    };

async function readSnapshotAtPath(pathname: string | null): Promise<ReadSnapshotResult> {
  if (!pathname) return { exists: false };
  try {
    const meta = await head(pathname, { token: privateToken() });
    const result = await get(pathname, {
      access: "private",
      token: privateToken(),
      useCache: false,
    });
    if (!result?.stream) return { exists: false };
    const rawText = await new Response(result.stream).text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error("cloud_json_invalid");
    }
    const snapshot = parseCloudSnapshot(parsed);
    if (!snapshot) throw new Error("cloud_snapshot_invalid");
    return {
      exists: true,
      snapshot,
      etag: meta.etag,
      rawText,
    };
  } catch (err) {
    if (err instanceof Error && (err.message === "cloud_json_invalid" || err.message === "cloud_snapshot_invalid")) {
      throw err;
    }
    return { exists: false };
  }
}

async function pruneBackupsAtPrefix(prefix: string | null): Promise<void> {
  if (!prefix) return;
  const res = await list({ token: privateToken(), prefix, limit: 1000 });
  const sorted = [...res.blobs].sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });
  for (const blob of sorted.slice(BACKUP_RETENTION)) {
    await del(blob.url, { token: privateToken() });
  }
}

export type SaveGuardResult =
  | { ok: true; revision: number; updatedAt: string }
  | {
      ok: false;
      kind: "conflict";
      cloudRevision: number;
      cloudUpdatedAt: string;
    }
  | { ok: false; kind: "error"; message: string };

async function saveGuardedCore(input: {
  pathname: string;
  backupPrefix: string | null;
  makeBackupPath: (revision: number, updatedAt: string) => string | null;
  baseRevision: number;
  deviceId: string;
  data: AppData;
  reread: () => Promise<ReadSnapshotResult>;
}): Promise<SaveGuardResult> {
  let current: ReadSnapshotResult;
  try {
    current = await input.reread();
  } catch {
    return { ok: false, kind: "error", message: "cloud_read_failed" };
  }

  const cloudRevision = current.exists ? current.snapshot.revision : null;
  const effective = cloudRevision === null ? 0 : cloudRevision;
  if (input.baseRevision !== effective) {
    return {
      ok: false,
      kind: "conflict",
      cloudRevision: effective,
      cloudUpdatedAt: current.exists ? current.snapshot.updatedAt : "",
    };
  }

  if (current.exists) {
    try {
      JSON.parse(current.rawText);
      const bpath = input.makeBackupPath(
        current.snapshot.revision,
        current.snapshot.updatedAt || new Date().toISOString()
      );
      if (!bpath) throw new Error("backup_path_invalid");
      await put(bpath, current.rawText, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        token: privateToken(),
      });
    } catch {
      return { ok: false, kind: "error", message: "backup_failed" };
    }
  }

  const updatedAt = new Date().toISOString();
  const nextRevision = effective + 1;
  const snapshot = buildCloudSnapshot({
    revision: nextRevision,
    updatedAt,
    updatedByDeviceId: input.deviceId,
    data: input.data,
  });
  const body = JSON.stringify(snapshot);
  const expectedDataSha = dataContentSha256(snapshot.data);

  try {
    if (current.exists) {
      await put(input.pathname, body, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: current.etag,
        token: privateToken(),
      });
    } else {
      await put(input.pathname, body, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false,
        token: privateToken(),
      });
    }
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) {
      const again = await input.reread();
      return {
        ok: false,
        kind: "conflict",
        cloudRevision: again.exists ? again.snapshot.revision : effective,
        cloudUpdatedAt: again.exists ? again.snapshot.updatedAt : "",
      };
    }
    return { ok: false, kind: "error", message: "write_failed" };
  }

  try {
    const verify = await input.reread();
    if (!verify.exists) return { ok: false, kind: "error", message: "readback_missing" };
    if (verify.snapshot.revision !== nextRevision) {
      return { ok: false, kind: "error", message: "readback_revision" };
    }
    if (!verify.snapshot.updatedAt) {
      return { ok: false, kind: "error", message: "readback_updatedAt" };
    }
    if (dataContentSha256(verify.snapshot.data) !== expectedDataSha) {
      return { ok: false, kind: "error", message: "readback_sha" };
    }
  } catch {
    return { ok: false, kind: "error", message: "readback_failed" };
  }

  try {
    await pruneBackupsAtPrefix(input.backupPrefix);
  } catch {
    /* ok */
  }

  return { ok: true, revision: nextRevision, updatedAt };
}

/** Canonical account workspace (session-derived). */
export async function readAccountWorkspaceSnapshot(accountId: string): Promise<ReadSnapshotResult> {
  return readSnapshotAtPath(accountWorkspacePath(accountId));
}

export async function saveAccountWorkspaceGuarded(input: {
  accountId: string;
  baseRevision: number;
  deviceId: string;
  data: AppData;
}): Promise<SaveGuardResult> {
  const pathname = accountWorkspacePath(input.accountId);
  if (!pathname) return { ok: false, kind: "error", message: "invalid_workspace" };
  return saveGuardedCore({
    pathname,
    backupPrefix: accountBackupPrefix(input.accountId),
    makeBackupPath: (revision, updatedAt) =>
      accountBackupPathname(input.accountId, revision, updatedAt),
    baseRevision: input.baseRevision,
    deviceId: input.deviceId,
    data: input.data,
    reread: () => readAccountWorkspaceSnapshot(input.accountId),
  });
}

/** @deprecated Legacy code-based paths — tests / migration tools only. */
export async function readWorkspaceSnapshot(code: string): Promise<ReadSnapshotResult> {
  return readSnapshotAtPath(workspaceHmacPath(code));
}

/** @deprecated Legacy code-based paths — tests / migration tools only. */
export async function saveWorkspaceGuarded(input: {
  code: string;
  baseRevision: number;
  deviceId: string;
  data: AppData;
}): Promise<SaveGuardResult> {
  const pathname = workspaceHmacPath(input.code);
  if (!pathname) return { ok: false, kind: "error", message: "invalid_workspace" };
  return saveGuardedCore({
    pathname,
    backupPrefix: workspaceBackupPrefix(input.code),
    makeBackupPath: (revision, updatedAt) => backupPathname(input.code, revision, updatedAt),
    baseRevision: input.baseRevision,
    deviceId: input.deviceId,
    data: input.data,
    reread: () => readWorkspaceSnapshot(input.code),
  });
}

export async function readWorkspace(code: string): Promise<AppData | null> {
  const r = await readWorkspaceSnapshot(code);
  if (!r.exists) return null;
  return r.snapshot.data;
}

export async function listPrivateBlobCount(): Promise<number> {
  const res = await list({ token: privateToken(), limit: 1000 });
  return res.blobs.length;
}

export async function listBackupCount(code: string): Promise<number> {
  const prefix = workspaceBackupPrefix(code);
  if (!prefix) return 0;
  const res = await list({ token: privateToken(), prefix, limit: 1000 });
  return res.blobs.length;
}

export async function deleteWorkspaceAndBackups(code: string): Promise<void> {
  const path = workspaceHmacPath(code);
  if (path) {
    try {
      await del(path, { token: privateToken() });
    } catch {
      /* missing ok */
    }
  }
  const prefix = workspaceBackupPrefix(code);
  if (!prefix) return;
  const res = await list({ token: privateToken(), prefix, limit: 1000 });
  for (const b of res.blobs) {
    await del(b.url, { token: privateToken() });
  }
}
