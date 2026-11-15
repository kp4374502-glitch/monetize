import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { campaignCreators, campaignMods, campaigns, clips, platformAdmins, users } from "../../drizzle/schema";

process.env.SCRAPECREATORS_API_KEY = "test-key";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as clipSvc from "@/lib/clips/service";
import { payoutSettingsSchema } from "@/lib/campaigns/schemas";

let db: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let n = 0;

// Created with base rate 1, divisor 50, max pay 500, view minimum 1000 (validCampaign).
const ORIGINAL = { baseRate: 1, divisor: 50, maxPayPerPost: 500, viewMinimum: 1000, totalBudget: 10000, dailySubmissionLimit: 100 };
const NEW_TERMS = { baseRate: 2, divisor: 25, maxPayPerPost: 15, viewMinimum: 20_000, totalBudget: 10000, dailySubmissionLimit: 100 };

const campaign = async (id: string) => (await db.select().from(campaigns).where(eq(campaigns.id, id)))[0];
const clip = async (id: string) => (await db.select().from(clips).where(eq(clips.id, id)))[0];

/** An approved post with proof, ready for the audience % to price it. */
async function post(campaignId: string, over: Partial<typeof clips.$inferInsert> = {}) {
  const [row] = await db
    .insert(clips)
    .values({
      campaignId,
      creatorUserId: "c1",
      platform: "tiktok",
      url: `https://www.tiktok.com/@u/video/${7_000_000 + ++n}`,
      views: 10_000,
      status: "approved",
      videoProofUrl: "https://youtu.be/aaaaaaaaaaa",
      ...over,
    })
    .returning();
  return row;
}
/** Re-prices through the app's real path (economicsColumns), exactly as saving a % in the UI does. */
const price = async (campaignId: string, id: string, pct = 50) => (await clipSvc.setQualifyingAudiencePct("admin", campaignId, id, pct)).payout;

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin", username: "admin" },
    { id: "brandowner", username: "brandowner" },
    { id: "mod1", username: "mod1" },
    { id: "brandviewer", username: "brandviewer" },
    { id: "c1", username: "c1" },
    { id: "outsider", username: "outsider" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });
  A = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Alpha" })).id;
  B = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Beta" })).id;
  await db.update(campaigns).set({ ownerUserId: "brandowner" }).where(eq(campaigns.id, A));
  await db.insert(campaignMods).values({ campaignId: A, userId: "mod1", addedBy: "owner" });
  await campaignSvc.addBrand("owner", A, "brandviewer");
  await db.insert(campaignCreators).values([
    { campaignId: A, userId: "c1" },
    { campaignId: B, userId: "c1" },
  ]);
});

describe("updatePayoutSettings: posts already submitted keep their old terms", () => {
  it("prices an old post on the old terms and new posts on the new ones", async () => {
    const old = await post(A);
    expect(await price(A, old.id)).toBe("10.00"); // (50/50)*$1 = $1 CPM x 10k views

    const res = await campaignSvc.updatePayoutSettings("owner", A, NEW_TERMS);
    expect(res.changedPayTerms.sort()).toEqual(["baseRate", "divisor", "maxPayPerPost", "viewMinimum"]);
    expect(res.pinnedPosts).toBeGreaterThanOrEqual(1);

    // The old post is pinned to exactly what it was submitted under, and re-pricing it changes nothing.
    expect(await clip(old.id)).toMatchObject({
      baseRateOverride: "1.0000",
      divisorOverride: "50.0000",
      maxPayPerPostOverride: "500.00",
      viewMinimumOverride: 1000,
    });
    expect(await price(A, old.id)).toBe("10.00");

    // New posts: no pins, priced on the new terms.
    const belowNewMinimum = await post(A, { views: 10_000 });
    expect(await price(A, belowNewMinimum.id)).toBeNull(); // 10k < new 20k minimum
    const capped = await post(A, { views: 40_000 });
    expect(await price(A, capped.id)).toBe("15.00"); // (50/25)*$2 = $4 CPM x 40k = $160, capped at new $15
    expect(await clip(capped.id)).toMatchObject({ baseRateOverride: null, divisorOverride: null, maxPayPerPostOverride: null, viewMinimumOverride: null });
  });

  it("keeps a post's existing pin (e.g. the Hair u rate pin) instead of overwriting it", async () => {
    const pinnedEarlier = await post(A, { baseRateOverride: "0.5000" });
    await campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, baseRate: 3 });
    expect((await clip(pinnedEarlier.id)).baseRateOverride).toBe("0.5000");
  });

  it("pins only the terms that actually changed", async () => {
    const fresh = await post(A); // submitted under the current terms, no pins yet
    const before = await campaign(A);
    await campaignSvc.updatePayoutSettings("admin", A, {
      baseRate: before.baseRate,
      divisor: before.divisor,
      maxPayPerPost: before.maxPayPerPost,
      viewMinimum: before.viewMinimum,
      totalBudget: 5000,
      dailySubmissionLimit: 50,
    });
    expect(await clip(fresh.id)).toMatchObject({ baseRateOverride: null, divisorOverride: null, maxPayPerPostOverride: null, viewMinimumOverride: null });

    await campaignSvc.updatePayoutSettings("admin", A, {
      baseRate: before.baseRate,
      divisor: before.divisor,
      maxPayPerPost: 99,
      viewMinimum: before.viewMinimum,
      totalBudget: 5000,
      dailySubmissionLimit: 50,
    });
    expect(await clip(fresh.id)).toMatchObject({ baseRateOverride: null, divisorOverride: null, maxPayPerPostOverride: before.maxPayPerPost, viewMinimumOverride: null });
  });

  it("pins paid posts too, without re-pricing them", async () => {
    const paid = await post(A, { paidStatus: "paid", payout: "7.00" });
    const before = await campaign(A);
    await campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, divisor: 10 });
    expect(await clip(paid.id)).toMatchObject({ payout: "7.00", divisorOverride: before.divisor });
  });

  it("never pins or re-prices another campaign's posts (tenant isolation)", async () => {
    const other = await post(B);
    expect(await price(B, other.id)).toBe("10.00");
    await campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, baseRate: 9 });
    expect(await clip(other.id)).toMatchObject({ baseRateOverride: null, divisorOverride: null, maxPayPerPostOverride: null, viewMinimumOverride: null });
    expect(await campaign(B)).toMatchObject({ baseRate: "1.0000", divisor: "50.0000", maxPayPerPost: "500.00", viewMinimum: 1000 });
  });
});

describe("updatePayoutSettings: budget, daily limit and what it leaves alone", () => {
  it("allows any total budget, even below what has already been paid", async () => {
    await db.update(campaigns).set({ budgetSpent: "100.00" }).where(eq(campaigns.id, A));
    await campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, totalBudget: 0 });
    expect(await campaign(A)).toMatchObject({ totalBudget: "0.00", budgetSpent: "100.00" });
    await campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, totalBudget: 10000 });
  });

  it("applies the daily submission limit straight away", async () => {
    await campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, dailySubmissionLimit: 1 });
    await post(A, { status: "pending", submittedAt: new Date() }); // c1's first post today
    await expect(clipSvc.submitClip("c1", A, `https://www.tiktok.com/@u/video/${8_000_000 + ++n}`)).rejects.toThrow(/today's limit of 1/);
    await campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, dailySubmissionLimit: 100 });
  });

  it("leaves name, brand, platforms, status, analytics mode and owner untouched", async () => {
    const before = await campaign(A);
    await campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, totalBudget: 1234.5 });
    const after = await campaign(A);
    for (const k of ["name", "brandName", "eligiblePlatforms", "status", "requireAnalyticsProof", "ownerUserId", "budgetSpent"] as const) {
      expect(after[k]).toEqual(before[k]);
    }
    expect(after.totalBudget).toBe("1234.50");
  });
});

describe("updatePayoutSettings: who can and validation", () => {
  it("lets the platform Owner, an Admin and the campaign's own owner save", async () => {
    for (const who of ["owner", "admin", "brandowner"]) {
      await expect(campaignSvc.updatePayoutSettings(who, A, NEW_TERMS)).resolves.toBeTruthy();
    }
  });

  it("refuses a Mod, a Brand viewer, a Creator and an outsider, and changes nothing", async () => {
    const before = await campaign(A);
    for (const who of ["mod1", "brandviewer", "c1", "outsider"]) {
      await expect(campaignSvc.updatePayoutSettings(who, A, { ...NEW_TERMS, baseRate: 99 })).rejects.toThrow(/Access denied/);
    }
    expect(await campaign(A)).toEqual(before);
  });

  it("rejects a blank field instead of silently resetting it to a default", async () => {
    const before = await campaign(A);
    await expect(campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, divisor: "" })).rejects.toThrow(/Enter a divisor/);
    await expect(campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, viewMinimum: "  " })).rejects.toThrow(/Enter a view minimum/);
    await expect(campaignSvc.updatePayoutSettings("owner", A, { ...NEW_TERMS, baseRate: undefined })).rejects.toThrow(/Enter a base rate/);
    expect(await campaign(A)).toEqual(before);
  });

  it("rejects invalid numbers", () => {
    const bad = (over: Record<string, unknown>) => payoutSettingsSchema.safeParse({ ...ORIGINAL, ...over }).success;
    expect(bad({ divisor: 0 })).toBe(false);
    expect(bad({ baseRate: -1 })).toBe(false);
    expect(bad({ maxPayPerPost: "abc" })).toBe(false);
    expect(bad({ viewMinimum: 1.5 })).toBe(false);
    expect(bad({ dailySubmissionLimit: 0 })).toBe(false);
    expect(bad({ totalBudget: -5 })).toBe(false);
    expect(bad({})).toBe(true);
    expect(payoutSettingsSchema.parse({ ...ORIGINAL, baseRate: "0.75", viewMinimum: "2000" })).toMatchObject({ baseRate: 0.75, viewMinimum: 2000 });
  });
});
