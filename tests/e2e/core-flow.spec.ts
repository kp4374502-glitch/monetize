import { test, expect } from "@playwright/test";

/**
 * NOT YET RUN. Needs: DATABASE_URL (migrated), real Clerk dev keys, the dev server, and an Owner
 * whose users row has is_platform_owner = true. Provide credentials via env:
 *   E2E_OWNER_USER / E2E_OWNER_PASS  (Clerk sign-in for the seeded platform Owner)
 * The new creator signs up through the UI; adjust the sign-up steps to match your Clerk
 * instance's configured identifiers (username+password per spec).
 */
test.describe("core flow — first half (Task 2)", () => {
  test("Owner creates campaign -> invite link -> new user joins and lands inside it", async ({ browser }) => {
    const owner = await (await browser.newContext()).newPage();
    await owner.goto("/sign-in");
    await owner.getByLabel(/username|email/i).fill(process.env.E2E_OWNER_USER!);
    await owner.getByRole("button", { name: /continue/i }).click();
    await owner.getByLabel(/password/i).fill(process.env.E2E_OWNER_PASS!);
    await owner.getByRole("button", { name: /continue/i }).click();

    await owner.goto("/campaigns/new");
    const name = `E2E ${Date.now()}`;
    await owner.getByLabel("Brand name").fill("E2E Brand");
    await owner.getByLabel("Campaign name").fill(name);
    await owner.getByLabel("Base rate ($)").fill("1");
    await owner.getByLabel("Max pay per post ($)").fill("500");
    await owner.getByLabel("Total budget ($)").fill("10000");
    await owner.getByLabel("Mod mark-paid threshold ($)").fill("50");
    await owner.getByRole("button", { name: "Create campaign" }).click();
    await expect(owner.getByTestId("campaign-name")).toHaveText(name);

    await owner.getByRole("button", { name: "Generate invite link" }).click();
    const link = await owner.getByTestId("invite-row").first().locator("code").innerText();

    const creator = await (await browser.newContext()).newPage();
    await creator.goto(link);
    await expect(creator.getByRole("heading", { name: `Join ${name}` })).toBeVisible();
    await creator.getByRole("link", { name: /sign up to join/i }).click();
    const username = `e2e_${Date.now()}`;
    await creator.getByLabel(/username/i).fill(username);
    await creator.getByLabel(/password/i).first().fill(`Pw-${Date.now()}-xZ!`);
    await creator.getByRole("button", { name: /continue/i }).click();
    await creator.waitForURL(/\/invite\//);
    await creator.getByRole("button", { name: "Join campaign" }).click();

    await expect(creator.getByTestId("campaign-name")).toHaveText(name);
    await expect(creator.getByTestId("role")).toHaveText("creator");
  });

  test("a revoked invite link shows a clear error", async ({ page }) => {
    test.skip(true, "Needs the seeded revoked link code — wire up once the e2e DB fixture exists.");
    await page.goto("/invite/revoked-code");
    await expect(page.getByTestId("invite-error")).toContainText("revoked");
  });
});

// Review / payout half of the core flow stays skipped until Task 3.
test.skip("core flow — review and payout (Task 3)", async () => {});
