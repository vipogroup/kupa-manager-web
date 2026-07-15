#!/usr/bin/env node
/**
 * Non-destructive migration: public Blob store -> private Blob store.
 * Does not delete or modify public blobs.
 * Requires env:
 *   BLOB_READ_WRITE_TOKEN (public)
 *   KUPA_PRIVATE_READ_WRITE_TOKEN (private)
 *   KUPA_WORKSPACE_NAMESPACE_SECRET
 */
import { createHash, createHmac } from "crypto";
import { list, put, get } from "@vercel/blob";

function sanitizeCode(code) {
  return (code || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function hmacPath(code, secret) {
  const safe = sanitizeCode(code);
  if (!safe) return null;
  const digest = createHmac("sha256", secret).update(safe, "utf8").digest("hex");
  return `workspaces/${digest}.json`;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function codeFromPublicPath(pathname) {
  const m = String(pathname).match(/^workspaces\/([A-Za-z0-9_-]+)\.json$/);
  return m ? m[1] : null;
}

const publicToken = process.env.BLOB_READ_WRITE_TOKEN;
const privateToken = process.env.KUPA_PRIVATE_READ_WRITE_TOKEN;
const nsSecret = process.env.KUPA_WORKSPACE_NAMESPACE_SECRET;

if (!publicToken || !privateToken || !nsSecret || nsSecret.length < 32) {
  console.error("Missing required env for migration.");
  process.exit(1);
}

const listed = await list({ token: publicToken, limit: 1000 });
let migrated = 0;
let already = 0;
let conflicts = 0;
let invalidJson = 0;
let errors = 0;

for (const blob of listed.blobs) {
  const code = codeFromPublicPath(blob.pathname);
  if (!code) {
    console.log(`SKIP_UNSUPPORTED_PATH HASH=${sha256(blob.pathname).slice(0, 16)}`);
    continue;
  }
  try {
    const res = await fetch(blob.url);
    if (!res.ok) throw new Error("download_failed");
    const buf = Buffer.from(await res.arrayBuffer());
    const srcSha = sha256(buf);
    let parsed;
    try {
      parsed = JSON.parse(buf.toString("utf8"));
    } catch {
      invalidJson++;
      console.log(`INVALID_JSON HASH=${sha256(blob.pathname).slice(0, 16)}`);
      continue;
    }
    if (parsed?.version !== 1) {
      invalidJson++;
      console.log(`INVALID_SCHEMA HASH=${sha256(blob.pathname).slice(0, 16)}`);
      continue;
    }

    const dest = hmacPath(code, nsSecret);
    if (!dest) throw new Error("bad_path");

    const existing = await get(dest, { access: "private", token: privateToken, useCache: false });
    if (existing?.stream) {
      const existingText = await new Response(existing.stream).text();
      const existingSha = sha256(Buffer.from(existingText, "utf8"));
      if (existingSha === srcSha) {
        already++;
        console.log(`ALREADY HASH=${sha256(blob.pathname).slice(0, 16)}`);
        continue;
      }
      conflicts++;
      console.log(`CONFLICT HASH=${sha256(blob.pathname).slice(0, 16)}`);
      continue;
    }

    await put(dest, buf, {
      access: "private",
      token: privateToken,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
    });

    const verify = await get(dest, { access: "private", token: privateToken, useCache: false });
    if (!verify?.stream) throw new Error("verify_missing");
    const verifyText = await new Response(verify.stream).text();
    const verifySha = sha256(Buffer.from(verifyText, "utf8"));
    if (verifySha !== srcSha) throw new Error("sha_mismatch");

    migrated++;
    console.log(`MIGRATED HASH=${sha256(blob.pathname).slice(0, 16)} BYTES=${buf.length}`);
  } catch (err) {
    errors++;
    console.log(`ERROR HASH=${sha256(blob.pathname).slice(0, 16)} CODE=${err?.message || "unknown"}`);
  }
}

console.log(
  JSON.stringify({
    publicDiscovered: listed.blobs.length,
    migrated,
    alreadyMigrated: already,
    conflicts,
    invalidJson,
    errors,
  })
);

if (conflicts > 0 || errors > 0 || invalidJson > 0) process.exit(2);
