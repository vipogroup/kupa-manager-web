import { head, put } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";
import { AppData, emptyData } from "./types";

const LOCAL_DIR = path.join(process.cwd(), ".data");

function blobPath(code: string): string {
  return `workspaces/${code}.json`;
}

function localPath(code: string): string {
  return path.join(LOCAL_DIR, `${code}.json`);
}

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readWorkspace(code: string): Promise<AppData | null> {
  const safe = sanitizeCode(code);
  if (!safe) return null;

  if (hasBlobToken()) {
    try {
      const info = await head(blobPath(safe));
      const res = await fetch(info.url, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as AppData;
    } catch {
      return null;
    }
  }

  try {
    const raw = await fs.readFile(localPath(safe), "utf8");
    return JSON.parse(raw) as AppData;
  } catch {
    return null;
  }
}

export async function writeWorkspace(code: string, data: AppData): Promise<void> {
  const safe = sanitizeCode(code);
  if (!safe) throw new Error("קוד סביבת עבודה לא תקין");

  const payload: AppData = {
    ...emptyData(),
    ...data,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  if (hasBlobToken()) {
    await put(blobPath(safe), body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }

  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(localPath(safe), body, "utf8");
}

export function sanitizeCode(code: string): string {
  return (code || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

export function cloudMode(): "blob" | "local-file" {
  return hasBlobToken() ? "blob" : "local-file";
}
