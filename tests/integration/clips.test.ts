import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import {
  users,
  platformAdmins,
  campaignMods,
  campaignCreators,
  campaigns,
  clips,
  notifications,
  scrapeCreatorsCache,
} from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as svc from "@/lib/clips/service";
import { fetchClipMetadata } from "@/lib/scrapecreators";
import { sendProofReminders } from "@/lib/notifications";

process.env.SCRAPECREATORS_API_KEY = "test-key";

let db: Awaited<ReturnType<typeof createTestDb>>;
let camp: string; // main campaign (tiktok+youtube, threshold $50, budget $10,000)
let campB: string; // a second tenant
let small: string; // tiny budget campaign
let n = 0;
const tiktok = () => `https://www.tiktok.com/@u/video/${900000 + ++n}`;

const tiktokBody = (views: number) => ({
  aweme_detail: {
    statistics: { play_count: views, digg_count: 42 },
    desc: "a caption",
    video: { cover: { url_list: ["https://img.example/c.jpg"] } },
  },
});
const okFetch = (views: number) =>
  (async () => ({ ok: true, status: 200, json: async () => tiktokBody(views) })) as unknown as typeof fetch;
const failFetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
const sleep = async () => {};
const opts = (views = 5000) => ({ fetchImpl: okFetch(views), sleep });

async function makeClip(creator: string, campaignId = camp, views = 5000) {
  const { clip } = await svc.submitClip(creator, campaignId, tiktok(), opts(views));
  return clip;
}

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin", username: "admin" },
    { id: "modA", username: "modA" },
    { id: "modB", username: "modB" },
    { id: "c1", username: "c1" },
    { id: "c2", username: "c2" },
    { id: "outsider", username: "outsider" },
    { id: "modOther", username: "modOther" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });
  camp = (await campaignSvc.createCampaign("owner", validCampaign)).id;
  campB = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "B" })).id;
  small = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Small", totalBudget: 300 })).id;
  await db.insert(campaignMods).values([
    { campaignId: camp, userId: "modA", addedBy: "owner" },
    { campaignId: camp, userId: "modB", addedBy: "owner" },
    { campaignId: campB, userId: "modOther", addedBy: "owner" },
  ]);
  for (const c of [camp, campB, small]) {
    await db.insert(campaignCreators).values([
      { campaignId: c, userId: "c1" },
      { campaignId: c, userId: "c2" },
    ]);
  }
});

describe("ScrapeCreators module", () => {
  it("retries 3 times with 1s/2s backoff, then succeeds and populates the cache", async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls < 3) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => tiktokBody(777) };
    }) as unknown as typeof fetch;
    const waits: number[] = [];
    const url = tiktok();
    const r = await fetchClipMetadata(url, "tiktok", { fetchImpl: flaky, sleep: async (ms) => void waits.push(ms) });
    expect(r).toMatchObject({ ok: true, stale: false, data: { views: 777, likes: 42, caption: "a caption" } });
    expect(calls).toBe(3);
    expect(waits).toEqual([1000, 2000]);
    const [cached] = await db.select().from(scrapeCreatorsCache).where(eq(scrapeCreatorsCache.url, url));
    expect(cached.views).toBe(777);
  });

  it("serves fresh cache without calling the API, and force bypasses it", async () => {
    const url = tiktok();
    await fetchClipMetadata(url, "tiktok", opts(100));
    let calls = 0;
    const counting = (async () => { calls++; return { ok: true, status: 200, json: async () => tiktokBody(200) }; }) as unknown as typeof fetch;
    const hit = await fetchClipMetadata(url, "tiktok", { fetchImpl: counting, sleep });
    expect(hit).toMatchObject({ ok: true, fromCache: true, data: { views: 100 } });
    expect(calls).toBe(0);
    const forced = await fetchClipMetadata(url, "tiktok", { fetchImpl: counting, sleep, force: true });
    expect(forced).toMatchObject({ data: { views: 200 } });
  });

  it("after retries fail, returns last cached value flagged stale instead of throwing", async () => {
    const url = tiktok();
    await fetchClipMetadata(url, "tiktok", opts(321));
    const r = await fetchClipMetadata(url, "tiktok", { fetchImpl: failFetch, sleep, force: true });
    expect(r).toMatchObject({ ok: true, stale: true, data: { views: 321 } });
  });

  it("with no cache and a failing API, returns ok:false rather than throwing", async () => {
    const r = await fetchClipMetadata(tiktok(), "tiktok", { fetchImpl: failFetch, sleep });
    expect(r.ok).toBe(false);
  });
});

describe("submitClip", () => {
  it("creates a pending clip populated from ScrapeCreators", async () => {
    const { clip } = await svc.submitClip("c1", camp, tiktok(), opts(1234));
    expect(clip).toMatchObject({ status: "pending", views: 1234, likes: 42, caption: "a caption", thumbnailUrl: "https://img.example/c.jpg" });
    expect(clip.lastRefreshedAt).not.toBeNull();
  });

  it("rejects a duplicate URL — same creator, and a different creator", async () => {
    const url = tiktok();
    await svc.submitClip("c1", camp, url, opts());
    await expect(svc.submitClip("c1", camp, url, opts())).rejects.toThrow("You've already submitted this link to this campaign.");
    const other = await svc.submitClip("c2", camp, url, opts()).catch((e: Error) => e.message);
    expect(other).toBe("This link has already been submitted to this campaign by another creator and can't be added again.");
    expect(other).not.toMatch(/c1/); // never names the first submitter
  });

  it("rejects a platform not in eligible_platforms", async () => {
    await expect(svc.submitClip("c1", camp, "https://www.instagram.com/reel/C1aBcDeFgH/", opts())).rejects.toThrow(/not eligible/);
  });

  it("stores the real Instagram post type (photo vs Reel) instead of rewriting everything to /reel/, while still catching the same post resubmitted under a different URL spelling", async () => {
    const igCamp = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "IG", eligiblePlatforms: ["instagram"] })).id;
    await db.insert(campaignCreators).values([{ campaignId: igCamp, userId: "c1" }, { campaignId: igCamp, userId: "c2" }]);

    const { clip: photo } = await svc.submitClip("c1", igCamp, "https://www.instagram.com/p/Cabcdefghi/?igsh=x", opts());
    expect(photo.url).toBe("https://www.instagram.com/p/Cabcdefghi");
    const { clip: tv } = await svc.submitClip("c1", igCamp, "https://www.instagram.com/tv/Cjklmnopqr/", opts());
    expect(tv.url).toBe("https://www.instagram.com/tv/Cjklmnopqr");

    // Duplicate detection is by postId, not by this exact path, so it still recognises the same
    // post under a different URL form: the same creator resubmitting it is hard-blocked...
    await expect(svc.submitClip("c1", igCamp, "https://instagram.com/reel/Cabcdefghi/", opts())).rejects.toThrow(
      "You've already submitted this link to this campaign.",
    );
    // ...and a DIFFERENT creator resubmitting it under yet another spelling is (as for any platform) a soft flag, not a block.
    const { clip: flagged } = await svc.submitClip("c2", igCamp, "https://instagram.com/reel/Cabcdefghi/", opts());
    expect(flagged.flaggedDuplicate).toBe(true);
    expect(flagged.flaggedReason).toMatch(/another creator/);
  });

  it("rejects garbage links", async () => {
    await expect(svc.submitClip("c1", camp, "https://example.com/video", opts())).rejects.toThrow(/doesn't look like/);
  });

  it("rejects the 101st submission in a day with a friendly message", async () => {
    await db.insert(users).values({ id: "heavy", username: "heavy" });
    await db.insert(campaignCreators).values({ campaignId: camp, userId: "heavy" });
    await db.insert(clips).values(
      Array.from({ length: 100 }, (_, i) => ({
        campaignId: camp,
        creatorUserId: "heavy",
        platform: "tiktok" as const,
        url: `https://www.tiktok.com/@h/video/${5000000 + i}`,
      })),
    );
    await expect(svc.submitClip("heavy", camp, tiktok(), opts())).rejects.toThrow(/Come back tomorrow/);
  });

  it("requires a campaign_creators row, and blocks suspended creators", async () => {
    await expect(svc.submitClip("outsider", camp, tiktok(), opts())).rejects.toThrow(/not joined/);
    await expect(svc.submitClip("modA", camp, tiktok(), opts())).rejects.toThrow(/not joined/);
    await db.update(campaignCreators).set({ suspended: true }).where(and(eq(campaignCreators.campaignId, campB), eq(campaignCreators.userId, "c2")));
    await expect(svc.submitClip("c2", campB, tiktok(), opts())).rejects.toThrow(/suspended/);
    await db.update(campaignCreators).set({ suspended: false }).where(and(eq(campaignCreators.campaignId, campB), eq(campaignCreators.userId, "c2")));
  });

  it("does not accept submissions on a paused campaign", async () => {
    await campaignSvc.pauseCampaign("owner", campB);
    await expect(svc.submitClip("c1", campB, tiktok(), opts())).rejects.toThrow(/not accepting/);
    await campaignSvc.reopenCampaign("owner", campB);
  });

  it("flags (but does not block) the same post submitted by another creator under a different URL", async () => {
    const id = 880000 + ++n;
    await svc.submitClip("c1", camp, `https://www.tiktok.com/@a/video/${id}`, opts());
    const { clip } = await svc.submitClip("c2", camp, `https://www.tiktok.com/@b/video/${id}`, opts());
    expect(clip.flaggedDuplicate).toBe(true);
    expect(clip.flaggedReason).toMatch(/another creator/);
  });

  it("does not flag across campaigns (tenant isolation)", async () => {
    const id = 870000 + ++n;
    await svc.submitClip("c1", camp, `https://www.tiktok.com/@a/video/${id}`, opts());
    const { clip } = await svc.submitClip("c2", campB, `https://www.tiktok.com/@a/video/${id}`, opts());
    expect(clip.flaggedDuplicate).toBe(false);
  });

  it("still saves the clip (zero stats, no refresh time) when ScrapeCreators is down", async () => {
    const { clip, statsAvailable } = await svc.submitClip("c1", camp, tiktok(), { fetchImpl: failFetch, sleep });
    expect(statsAvailable).toBe(false);
    expect(clip).toMatchObject({ views: 0, lastRefreshedAt: null });
  });
});

describe("analytics proof + qualifying audience %", () => {
  it("won't take a % before proof exists; then computes the payout with gating", async () => {
    const clip = await makeClip("c1", camp, 4_000_000);
    await expect(svc.setQualifyingAudiencePct("modA", camp, clip.id, 25)).rejects.toThrow(/proof is missing/);
    await expect(svc.attachVideoProof("c1", camp, clip.id, "https://evil.example/x")).rejects.toThrow();

    const withProof = await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/abcdefghijk");
    expect(withProof.videoProofUrl).toBe("https://youtu.be/abcdefghijk");
    expect(withProof.payout).toBeNull(); // proof alone earns nothing

    const set = await svc.setQualifyingAudiencePct("modA", camp, clip.id, 25);
    expect([set.cpm, set.earnings, set.payout]).toEqual(["0.5000", "2000.00", "500.00"]);
    expect(set.qualifyingPctSetBy).toBe("modA");
  });

  it("below the view minimum earns nothing even with proof and %", async () => {
    const clip = await makeClip("c1", camp, 500);
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/abcdefghijk");
    expect((await svc.setQualifyingAudiencePct("modA", camp, clip.id, 25)).payout).toBeNull();
  });

  it("proof can be replaced, and the payout is recomputed from the stored %", async () => {
    const clip = await makeClip("c1", camp, 10_000);
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("modA", camp, clip.id, 50);
    const replaced = await svc.attachVideoProof("c1", camp, clip.id, "https://drive.google.com/file/d/xyz/view");
    expect(replaced.payout).toBe("10.00");
  });

  it("validates the % range", async () => {
    const clip = await makeClip("c1", camp);
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await expect(svc.setQualifyingAudiencePct("modA", camp, clip.id, 101)).rejects.toThrow();
    await expect(svc.setQualifyingAudiencePct("modA", camp, clip.id, -1)).rejects.toThrow();
  });

  it("a Mod can't edit a % another Mod entered; Admin can; the original Mod can", async () => {
    const clip = await makeClip("c1", camp, 10_000);
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("modA", camp, clip.id, 40);
    await expect(svc.setQualifyingAudiencePct("modB", camp, clip.id, 10)).rejects.toThrow(/Admin or Owner/);
    expect((await svc.setQualifyingAudiencePct("modA", camp, clip.id, 30)).qualifyingAudiencePct).toBe("30.00");
    expect((await svc.setQualifyingAudiencePct("admin", camp, clip.id, 20)).qualifyingPctSetBy).toBe("admin");
  });

  it("a creator can only attach proof to their own clip", async () => {
    const clip = await makeClip("c1");
    await expect(svc.attachVideoProof("c2", camp, clip.id, "https://youtu.be/aaaaaaaaaaa")).rejects.toThrow(/not found/);
  });

  it("creators can't set a %; outsiders and other tenants' mods can't either", async () => {
    const clip = await makeClip("c1");
    await expect(svc.setQualifyingAudiencePct("c1", camp, clip.id, 10)).rejects.toThrow(/Access denied/);
    await expect(svc.setQualifyingAudiencePct("modOther", camp, clip.id, 10)).rejects.toThrow(/Access denied/);
  });
});

describe("reviewClip", () => {
  it("approve/reject write an audit event each time and notify the creator", async () => {
    const clip = await makeClip("c1");
    await expect(svc.reviewClip("modA", camp, clip.id, { action: "reject" })).rejects.toThrow(/reason/);
    await svc.reviewClip("modA", camp, clip.id, { action: "reject", reason: "bot-like spike" });
    const [rejected] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "bot-like spike" });
    await svc.reviewClip("modA", camp, clip.id, { action: "approve" }); // Mod changes own decision
    const [approved] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(approved).toMatchObject({ status: "approved", rejectionReason: null });

    const notes = await db.select().from(notifications).where(eq(notifications.clipId, clip.id));
    expect(notes.map((x) => x.type).sort()).toEqual(["clip_approved", "clip_rejected"]);
    expect(notes.find((x) => x.type === "clip_rejected")!.message).toMatch(/bot-like spike/);
    expect(notes.every((x) => x.userId === "c1")).toBe(true);
  });

  it("a Mod cannot override another Mod's decision; Admin and Owner can", async () => {
    const clip = await makeClip("c1");
    await svc.reviewClip("modA", camp, clip.id, { action: "approve" });
    await expect(svc.reviewClip("modB", camp, clip.id, { action: "reject", reason: "no" })).rejects.toThrow(/override/);
    await svc.reviewClip("admin", camp, clip.id, { action: "reject", reason: "admin says no" });
    await expect(svc.reviewClip("modA", camp, clip.id, { action: "approve" })).rejects.toThrow(/override/); // admin's call now
    await svc.reviewClip("owner", camp, clip.id, { action: "approve" });
    const [c] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(c.status).toBe("approved");
  });

  it("creators and other campaigns' mods cannot review", async () => {
    const clip = await makeClip("c1");
    await expect(svc.reviewClip("c1", camp, clip.id, { action: "approve" })).rejects.toThrow(/Access denied/);
    await expect(svc.reviewClip("modOther", camp, clip.id, { action: "approve" })).rejects.toThrow(/Access denied/);
  });

  it("a clip id from another campaign is 'not found' when addressed through this campaign", async () => {
    const other = await makeClip("c1", campB);
    await expect(svc.reviewClip("modA", camp, other.id, { action: "approve" })).rejects.toThrow(/not found/);
  });

  it("refuses to approve when the payout would exceed the remaining budget", async () => {
    const clip = await makeClip("c1", small, 4_000_000);
    await svc.attachVideoProof("c1", small, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("admin", small, clip.id, 25); // payout $500 > budget $300
    await expect(svc.reviewClip("admin", small, clip.id, { action: "approve" })).rejects.toThrow(/exceed/);
  });
});

async function approvedWithPayout(campaignId: string, creator: string, pct: number, views: number) {
  const clip = await makeClip(creator, campaignId, views);
  await svc.attachVideoProof(creator, campaignId, clip.id, "https://youtu.be/aaaaaaaaaaa");
  await svc.setQualifyingAudiencePct("admin", campaignId, clip.id, pct);
  await svc.reviewClip("admin", campaignId, clip.id, { action: "approve" });
  return clip;
}

describe("markPaid", () => {
  it("rejects a Mod above the threshold but lets Admin do it; increments budget_spent", async () => {
    const clip = await approvedWithPayout(camp, "c1", 25, 4_000_000); // $500 > $50 threshold
    await expect(svc.markPaid("modA", camp, clip.id)).rejects.toThrow(/threshold/);
    const before = (await db.select().from(campaigns).where(eq(campaigns.id, camp)))[0].budgetSpent;
    await svc.markPaid("admin", camp, clip.id);
    const after = (await db.select().from(campaigns).where(eq(campaigns.id, camp)))[0].budgetSpent;
    expect(Number(after) - Number(before)).toBe(500);
    const [c] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(c).toMatchObject({ paidStatus: "paid", paidBy: "admin" });
    expect((await db.select().from(notifications).where(eq(notifications.clipId, clip.id))).some((x) => x.type === "payout_paid")).toBe(true);
  });

  it("lets a Mod mark paid at or under the threshold", async () => {
    const clip = await approvedWithPayout(camp, "c2", 50, 10_000); // $10
    await svc.markPaid("modB", camp, clip.id);
    const [c] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(c.paidBy).toBe("modB");
  });

  it("rejects a payout that would exceed the campaign budget and leaves state untouched", async () => {
    const a = await approvedWithPayout(small, "c1", 10, 1_000_000); // $200 of $300
    await svc.markPaid("admin", small, a.id);
    const b = await approvedWithPayout(small, "c2", 10, 1_000_000).catch(() => null);
    // approval itself is already blocked once the remaining budget is too small
    expect(b).toBeNull();
    // force a second approved clip in directly to prove markPaid enforces the cap on its own
    const c = await makeClip("c2", small, 1_000_000);
    await db.update(clips).set({ status: "approved", payout: "150.00", videoProofUrl: "https://youtu.be/aaaaaaaaaaa" }).where(eq(clips.id, c.id));
    await expect(svc.markPaid("admin", small, c.id)).rejects.toThrow(/exceed/);
    const [row] = await db.select().from(clips).where(eq(clips.id, c.id));
    expect(row.paidStatus).toBe("unpaid");
    expect(Number((await db.select().from(campaigns).where(eq(campaigns.id, small)))[0].budgetSpent)).toBe(200);
  });

  it("concurrent payouts can't both slip under the cap", async () => {
    const camp2 = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Race", totalBudget: 150 })).id;
    await db.insert(campaignCreators).values({ campaignId: camp2, userId: "c1" });
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const c = await makeClip("c1", camp2);
      await db.update(clips).set({ status: "approved", payout: "100.00" }).where(eq(clips.id, c.id));
      ids.push(c.id);
    }
    const results = await Promise.allSettled(ids.map((id) => svc.markPaid("admin", camp2, id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await db.select().from(campaigns).where(eq(campaigns.id, camp2)))[0].budgetSpent)).toBe(100);
  });

  it("only approved, not-yet-paid clips with a payout can be marked paid", async () => {
    const pending = await makeClip("c1");
    await expect(svc.markPaid("admin", camp, pending.id)).rejects.toThrow(/approved/);
    const clip = await approvedWithPayout(camp, "c1", 50, 10_000);
    await svc.markPaid("admin", camp, clip.id);
    await expect(svc.markPaid("admin", camp, clip.id)).rejects.toThrow(/already/);
    await expect(svc.reviewClip("admin", camp, clip.id, { action: "reject", reason: "late" })).rejects.toThrow(/already been paid/);
  });

  it("creators can't mark paid", async () => {
    const clip = await approvedWithPayout(camp, "c1", 50, 10_000);
    await expect(svc.markPaid("c1", camp, clip.id)).rejects.toThrow(/Access denied/);
  });
});

describe("refreshViews", () => {
  it("updates views/likes and recomputes the payout for unpaid clips", async () => {
    const clip = await makeClip("c1", camp, 10_000);
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("modA", camp, clip.id, 50); // $10
    await svc.refreshViews("c1", camp, clip.id, opts(20_000));
    const [c] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(c).toMatchObject({ views: 20_000, payout: "20.00" });
  });

  it("keeps last-known-good numbers when the API is down", async () => {
    const clip = await makeClip("c1", camp, 7777);
    const r = await svc.refreshViews("c1", camp, clip.id, { fetchImpl: failFetch, sleep });
    expect(r.stale).toBe(true);
    expect((await db.select().from(clips).where(eq(clips.id, clip.id)))[0].views).toBe(7777);
  });

  it("a creator can't refresh someone else's clip", async () => {
    const clip = await makeClip("c1");
    await expect(svc.refreshViews("c2", camp, clip.id, opts())).rejects.toThrow(/not found/);
  });

  it("does not recalculate a paid clip (numbers already paid stay frozen)", async () => {
    const clip = await makeClip("c1", camp, 10_000);
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("admin", camp, clip.id, 50);
    await svc.reviewClip("admin", camp, clip.id, { action: "approve" });
    await svc.markPaid("admin", camp, clip.id);
    await svc.refreshViews("admin", camp, clip.id, opts(99_999));
    expect((await db.select().from(clips).where(eq(clips.id, clip.id)))[0].payout).toBe("10.00");
  });
});

describe('refreshCampaignClips (dashboard "Refresh all views now")', () => {
  // Fresh campaigns per test — `camp` already carries dozens of clips from earlier describe blocks,
  // which would fight with the oldest-refreshed-first cap below. The platform Owner ("owner") has
  // implicit access to every campaign, so these don't need a dedicated Mod assignment (a Mod can
  // only be on one campaign at a time — see campaign_mods' unique constraint on user_id).
  async function freshCampaign(name: string, creators = ["c1"]) {
    const c = await campaignSvc.createCampaign("owner", { ...validCampaign, name });
    await db.insert(campaignCreators).values(creators.map((userId) => ({ campaignId: c.id, userId })));
    return c.id;
  }

  it("refreshes every pending/approved-unpaid clip in THIS campaign only — never another campaign, a rejected clip, or a paid one", async () => {
    const campX = await freshCampaign("Refresh scope A");
    const campY = await freshCampaign("Refresh scope B");

    const inCamp = await makeClip("c1", campX, 1000);
    const otherCamp = await makeClip("c1", campY, 1000);

    const rejected = await makeClip("c1", campX, 1000);
    await svc.reviewClip("owner", campX, rejected.id, { action: "reject", reason: "spam" });

    const paid = await makeClip("c1", campX, 10_000);
    await svc.attachVideoProof("c1", campX, paid.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("owner", campX, paid.id, 50);
    await svc.reviewClip("owner", campX, paid.id, { action: "approve" });
    await svc.markPaid("owner", campX, paid.id);

    const r = await svc.refreshCampaignClips("owner", campX, opts(9999));
    expect(r).toMatchObject({ attempted: 1, updated: 1 });

    expect((await db.select().from(clips).where(eq(clips.id, inCamp.id)))[0].views).toBe(9999);
    // untouched: different campaign, rejected, and frozen-paid
    expect((await db.select().from(clips).where(eq(clips.id, otherCamp.id)))[0].views).toBe(1000);
    expect((await db.select().from(clips).where(eq(clips.id, rejected.id)))[0].views).toBe(1000);
    expect((await db.select().from(clips).where(eq(clips.id, paid.id)))[0].views).toBe(10_000);
  });

  it("is Mod/Admin/Owner only — a creator is denied", async () => {
    const campX = await freshCampaign("Refresh access");
    await makeClip("c1", campX, 1000);
    await expect(svc.refreshCampaignClips("c1", campX, opts())).rejects.toThrow(/Access denied/);
    await expect(svc.refreshCampaignClips("outsider", campX, opts())).rejects.toThrow(/Access denied/);
  });

  it("a mod from a different campaign can't trigger it here", async () => {
    const campX = await freshCampaign("Refresh cross-mod");
    await makeClip("c1", campX, 1000);
    await expect(svc.refreshCampaignClips("modOther", campX, opts())).rejects.toThrow(/Access denied/);
  });

  it("caps how many it refreshes per click, oldest-refreshed first", async () => {
    const campX = await freshCampaign("Refresh cap");
    for (let i = 0; i < 3; i++) await makeClip("c1", campX, 1000);
    const r = await svc.refreshCampaignClips("owner", campX, opts(5000), 2);
    expect(r).toMatchObject({ attempted: 2, updated: 2 });
  });
});

describe("cron helpers", () => {
  it("refreshAllClips refreshes unpaid, non-rejected clips in active campaigns", async () => {
    const clip = await makeClip("c1", camp, 1000);
    const r = await svc.refreshAllClips(opts(3000), 500);
    expect(r.attempted).toBeGreaterThan(0);
    expect((await db.select().from(clips).where(eq(clips.id, clip.id)))[0].views).toBe(3000);
  });

  it("sends one proof reminder per clip (Mods + campaign owner) after 7 days without proof", async () => {
    const c = await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Reminders" });
    await db.insert(campaignCreators).values({ campaignId: c.id, userId: "c1" });
    await db.insert(users).values({ id: "remMod", username: "remMod" });
    await db.insert(campaignMods).values({ campaignId: c.id, userId: "remMod", addedBy: "owner" });
    const old = await makeClip("c1", c.id);
    const fresh = await makeClip("c1", c.id);
    await db.update(clips).set({ submittedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(clips.id, old.id));

    await sendProofReminders();
    const notes = await db.select().from(notifications).where(eq(notifications.type, "proof_reminder"));
    const forOld = notes.filter((x) => x.clipId === old.id);
    expect(forOld.map((x) => x.userId).sort()).toEqual(["owner", "remMod"]);
    expect(notes.some((x) => x.clipId === fresh.id)).toBe(false);

    await sendProofReminders(); // idempotent
    expect((await db.select().from(notifications).where(eq(notifications.clipId, old.id))).length).toBe(2);
  });
});

describe("tenant isolation for clip reads", () => {
  it("creators only ever see their own clips; review queues are campaign-scoped and role-gated", async () => {
    const mine = await makeClip("c1", campB);
    await makeClip("c2", campB);
    const list = await svc.getCreatorClips("c1", campB);
    expect(list.every((c) => c.creatorUserId === "c1" && c.campaignId === campB)).toBe(true);
    expect(list.some((c) => c.id === mine.id)).toBe(true);

    const queue = await svc.getReviewQueue("modOther", campB);
    expect(queue.pending.every((r) => r.clip.campaignId === campB)).toBe(true);
    await expect(svc.getReviewQueue("modOther", camp)).rejects.toThrow(/Access denied/);
    await expect(svc.getReviewQueue("c1", camp)).rejects.toThrow(/Access denied/);
  });
});

describe("getClipHistory (Paid / Rejected lists + totals)", () => {
  it("lists paid and rejected clips with who/why, and totals paid vs owed exactly", async () => {
    const h = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "History" })).id;
    await db.insert(campaignCreators).values([
      { campaignId: h, userId: "c1" },
      { campaignId: h, userId: "c2" },
    ]);
    const approve = async (creator: string, views: number) => {
      const clip = await makeClip(creator, h, views);
      await svc.attachVideoProof(creator, h, clip.id, "https://youtu.be/aaaaaaaaaaa");
      await svc.setQualifyingAudiencePct("admin", h, clip.id, 50); // payout = views/1000 dollars
      await svc.reviewClip("admin", h, clip.id, { action: "approve" });
      return clip;
    };
    const paidClip = await approve("c1", 10_000); // $10.00
    await svc.markPaid("admin", h, paidClip.id);
    await approve("c2", 20_000); // $20.00 owed
    const rejected = await makeClip("c2", h);
    await svc.reviewClip("admin", h, rejected.id, { action: "reject", reason: "stolen link" });
    await makeClip("c1", h); // pending: counts toward neither total

    const hist = await svc.getClipHistory("admin", h);
    expect(hist.totals).toEqual({ paid: "10.00", owed: "20.00" });
    expect(hist.paid).toHaveLength(1);
    expect(hist.paid[0]).toMatchObject({ creatorUsername: "c1", paidByUsername: "admin" });
    expect(hist.paid[0].clip.id).toBe(paidClip.id);
    expect(hist.rejected).toHaveLength(1);
    expect(hist.rejected[0]).toMatchObject({ creatorUsername: "c2", rejectedBy: "admin" });
    expect(hist.rejected[0].clip.rejectionReason).toBe("stolen link");
  });

  it("is scoped to one campaign and gated to that campaign's reviewers", async () => {
    // camp/campB/small hold plenty of other data; none of it may leak into a fresh campaign
    const empty = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Empty" })).id;
    expect(await svc.getClipHistory("owner", empty)).toEqual({ paid: [], rejected: [], totals: { paid: "0.00", owed: "0.00" } });
    await expect(svc.getClipHistory("modOther", camp)).rejects.toThrow(/Access denied/);
    await expect(svc.getClipHistory("c1", camp)).rejects.toThrow(/Access denied/);
    expect((await svc.getClipHistory("modA", camp)).paid.every((r) => r.clip.campaignId === camp)).toBe(true);
  });
});

describe("getCreatorRoster (Creators list)", () => {
  it("aggregates per creator: clips, views, earned (approved) and owed (approved-unpaid), scoped to the campaign", async () => {
    const r = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Roster" })).id;
    await db.insert(campaignCreators).values([
      { campaignId: r, userId: "c1" },
      { campaignId: r, userId: "c2", suspended: true },
    ]);
    const approve = async (creator: string, views: number) => {
      const clip = await makeClip(creator, r, views);
      await svc.attachVideoProof(creator, r, clip.id, "https://youtu.be/aaaaaaaaaaa");
      await svc.setQualifyingAudiencePct("admin", r, clip.id, 50); // payout = views / 1000 dollars
      await svc.reviewClip("admin", r, clip.id, { action: "approve" });
      return clip;
    };
    const paid = await approve("c1", 10_000); // $10.00, paid below
    await svc.markPaid("admin", r, paid.id);
    await approve("c1", 20_000); // $20.00 owed
    await makeClip("c1", r, 5_000); // pending: counts as a clip and views, earns nothing yet

    // Same creator, big numbers in ANOTHER campaign: must not leak into this roster
    await makeClip("c1", camp, 400_000);

    const roster = await svc.getCreatorRoster("admin", r);
    expect(roster.map((x) => x.username)).toEqual(["c1", "c2"]); // sorted by earned desc
    // 3 clips here (10k + 20k + 5k views); the 400k-view clip lives in another campaign
    expect(roster[0]).toMatchObject({ clips: 3, views: 35_000, earned: "30.00", owed: "20.00", suspended: false });
    expect(roster[1]).toMatchObject({ clips: 0, views: 0, earned: "0.00", owed: "0.00", suspended: true });
  });

  it("includes joined creators with no clips as zero rows and flags suspended ones", async () => {
    const r = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Roster2" })).id;
    await db.insert(campaignCreators).values([
      { campaignId: r, userId: "c2", suspended: true },
      { campaignId: r, userId: "c1" },
    ]);
    const roster = await svc.getCreatorRoster("owner", r);
    expect(roster).toHaveLength(2);
    expect(roster.every((x) => x.clips === 0 && x.views === 0 && x.earned === "0.00" && x.owed === "0.00")).toBe(true);
    expect(roster.find((x) => x.username === "c2")?.suspended).toBe(true);
  });

  it("is gated to that campaign's reviewers and never shows another campaign's creators", async () => {
    const empty = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Roster3" })).id;
    expect(await svc.getCreatorRoster("owner", empty)).toEqual([]);
    await expect(svc.getCreatorRoster("c1", camp)).rejects.toThrow(/Access denied/);
    await expect(svc.getCreatorRoster("modOther", camp)).rejects.toThrow(/Access denied/);
    expect((await svc.getCreatorRoster("modA", camp)).length).toBeGreaterThan(0);
  });
});
