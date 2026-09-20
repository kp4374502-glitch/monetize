import { clerkSetup } from "@clerk/testing/playwright";

/** Fetches Clerk's testing token once per run (bypasses bot protection on the dev instance). */
export default async function globalSetup() {
  await clerkSetup({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });
}
