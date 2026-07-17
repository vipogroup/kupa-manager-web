/**
 * Dual-account auth helpers: production primary + isolated Phase 9A.2 test account.
 */
import { verifyPassword } from "./password";
import { PRIMARY_ACCOUNT_ID, TEST_ACCOUNT_ID } from "./account-workspace";

export type AuthAccount = {
  username: string;
  passwordHash: string;
  accountId: string;
  isTest: boolean;
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
    });
  }
  return accounts;
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
  // Timing: still verify against dummy when no match
  if (!matched) {
    verifyPassword(password, dummyHash);
    return { ok: false };
  }
  return { ok: true, account: matched };
}
