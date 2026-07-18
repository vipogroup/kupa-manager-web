import { NextRequest, NextResponse } from "next/server";
import { requireSession, jsonError } from "@/lib/security";
import { findAccountByUsername } from "@/lib/auth-accounts";
import { resolveAccountIdFromSession } from "@/lib/account-workspace";
import { readAccountWorkspaceSnapshot } from "@/lib/cloud";
import {
  findCourierAccessForUser,
  mergeCourierAccessWithMobilePrefs,
  resolveCourierDriver,
  type CourierAccess,
} from "@/lib/courier-access";
import type { AppData } from "@/lib/types";
import type { Driver } from "@/lib/phase9a-types";
import type { AuthAccount } from "@/lib/auth-accounts";

export type CourierContext = {
  username: string;
  account: AuthAccount;
  accountId: string;
  data: AppData;
  access: CourierAccess;
  driver: Driver;
};

/**
 * Server-side courier gate. Returns 403 with stable code and no data payload.
 */
export async function requireCourierAccess(
  req: NextRequest
): Promise<CourierContext | NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const account = findAccountByUsername(session.username);
  if (!account || account.role !== "courier") {
    return jsonError(403, "COURIER_ROLE_REQUIRED");
  }

  const accountId = resolveAccountIdFromSession(session.username);
  if (account.accountId !== accountId) {
    return jsonError(403, "COURIER_WORKSPACE_MISMATCH");
  }

  let data: AppData;
  try {
    const snap = await readAccountWorkspaceSnapshot(accountId);
    if (!snap.exists || !snap.snapshot?.data) {
      return jsonError(403, "COURIER_WORKSPACE_UNAVAILABLE");
    }
    data = snap.snapshot.data;
  } catch {
    return jsonError(403, "COURIER_WORKSPACE_UNAVAILABLE");
  }

  let access = findCourierAccessForUser(data, session.username);
  if (!access) {
    return jsonError(403, "COURIER_ACCESS_MISSING");
  }
  access = await mergeCourierAccessWithMobilePrefs(accountId, access);
  if (!access.isActive) {
    return jsonError(403, "COURIER_ACCESS_DISABLED");
  }

  const driver = resolveCourierDriver(data, access);
  if (!driver) {
    return jsonError(403, "COURIER_DRIVER_INACTIVE");
  }

  return {
    username: session.username,
    account,
    accountId,
    data,
    access,
    driver,
  };
}
