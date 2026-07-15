export function sanitizeCode(code: string): string {
  return (code || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}
