"use client";

import { nanoid } from "nanoid";

const DEVICE_KEY = "kupa-device-id";

/** Random non-personal browser device id (localStorage). */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const id = nanoid(16);
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return nanoid(16);
  }
}

export function isPersonalLookingDeviceId(id: string): boolean {
  const lower = id.toLowerCase();
  if (lower.includes("@")) return true;
  if (/\d{7,}/.test(id)) return true; // likely phone-like
  if (lower.includes("user") || lower.includes("admin") || lower.includes("name")) return true;
  return false;
}
