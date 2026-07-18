/**
 * Dual-account auth helpers: production primary + isolated test account + optional courier.
 */
import { verifyPassword } from "./password";
import { PRIMARY_ACCOUNT_ID, TEST_ACCOUNT_ID } from "./account-workspace";

export type AuthRole = "admin" | "courier";

export type AuthAccount = {
  username: string;
  passwordHash: string;
  accountId: string;
  isTest: boolean;
  role: AuthRole;
};

export function listConfiguredAccounts(): AuthAccount[] {
  const accounts: AuthAccount[] = [];
  const primaryUser = (process.env.KUPA_ADMIN_USERNAME || "").trim();
  const primaryHash = process.env.KUPA_ADMIN_PASSWORD_HASH || "";
  if (primaryUser && primaryHash) {
    accounts.push({
      username: primaryUser,
      passwordHash: primaryHash,
      accountId: PRIMARY_ACCOUNT_ID,
      isTest: false,
      role: "admin",
    });
  }
  const testUser = (process.env.KUPA_TEST_ADMIN_USERNAME || "").trim();
  const testHash = process.env.KUPA_TEST_ADMIN_PASSWORD_HASH || "";
  if (testUser && testHash) {
    accounts.push({
      username: testUser,
      passwordHash: testHash,
      accountId: TEST_ACCOUNT_ID,
      isTest: true,
      role: "admin",
    });
  }
  const testCourierUser = (process.env.KUPA_TEST_COURIER_USERNAME || "").trim();
  const testCourierHash = process.env.KUPA_TEST_COURIER_PASSWORD_HASH || "";
  if (testCourierUser && testCourierHash) {
    accounts.push({
      username: testCourierUser,
      passwordHash: testCourierHash,
      accountId: TEST_ACCOUNT_ID,
      isTest: true,
      role: "courier",
    });
  }
  const primaryCourierUser = (process.env.KUPA_COURIER_USERNAME || "").trim();
  const primaryCourierHash = process.env.KUPA_COURIER_PASSWORD_HASH || "";
  if (primaryCourierUser && primaryCourierHash) {
    accounts.push({
      username: primaryCourierUser,
      passwordHash: primaryCourierHash,
      accountId: PRIMARY_ACCOUNT_ID,
      isTest: false,
      role: "courier",
    });
  }
  return accounts;
}

export function findAccountByUsername(username: string): AuthAccount | null {
  const u = String(username || "").trim();
  if (!u) return null;
  return listConfiguredAccounts().find((a) => a.username === u) || null;
}

export function authenticateUser(
  username: string,
  password: string
): { ok: true; account: AuthAccount } | { ok: false } {
  const accounts = listConfiguredAccounts();
  if (accounts.length === 0) return { ok: false };

  const dummyHash =
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

  let matched: AuthAccount | null = null;
  for (const acc of accounts) {
    const passOk = verifyPassword(password, acc.passwordHash || dummyHash);
    const userOk = username === acc.username;
    if (userOk && passOk) matched = acc;
  }
  if (!matched) {
    verifyPassword(password, dummyHash);
    return { ok: false };
  }
  return { ok: true, account: matched };
}

export function anyAuthConfigured(): boolean {
  return listConfiguredAccounts().length > 0;
}
