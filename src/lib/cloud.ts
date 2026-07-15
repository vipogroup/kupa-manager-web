import { get, head, list, put } from "@vercel/blob";
import { AppData, emptyData } from "./types";
import { workspaceHmacPath } from "./workspace-path";

function privateToken(): string {
  const t = process.env.KUPA_PRIVATE_READ_WRITE_TOKEN || "";
  if (!t) throw new Error("private_blob_token_missing");
  return t;
}

export function cloudMode(): "private-blob" {
  return "private-blob";
}

export async function readWorkspace(code: string): Promise<AppData | null> {
  const pathname = workspaceHmacPath(code);
  if (!pathname) return null;
  try {
    const result = await get(pathname, {
      access: "private",
      token: privateToken(),
      useCache: false,
    });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as AppData;
  } catch {
    return null;
  }
}

export async function writeWorkspace(code: string, data: AppData): Promise<void> {
  const pathname = workspaceHmacPath(code);
  if (!pathname) throw new Error("invalid_workspace");

  const payload: AppData = {
    ...emptyData(),
    ...data,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  await put(pathname, body, {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: privateToken(),
  });
}

export async function workspaceExists(code: string): Promise<boolean> {
  const pathname = workspaceHmacPath(code);
  if (!pathname) return false;
  try {
    await head(pathname, { token: privateToken() });
    return true;
  } catch {
    return false;
  }
}

export async function listPrivateBlobCount(): Promise<number> {
  const res = await list({ token: privateToken(), limit: 1000 });
  return res.blobs.length;
}
