import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { signInAs } from "./clerk";

/**
 * NOT YET PASSING-VERIFIED. Needs: DATABASE_URL (migrated), SCRAPECREATORS_API_KEY, the Clerk keys
 * (CLERK_SECRET_KEY etc. in .env.local, DEVELOPMENT instance only), and env vars:
 *   E2E_OWNER_USER  Clerk username of a dedicated TEST Owner (no password needed — see ./clerk.ts)
 *   E2E_CLIP_URL    a public TikTok/YouTube link with >= the campaign view minimum (1000 by default)
 * USE A DEDICATED TEST OWNER, never a real account. The spec says there is exactly ONE platform
 * Owner (nothing in the DB enforces it), and an extra Owner has full authority over every campaign
 * in the real database — so set users.is_platform_owner = true on the test account only for the
 * duration of a run, then clear it. Each run leaves one campaign, one Clerk user and one users row
 * behind (accepted cost for now).
 * The Owner is signed in via a Clerk sign-in ticket (skips password + Client Trust email code). The
 * creator signs up through the REAL invite-link UI using a Clerk test email (+clerk_test), whose
 * verification code is always 424242 on dev instances.
 */
test.describe("core flow", () => {
  test("Owner creates campaign -> invite link -> new user joins and lands inside it", async ({ browser }) => {
    // Cold dev-server page compiles, two Clerk flows and a real ScrapeCreators call. The full flow
    // measured ~150s in dev; 180s ran out mid-way (right after the approval), so allow 6 minutes.
    test.setTimeout(360_000);
    const owner = await (await browser.newContext()).newPage();
    await signInAs(owner, process.env.E2E_OWNER_USER!);
    await owner.goto("/");
    await expect(owner.getByTestId("campaign-switcher")).toBeVisible();

    await owner.goto("/campaigns/new");
    const name = `E2E ${Date.now()}`;
    await owner.getByLabel("Brand name").fill("E2E Brand");
    await owner.getByLabel("Campaign name").fill(name);
    await owner.getByLabel("Base rate ($)").fill("1");
    await owner.getByLabel("Max pay per post ($)").fill("500");
    await owner.getByLabel("Total budget ($)").fill("10000");
    await owner.getByLabel("Mod mark-paid threshold ($)").fill("50");
    await owner.getByLabel("youtube").check(); // E2E_CLIP_URL may be a YouTube link; the form only ticks tiktok by default
    await owner.getByRole("button", { name: "Create campaign" }).click();
    await expect(owner.getByTestId("campaign-name")).toHaveText(name);

    await owner.getByRole("button", { name: "Generate invite link" }).click();
    const link = await owner.getByTestId("invite-row").first().locator("code").innerText();

    const creator = await (await browser.newContext()).newPage();
    await setupClerkTestingToken({ page: creator }); // bypass bot protection on the sign-up form
    await creator.goto(link);
    await expect(creator.getByRole("heading", { name: `Join ${name}` })).toBeVisible();
    await creator.getByRole("link", { name: /sign up to join/i }).click();
    const stamp = Date.now();
    const username = `e2e_${stamp}`;
    await creator.getByLabel(/username/i).fill(username);
    // Spec: username+password only. If the Clerk instance still asks for an email (its config
    // has required one before), use a +clerk_test address: dev instances accept the fixed code 424242.
    const emailField = creator.getByLabel(/email address/i);
    const needsEmail = await emailField.isVisible();
    if (needsEmail) await emailField.fill(`${username}+clerk_test@example.com`);
    const creatorPass = creator.locator('input[name="password"]');
    await expect(creatorPass).toBeEnabled();
    await creatorPass.fill(`Pw-${stamp}-xZ!`);
    await creator.getByRole("button", { name: /continue/i }).click();
    if (needsEmail) {
      // Verification code screen. UNVERIFIED selector: Clerk renders the OTP as a single/segmented input.
      const code = creator.locator('input[autocomplete="one-time-code"], input[name="codeInput"]').first();
      await code.waitFor({ state: "visible" });
      await code.pressSequentially("424242");
    }
    await creator.waitForURL(/\/invite\//);
    await creator.getByRole("button", { name: "Join campaign" }).click();

    await expect(creator.getByTestId("campaign-name")).toHaveText(name);
    await expect(creator.getByTestId("role")).toHaveText("creator");

    // ---- Task 3: creator submits -> proof -> reviewer sets % and approves -> mark paid ----
    await creator.getByPlaceholder(/paste a tiktok/i).fill(process.env.E2E_CLIP_URL!);
    await creator.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(creator.getByTestId("my-clip").first()).toBeVisible();
    await creator.getByPlaceholder(/analytics proof link/i).first().fill("https://youtu.be/dQw4w9WgXcQ");
    await creator.getByRole("button", { name: "Submit proof" }).click();
    await expect(creator.getByText("Proof submitted")).toBeVisible();

    await owner.reload();
    const row = owner.getByTestId("queue-row").first();
    await expect(row.getByTestId("queue-creator")).toContainText(username);
    await row.getByPlaceholder(/qualifying audience/i).fill("25");
    await row.getByRole("button", { name: "Save %" }).click();
    await expect(row.getByTestId("queue-payout")).not.toContainText("—");
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(owner.getByTestId("payment-row").first()).toBeVisible();
    await owner.getByRole("button", { name: "Mark paid" }).first().click();

    await creator.reload();
    await expect(creator.getByTestId("clip-status").first()).toHaveText("paid");
  });

  test("a revoked invite link shows a clear error", async ({ page }) => {
    test.skip(true, "Needs the seeded revoked link code — wire up once the e2e DB fixture exists.");
    await page.goto("/invite/revoked-code");
    await expect(page.getByTestId("invite-error")).toContainText("revoked");
  });
});
