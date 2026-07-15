import { createHash } from "crypto";
import { AppData, emptyData } from "./types";
import { validateAppData } from "./validate-data";

/** Sync envelope schema version (not business AppData.version). */
export const SYNC_SCHEMA_VERSION = 1;
export const BACKUP_RETENTION = 20;

export type CloudSnapshot = {
  schemaVersion: number;
  revision: number;
  updatedAt: string;
  updatedByDeviceId: string;
  data: AppData;
};

export type NormalizedCloudSnapshot = CloudSnapshot & {
  legacy: boolean;
};

export function dataContentSha256(data: AppData): string {
  return createHash("sha256").update(JSON.stringify(data), "utf8").digest("hex");
}

export function isEnvelope(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  return typeof o.schemaVersion === "number" && "data" in o;
}

/**
 * Parse cloud blob JSON. Legacy AppData (no envelope) → revision 1, legacy=true.
 * Does not mutate cloud storage.
 */
export function parseCloudSnapshot(raw: unknown): NormalizedCloudSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  if (isEnvelope(raw)) {
    const o = raw as Record<string, unknown>;
    const validated = validateAppData(o.data);
    if (!validated.ok) return null;
    const revision = Number(o.revision);
    if (!Number.isInteger(revision) || revision < 1) return null;
    const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : "";
    const updatedByDeviceId =
      typeof o.updatedByDeviceId === "string" ? o.updatedByDeviceId : "unknown";
    const schemaVersion =
      typeof o.schemaVersion === "number" && Number.isFinite(o.schemaVersion)
        ? o.schemaVersion
        : SYNC_SCHEMA_VERSION;
    return {
      schemaVersion,
      revision,
      updatedAt: updatedAt || new Date(0).toISOString(),
      updatedByDeviceId,
      data: validated.data,
      legacy: false,
    };
  }

  // Legacy flat AppData
  const validated = validateAppData(raw);
  if (!validated.ok) return null;
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    revision: 1,
    updatedAt: validated.data.updatedAt || new Date(0).toISOString(),
    updatedByDeviceId: "legacy",
    data: validated.data,
    legacy: true,
  };
}

export function buildCloudSnapshot(input: {
  revision: number;
  updatedAt: string;
  updatedByDeviceId: string;
  data: AppData;
}): CloudSnapshot {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    revision: input.revision,
    updatedAt: input.updatedAt,
    updatedByDeviceId: input.updatedByDeviceId,
    data: {
      ...emptyData(),
      ...input.data,
      version: 1,
    },
  };
}

export function sanitizeDeviceId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const s = id.trim().slice(0, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(s)) return null;
  return s;
}

export function assertRevisionMatch(
  baseRevision: number,
  cloudRevision: number | null
): { ok: true } | { ok: false; cloudRevision: number } {
  const effective = cloudRevision === null ? 0 : cloudRevision;
  if (baseRevision === effective) return { ok: true };
  return { ok: false, cloudRevision: effective };
}
