import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Signs `page` in as an EXISTING Clerk user, identified by username, without any password or
 * emailed code: a one-time sign-in token is minted through the Clerk Backend API (CLERK_SECRET_KEY)
 * and redeemed with the "ticket" strategy. This is what gets past Clerk Client Trust ("new device"
 * email verification), which a script can't complete. Requires a Clerk DEVELOPMENT instance.
 */
export async function signInAs(page: Page, username: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set (expected in .env.local).");

  const client = createClerkClient({ secretKey });
  const { data } = await client.users.getUserList({ username: [username] });
  const user = data[0];
  if (!user) throw new Error(`No Clerk user with username "${username}" (check E2E_OWNER_USER).`);

  const { token } = await client.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 120 });

  await page.goto("/sign-in"); // an unprotected page that loads Clerk
  await clerk.loaded({ page });
  await clerk.signIn({ page, signInParams: { strategy: "ticket", ticket: token } });
}
