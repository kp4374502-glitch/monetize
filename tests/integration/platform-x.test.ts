import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { campaignCreators, campaignMods, campaigns, clips, scrapeCreatorsCache, users } from "../../drizzle/schema";

process.env.SCRAPECREATORS_API_KEY = "test-key";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as clipSvc from "@/lib/clips/service";

let db: Awaited<ReturnType<typeof createTestDb>>;
let A: string; // eligible: tiktok only
let B: string;

const POST_ID = "2113776971603689874";
const sleep = async () => {};
/** A fake ScrapeCreators response shaped like the live /v1/twitter/tweet body. */
const xFetch = (views: string | null = "1350083") =>
  (async () =>
    new Response(
      JSON.stringify({
        success: true,
        rest_id: POST_ID,
        views: views === null ? { state: "Enabled" } : { count: views, state: "EnabledWithCount" },
        legacy: { favorite_count: 7850, created_at: "Fri Oct 23 23:37:56 +0000 2026", full_text: "hello", extended_entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/m.jpg" }] } },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "mod1", username: "mod1" },
    { id: "c1", username: "c1" },
    { id: "c2", username: "c2" },
    { id: "outsider", username: "outsider" },
  ]);
  A = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Alpha", eligiblePlatforms: ["tiktok"] })).id;
  B = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Beta", eligiblePlatforms: ["tiktok"] })).id;
  await db.insert(campaignMods).values({ campaignId: A, userId: "mod1", addedBy: "owner" });
  await db.insert(campaignCreators).values([
    { campaignId: A, userId: "c1" },
    { campaignId: A, userId: "c2" },
    { campaignId: B, userId: "c1" },
  ]);
});

describe("turning X on for a campaign", () => {
  it("is refused until the campaign allows X, then works", async () => {
    await expect(clipSvc.submitClip("c1", A, `https://x.com/nasa/status/${POST_ID}`, { fetchImpl: xFetch(), sleep })).rejects.toThrow(/x posts are not eligible/i);

    expect(await campaignSvc.setEligiblePlatforms("owner", A, ["tiktok", "x"])).toEqual(["tiktok", "x"]);
    const { clip, statsAvailable } = await clipSvc.submitClip("c1", A, `https://twitter.com/NASA/status/${POST_ID}?s=20`, { fetchImpl: xFetch(), sleep });
    expect(statsAvailable).toBe(true);
    expect(clip).toMatchObject({ platform: "x", url: `https://x.com/nasa/status/${POST_ID}`, views: 1350083, likes: 7850, status: "awaiting_analytics", isVideo: true });
    expect(clip.postedAt?.toISOString()).toBe("2026-10-23T23:37:56.000Z");
    expect((await db.select().from(scrapeCreatorsCache).where(eq(scrapeCreatorsCache.platform, "x"))).length).toBe(1);
  });

  it("sees the same post as a duplicate whatever the URL spelling", async () => {
    await expect(clipSvc.submitClip("c1", A, `https://x.com/NASA/status/${POST_ID}/photo/1`, { fetchImpl: xFetch(), sleep })).rejects.toThrow();
    await expect(clipSvc.submitClip("c2", A, `https://x.com/i/web/status/${POST_ID}`, { fetchImpl: xFetch(), sleep })).resolves.toBeTruthy(); // another creator: flagged, not blocked
    const flagged = await db.select().from(clips).where(eq(clips.creatorUserId, "c2"));
    expect(flagged[0].flaggedDuplicate).toBe(true);
  });

  it("stores 0 views, not a failure, for a post X reports no count for", async () => {
    const { clip, statsAvailable } = await clipSvc.submitClip("c2", A, "https://x.com/someone/status/1519480761749016577", { fetchImpl: xFetch(null), sleep });
    expect(statsAvailable).toBe(true);
    expect(clip.views).toBe(0);
  });

  it("only the Owner/Admin can change a campaign's platforms, and a campaign needs at least one", async () => {
    for (const who of ["mod1", "c1", "outsider"]) {
      await expect(campaignSvc.setEligiblePlatforms(who, A, ["x"]), who).rejects.toThrow(/Access denied/);
    }
    await expect(campaignSvc.setEligiblePlatforms("owner", A, [])).rejects.toThrow(/at least one platform/i);
    await expect(campaignSvc.setEligiblePlatforms("owner", A, ["facebook"])).rejects.toThrow();
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, A));
    expect(row.eligiblePlatforms).toEqual(["tiktok", "x"]);
  });

  it("only changes the campaign it is addressed to", async () => {
    const [b] = await db.select().from(campaigns).where(eq(campaigns.id, B));
    expect(b.eligiblePlatforms).toEqual(["tiktok"]);
    await expect(clipSvc.submitClip("c1", B, "https://x.com/nasa/status/2114801524358406570", { fetchImpl: xFetch(), sleep })).rejects.toThrow(/not eligible/);
  });

  it("switching X back off leaves posts already submitted exactly as they are", async () => {
    const before = (await db.select().from(clips).where(eq(clips.platform, "x"))).length;
    await campaignSvc.setEligiblePlatforms("owner", A, ["tiktok"]);
    expect((await db.select().from(clips).where(eq(clips.platform, "x"))).length).toBe(before);
    await expect(clipSvc.submitClip("c1", A, "https://x.com/nasa/status/2114801524358406570", { fetchImpl: xFetch(), sleep })).rejects.toThrow(/not eligible/);
  });
});
