import { del, get, head, list, put, BlobPreconditionFailedError } from "@vercel/blob";
import {
  accountPrefsBackupPathname,
  accountPrefsBackupPrefix,
  accountPrefsPath,
} from "../workspace-path";
import { BACKUP_RETENTION } from "../sync-snapshot";
import {
  defaultMobilePreferences,
  PREFS_SCHEMA_VERSION,
  type MobileUiPreferences,
  type UiPreferencesEnvelope,
} from "./types";
import { sanitizeHiddenIds } from "./presets";

function privateToken(): string {
  const t = process.env.KUPA_PRIVATE_READ_WRITE_TOKEN || "";
  if (!t) throw new Error("private_blob_token_missing");
  return t;
}

function normalizePrefs(raw: unknown): MobileUiPreferences {
  if (!raw || typeof raw !== "object") return defaultMobilePreferences();
  const o = raw as Record<string, unknown>;
  const preset =
    o.preset === "basic" ||
    o.preset === "business" ||
    o.preset === "full" ||
    o.preset === "readOnly" ||
    o.preset === "custom"
      ? o.preset
      : "business";
  const hidden = Array.isArray(o.hiddenElementIds)
    ? sanitizeHiddenIds(o.hiddenElementIds.filter((x): x is string => typeof x === "string"))
    : [];
  const modulePermissions =
    o.modulePermissions && typeof o.modulePermissions === "object" && !Array.isArray(o.modulePermissions)
      ? (o.modulePermissions as MobileUiPreferences["modulePermissions"])
      : undefined;
  return { version: 1, preset, hiddenElementIds: hidden, modulePermissions };
}

export type PrefsReadResult =
  | { exists: false }
  | { exists: true; envelope: UiPreferencesEnvelope; etag: string; rawText: string };

export async function readAccountPreferences(accountId: string): Promise<PrefsReadResult> {
  const pathname = accountPrefsPath(accountId);
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
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const preferences = normalizePrefs(parsed.preferences ?? parsed);
    const envelope: UiPreferencesEnvelope = {
      schemaVersion: PREFS_SCHEMA_VERSION,
      revision: typeof parsed.revision === "number" ? parsed.revision : 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      updatedByDeviceId:
        typeof parsed.updatedByDeviceId === "string" ? parsed.updatedByDeviceId : "unknown",
      preferences,
    };
    return { exists: true, envelope, etag: meta.etag, rawText };
  } catch {
    return { exists: false };
  }
}

export type PrefsSaveResult =
  | { ok: true; revision: number; updatedAt: string; preferences: MobileUiPreferences }
  | { ok: false; kind: "conflict"; cloudRevision: number; cloudUpdatedAt: string }
  | { ok: false; kind: "error"; message: string };

async function prune(prefix: string | null) {
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

export async function saveAccountPreferencesGuarded(input: {
  accountId: string;
  baseRevision: number;
  deviceId: string;
  preferences: MobileUiPreferences;
}): Promise<PrefsSaveResult> {
  const pathname = accountPrefsPath(input.accountId);
  if (!pathname) return { ok: false, kind: "error", message: "invalid_workspace" };

  let current: PrefsReadResult;
  try {
    current = await readAccountPreferences(input.accountId);
  } catch {
    return { ok: false, kind: "error", message: "cloud_read_failed" };
  }

  const effective = current.exists ? current.envelope.revision : 0;
  if (input.baseRevision !== effective) {
    return {
      ok: false,
      kind: "conflict",
      cloudRevision: effective,
      cloudUpdatedAt: current.exists ? current.envelope.updatedAt : "",
    };
  }

  if (current.exists) {
    try {
      const bpath = accountPrefsBackupPathname(
        input.accountId,
        current.envelope.revision,
        current.envelope.updatedAt
      );
      if (!bpath) throw new Error("backup_path");
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

  const preferences = {
    version: 1 as const,
    preset: input.preferences.preset,
    hiddenElementIds: sanitizeHiddenIds(input.preferences.hiddenElementIds),
  };
  const updatedAt = new Date().toISOString();
  const nextRevision = effective + 1;
  const envelope: UiPreferencesEnvelope = {
    schemaVersion: PREFS_SCHEMA_VERSION,
    revision: nextRevision,
    updatedAt,
    updatedByDeviceId: input.deviceId,
    preferences,
  };
  const body = JSON.stringify(envelope);

  try {
    if (current.exists) {
      await put(pathname, body, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: current.etag,
        token: privateToken(),
      });
    } else {
      await put(pathname, body, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false,
        token: privateToken(),
      });
    }
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) {
      const again = await readAccountPreferences(input.accountId);
      return {
        ok: false,
        kind: "conflict",
        cloudRevision: again.exists ? again.envelope.revision : effective,
        cloudUpdatedAt: again.exists ? again.envelope.updatedAt : "",
      };
    }
    return { ok: false, kind: "error", message: "write_failed" };
  }

  const verify = await readAccountPreferences(input.accountId);
  if (!verify.exists || verify.envelope.revision !== nextRevision) {
    return { ok: false, kind: "error", message: "readback_failed" };
  }

  try {
    await prune(accountPrefsBackupPrefix(input.accountId));
  } catch {
    /* ok */
  }

  return { ok: true, revision: nextRevision, updatedAt, preferences };
}
