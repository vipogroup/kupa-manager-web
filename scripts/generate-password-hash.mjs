#!/usr/bin/env node
/**
 * Generate scrypt password hash for KUPA_ADMIN_PASSWORD_HASH.
 * Usage:
 *   node scripts/generate-password-hash.mjs
 * Reads password from stdin (no echo recommended via OS tooling).
 * Does not store or print the plaintext password.
 */
import { createInterface } from "readline";
import { randomBytes, scryptSync } from "crypto";

function hashPassword(password) {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl.question("Enter password (will not be saved): ", (password) => {
  rl.close();
  if (!password || password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }
  const encoded = hashPassword(password);
  console.log("");
  console.log("KUPA_ADMIN_PASSWORD_HASH=");
  console.log(encoded);
  console.log("");
  console.log("Set this value in Vercel Project Environment Variables.");
  console.log("Do not commit this value to Git.");
});
