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
  clipReviewEvents,
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

// Task 5 Part 3: every clip needs a posted_at before proof can ever be attached. Every existing test
// predates that gate and assumes "submit, then immediately attach proof" — so the default here is a
// post from well outside the 7-day window (30 days ago), unlocked from the moment it's created.
// Gate-specific tests below override this explicitly (recent, or null entirely).
const daysAgoEpochSeconds = (days: number) => Math.floor(Date.now() / 1000) - days * 86_400;

const tiktokBody = (views: number, postedDaysAgo: number | null = 30) => ({
  aweme_detail: {
    statistics: { play_count: views, digg_count: 42 },
    desc: "a caption",
    video: { cover: { url_list: ["https://img.example/c.jpg"] } },
    ...(postedDaysAgo !== null ? { create_time: daysAgoEpochSeconds(postedDaysAgo) } : {}),
  },
});
const okFetch = (views: number, postedDaysAgo: number | null = 30) =>
  (async () => ({ ok: true, status: 200, json: async () => tiktokBody(views, postedDaysAgo) })) as unknown as typeof fetch;
const failFetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
const sleep = async () => {};
const opts = (views = 5000, postedDaysAgo: number | null = 30) => ({ fetchImpl: okFetch(views, postedDaysAgo), sleep });

// Real Instagram shape: a photo/carousel has is_video: false and NO video_play_count/video_view_count at
// all — that's the confirmation manual view entry relies on, not the views number itself being 0.
const igBody = (isVideo: boolean, views: number, likes = 40, postedDaysAgo: number | null = 30) => ({
  data: {
    xdt_shortcode_media: {
      is_video: isVideo,
      ...(isVideo ? { video_play_count: views } : {}),
      edge_media_preview_like: { count: likes },
      ...(postedDaysAgo !== null ? { taken_at_timestamp: daysAgoEpochSeconds(postedDaysAgo) } : {}),
    },
  },
});
const igFetch = (isVideo: boolean, views: number, likes = 40, postedDaysAgo: number | null = 30) =>
  (async () => ({ ok: true, status: 200, json: async () => igBody(isVideo, views, likes, postedDaysAgo) })) as unknown as typeof fetch;
const igOpts = (isVideo: boolean, views = 0, likes = 40) => ({ fetchImpl: igFetch(isVideo, views, likes), sleep });

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
  it("creates an awaiting_analytics clip populated from ScrapeCreators, including its posted_at", async () => {
    const { clip } = await svc.submitClip("c1", camp, tiktok(), opts(1234));
    expect(clip).toMatchObject({ status: "awaiting_analytics", views: 1234, likes: 42, caption: "a caption", thumbnailUrl: "https://img.example/c.jpg" });
    expect(clip.lastRefreshedAt).not.toBeNull();
    expect(clip.postedAt).not.toBeNull(); // 30 days ago per the default test fixture
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

describe("Task 5 Part 3: 7-day analytics-proof gate", () => {
  async function freshCampaign(name: string) {
    const c = (await campaignSvc.createCampaign("owner", { ...validCampaign, name })).id;
    await db.insert(campaignCreators).values({ campaignId: c, userId: "c1" });
    return c;
  }

  it("a post <7 days old: proof is refused, but the clip still shows up in the reviewer's Pending queue (submitted, not yet reviewed)", async () => {
    const campX = await freshCampaign("Gate: too young");
    const { clip } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 3)); // posted 3 days ago
    expect(clip.status).toBe("awaiting_analytics");
    await expect(svc.attachVideoProof("c1", campX, clip.id, "https://youtu.be/aaaaaaaaaaa")).rejects.toThrow(
      /can't be submitted until 7 days/,
    );
    const [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row).toMatchObject({ status: "awaiting_analytics", videoProofUrl: null });
    // Pending now means "submitted, not yet Analytics Approved/Rejected" -- awaiting_analytics included,
    // regardless of proof (see filteredClipHistory/getReviewQueue). Analytics Approve itself still can't
    // run without proof (reviewClip's own guard), so nothing here changes what actually pays.
    expect((await svc.getReviewQueue("owner", campX)).pending.some((r) => r.clip.id === clip.id)).toBe(true);
    await expect(svc.reviewClip("owner", campX, clip.id, { action: "approve" })).rejects.toThrow(/proof is missing/);
  });

  it("a post >=7 days old: proof is accepted and the clip moves straight into the pending review queue", async () => {
    const campX = await freshCampaign("Gate: old enough");
    const { clip } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 7)); // exactly at the boundary
    const row = await svc.attachVideoProof("c1", campX, clip.id, "https://youtu.be/aaaaaaaaaaa");
    expect(row.status).toBe("pending");
    expect((await svc.getReviewQueue("owner", campX)).pending.some((r) => r.clip.id === clip.id)).toBe(true);
  });

  it("an unknown posted_at NEVER counts as '7 days have passed' — stays locked no matter how long ago it was submitted", async () => {
    const campX = await freshCampaign("Gate: unknown date");
    const { clip } = await svc.submitClip("c1", campX, tiktok(), { fetchImpl: failFetch, sleep }); // ScrapeCreators down at submission
    expect(clip.postedAt).toBeNull();
    await db.update(clips).set({ submittedAt: new Date(Date.now() - 365 * 86_400_000) }).where(eq(clips.id, clip.id));
    await expect(svc.attachVideoProof("c1", campX, clip.id, "https://youtu.be/aaaaaaaaaaa")).rejects.toThrow(
      /post date isn't available/,
    );
  });

  it("a refresh fills in a posted_at that was missing, and never overwrites one that's already set", async () => {
    const campX = await freshCampaign("Gate: refresh fills in date");
    const { clip } = await svc.submitClip("c1", campX, tiktok(), { fetchImpl: failFetch, sleep });
    expect(clip.postedAt).toBeNull();
    await svc.refreshViews("c1", campX, clip.id, opts(2000, 10)); // now succeeds, posted 10 days ago
    const [afterFirst] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(afterFirst.postedAt).not.toBeNull();
    const capturedAt = afterFirst.postedAt;

    await svc.refreshViews("c1", campX, clip.id, opts(3000, 1)); // a later, different date must never overwrite it
    const [afterSecond] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(afterSecond.postedAt).toEqual(capturedAt);
  });

  it("setPostedAt: Mod/Admin/Owner only, refuses once a date is already known, and unlocks + logs the event when proof already exists", async () => {
    const campX = await freshCampaign("Gate: manual override");
    const { clip } = await svc.submitClip("c1", campX, tiktok(), { fetchImpl: failFetch, sleep });
    await expect(svc.setPostedAt("c1", campX, clip.id, "2020-01-01")).rejects.toThrow(/Access denied/);

    // Proof can't be attached yet (posted_at unknown) — seed it directly to simulate a creator who
    // was told to just wait, exactly like the retroactive case: proof exists, the gate is what's stuck.
    await db.update(clips).set({ videoProofUrl: "https://youtu.be/aaaaaaaaaaa" }).where(eq(clips.id, clip.id));

    const old = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const row = await svc.setPostedAt("owner", campX, clip.id, old);
    expect(row.status).toBe("pending"); // proof was already there and this date clears the gate -> unlocked immediately
    expect(row.postedAtSetBy).toBe("owner");

    const [event] = await db
      .select()
      .from(clipReviewEvents)
      .where(and(eq(clipReviewEvents.clipId, clip.id), eq(clipReviewEvents.action, "set_posted_at")));
    expect(event).toMatchObject({ actorUserId: "owner" });

    await expect(svc.setPostedAt("owner", campX, clip.id, "2021-01-01")).rejects.toThrow(/already known/);
  });

  it("setPostedAt rejects a future date", async () => {
    const campX = await freshCampaign("Gate: future date");
    const { clip } = await svc.submitClip("c1", campX, tiktok(), { fetchImpl: failFetch, sleep });
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await expect(svc.setPostedAt("owner", campX, clip.id, future)).rejects.toThrow(/future/);
  });

  describe("runAnalyticsGateSweep", () => {
    it("silently unlocks a clip that already has proof once its window clears — no notification", async () => {
      const campX = await freshCampaign("Sweep: silent unlock");
      const { clip } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 8)); // 8 days ago, past the gate
      await db.update(clips).set({ videoProofUrl: "https://youtu.be/aaaaaaaaaaa" }).where(eq(clips.id, clip.id)); // proof landed directly, bypassing attachVideoProof's own unlock

      const r = await svc.runAnalyticsGateSweep();
      expect(r.transitioned).toBeGreaterThanOrEqual(1);
      const [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
      expect(row.status).toBe("pending");
      expect((await db.select().from(notifications).where(eq(notifications.clipId, clip.id))).length).toBe(0);
    });

    it("notifies exactly once for a clip that's unlocked but has no proof yet", async () => {
      const campX = await freshCampaign("Sweep: notify once");
      const { clip } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 8));

      const first = await svc.runAnalyticsGateSweep();
      expect(first.notified).toBeGreaterThanOrEqual(1);
      const notesAfterFirst = await db.select().from(notifications).where(eq(notifications.clipId, clip.id));
      expect(notesAfterFirst).toHaveLength(1);
      expect(notesAfterFirst[0]).toMatchObject({ userId: "c1", type: "analytics_unlocked" });

      const second = await svc.runAnalyticsGateSweep();
      const notesAfterSecond = await db.select().from(notifications).where(eq(notifications.clipId, clip.id));
      expect(notesAfterSecond).toHaveLength(1); // not sent twice
      expect(second.notified).toBe(0);
    });

    it("touches neither a clip still within its 7-day window nor one with an unknown posted_at", async () => {
      const campX = await freshCampaign("Sweep: leaves locked clips alone");
      const { clip: tooYoung } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 2));
      const { clip: unknownDate } = await svc.submitClip("c1", campX, tiktok(), { fetchImpl: failFetch, sleep });

      await svc.runAnalyticsGateSweep();
      for (const id of [tooYoung.id, unknownDate.id]) {
        const [row] = await db.select().from(clips).where(eq(clips.id, id));
        expect(row.status).toBe("awaiting_analytics");
        expect((await db.select().from(notifications).where(eq(notifications.clipId, id))).length).toBe(0);
      }
    });

    it("skips a deleted clip and a clip in a paused campaign", async () => {
      const campX = await freshCampaign("Sweep: excludes deleted/paused");
      const { clip: deleted } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 8));
      await svc.deleteClip("owner", campX, deleted.id);

      const campY = await freshCampaign("Sweep: paused campaign");
      const { clip: paused } = await svc.submitClip("c1", campY, tiktok(), opts(1000, 8));
      await campaignSvc.pauseCampaign("owner", campY);

      const r = await svc.runAnalyticsGateSweep();
      expect(r.notified).toBe(0);
      const [pausedRow] = await db.select().from(clips).where(eq(clips.id, paused.id));
      expect(pausedRow.status).toBe("awaiting_analytics"); // untouched — a paused campaign gets no notifications
    });
  });

  it("the History 'Waiting for Analytics' filter surfaces the whole bucket — locked and unlocked-but-unsubmitted alike", async () => {
    const campX = await freshCampaign("History: waiting for analytics");
    const { clip: locked } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 2));
    const { clip: unlockedNoProof } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 8));
    const { clip: unknownDate } = await svc.submitClip("c1", campX, tiktok(), { fetchImpl: failFetch, sleep });
    const { clip: pendingClip } = await svc.submitClip("c1", campX, tiktok(), opts(1000, 30));
    await svc.attachVideoProof("c1", campX, pendingClip.id, "https://youtu.be/aaaaaaaaaaa");

    const { rows, summary } = await svc.getReviewerClipHistory("owner", campX, { status: "awaiting_analytics" });
    expect(rows.map((r) => r.clip.id).sort()).toEqual([locked.id, unknownDate.id, unlockedNoProof.id].sort());
    expect(summary.awaitingAnalytics).toBe(3);
    // "Pending" now includes awaiting_analytics -- submitted but not yet Analytics Approved/Rejected,
    // regardless of proof. All 4 clips here qualify (3 awaiting_analytics + 1 genuinely pending).
    expect(summary.pending).toBe(4);
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

describe("setManualViews (Instagram photo/carousel posts)", () => {
  const igCamp = "IG manual views";
  async function igCampaign() {
    const c = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: igCamp, eligiblePlatforms: ["instagram", "tiktok"] })).id;
    await db.insert(campaignCreators).values({ campaignId: c, userId: "c1" });
    return c;
  }
  async function igClip(id: string, isVideo: boolean, views = 0) {
    const { clip } = await svc.submitClip("c1", id, `https://www.instagram.com/p/ig${++n}/`, igOpts(isVideo, views));
    return clip;
  }

  it("is refused for a real video, an unrefreshed clip, and a non-Instagram platform — only a confirmed photo/carousel qualifies", async () => {
    const c = await igCampaign();
    const video = await igClip(c, true, 500_000);
    await expect(svc.setManualViews("owner", c, video.id, "1000")).rejects.toThrow(/photo\/carousel/);

    // Same platform as a real carousel, but never successfully fetched — isVideo is null, not false, so it's refused too.
    const { clip: unrefreshed } = await svc.submitClip("c1", c, `https://www.instagram.com/p/ig${++n}/`, { fetchImpl: failFetch, sleep });
    expect(unrefreshed.isVideo).toBeNull();
    await expect(svc.setManualViews("owner", c, unrefreshed.id, "1000")).rejects.toThrow(/photo\/carousel/);

    const tiktokClip = await makeClip("c1", c, 500);
    await expect(svc.setManualViews("owner", c, tiktokClip.id, "1000")).rejects.toThrow(/photo\/carousel/);

    const carousel = await igClip(c, false);
    const row = await svc.setManualViews("owner", c, carousel.id, "12345");
    expect(row.manualViews).toBe(12345);
  });

  it("feeds the payout formula exactly like an auto-fetched view count would", async () => {
    const c = await igCampaign();
    const clip = await igClip(c, false); // auto views stuck at 0 forever — genuine carousel
    await svc.attachVideoProof("c1", c, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("owner", c, clip.id, 50);
    expect((await db.select().from(clips).where(eq(clips.id, clip.id)))[0].payout).toBeNull(); // 0 views: below minimum

    const set = await svc.setManualViews("owner", c, clip.id, "10000");
    expect([set.views, set.manualViews, set.cpm, set.payout]).toEqual([0, 10000, "1.0000", "10.00"]);
  });

  it("a blank submission clears the override and reverts to the automatic number", async () => {
    const c = await igCampaign();
    const clip = await igClip(c, false);
    await svc.attachVideoProof("c1", c, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("owner", c, clip.id, 50);
    await svc.setManualViews("owner", c, clip.id, "10000");
    const cleared = await svc.setManualViews("owner", c, clip.id, "");
    expect(cleared.manualViews).toBeNull();
    expect(cleared.payout).toBeNull(); // back to the real (0) auto views, below minimum
  });

  it("is Mod/Admin/Owner only — a creator and an outsider are denied", async () => {
    const c = await igCampaign();
    const clip = await igClip(c, false);
    await expect(svc.setManualViews("c1", c, clip.id, "1000")).rejects.toThrow(/Access denied/);
    await expect(svc.setManualViews("outsider", c, clip.id, "1000")).rejects.toThrow(/Access denied/);
  });

  it("a Mod can't edit another Mod's manual entry; Admin/Owner can", async () => {
    const c = await igCampaign();
    // Dedicated Mod users — a Mod can only be on one campaign at a time (modA/modB already belong to `camp`).
    await db.insert(users).values([{ id: "ivModA", username: "ivModA" }, { id: "ivModB", username: "ivModB" }]);
    await db.insert(campaignMods).values([
      { campaignId: c, userId: "ivModA", addedBy: "owner" },
      { campaignId: c, userId: "ivModB", addedBy: "owner" },
    ]);
    const clip = await igClip(c, false);
    await svc.setManualViews("ivModA", c, clip.id, "1000");
    await expect(svc.setManualViews("ivModB", c, clip.id, "2000")).rejects.toThrow(/Admin or Owner/);
    expect((await svc.setManualViews("admin", c, clip.id, "3000")).manualViewsSetBy).toBe("admin");
  });

  it("rejects a paid clip, and validates the input", async () => {
    const c = await igCampaign();
    const clip = await igClip(c, false, 0);
    await svc.attachVideoProof("c1", c, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("owner", c, clip.id, 50);
    await svc.setManualViews("owner", c, clip.id, "10000");
    await svc.reviewClip("owner", c, clip.id, { action: "approve" });
    await svc.markPaid("owner", c, clip.id);
    await expect(svc.setManualViews("owner", c, clip.id, "20000")).rejects.toThrow(/already been paid/);

    const other = await igClip(c, false);
    await expect(svc.setManualViews("owner", c, other.id, "not a number")).rejects.toThrow();
    await expect(svc.setManualViews("owner", c, other.id, "-5")).rejects.toThrow();
    await expect(svc.setManualViews("owner", c, other.id, "1.5")).rejects.toThrow();
  });

  it("a refresh never clobbers a manual override, even when ScrapeCreators keeps returning 0", async () => {
    const c = await igCampaign();
    const clip = await igClip(c, false);
    await svc.setManualViews("owner", c, clip.id, "10000");
    await svc.refreshViews("owner", c, clip.id, igOpts(false, 0));
    const [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row).toMatchObject({ views: 0, manualViews: 10000 });
  });

});

describe("reviewClip", () => {
  it("approve/reject write an audit event each time and notify the creator", async () => {
    const clip = await makeClip("c1");
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa"); // Analytics Approve now requires proof to exist
    await expect(svc.reviewClip("modA", camp, clip.id, { action: "reject" })).rejects.toThrow(/reason/);
    await svc.reviewClip("modA", camp, clip.id, { action: "reject", reason: "bot-like spike" });
    const [rejected] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "bot-like spike" });
    await svc.reviewClip("modA", camp, clip.id, { action: "approve" }); // Mod changes own decision -- Analytics Approve stays Mod/Admin/Owner
    const [approved] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(approved).toMatchObject({ status: "approved", rejectionReason: null });

    const notes = await db.select().from(notifications).where(eq(notifications.clipId, clip.id));
    expect(notes.map((x) => x.type).sort()).toEqual(["clip_approved", "clip_rejected"]);
    expect(notes.find((x) => x.type === "clip_rejected")!.message).toMatch(/bot-like spike/);
    expect(notes.every((x) => x.userId === "c1")).toBe(true);
  });

  it("a Mod cannot override another Mod's decision; Admin and Owner can", async () => {
    const clip = await makeClip("c1");
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa"); // Analytics Approve now requires proof to exist
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

describe("clipApprove (two-step approval, Task: Clip Approved / Analytics Approved)", () => {
  it("is settable while still locked behind the 7-day gate, before any proof exists -- independent of status and the gate", async () => {
    const { clip } = await svc.submitClip("c1", camp, tiktok(), opts(1000, 2)); // posted 2 days ago -> still locked
    expect(clip.status).toBe("awaiting_analytics");
    expect(clip.videoProofUrl).toBeNull();

    const before = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(before[0].clipApproved).toBe(false);

    await svc.clipApprove("admin", camp, clip.id);
    const [after] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(after).toMatchObject({ clipApproved: true, clipApprovedBy: "admin", status: "awaiting_analytics" }); // status/gate untouched
    expect(after.clipApprovedAt).not.toBeNull();

    const events = await db.select().from(clipReviewEvents).where(eq(clipReviewEvents.clipId, clip.id));
    expect(events.map((e) => e.action)).toEqual(["clip_approve"]);
  });

  it("has no effect on payout math whatsoever until Analytics Approve actually runs", async () => {
    const clip = await makeClip("c1", camp, 5000);
    await svc.clipApprove("admin", camp, clip.id);
    let [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row).toMatchObject({ clipApproved: true, cpm: null, earnings: null, payout: null, status: "awaiting_analytics" });

    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa");
    [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row).toMatchObject({ clipApproved: true, payout: null, status: "pending" }); // proof alone still doesn't pay

    await svc.setQualifyingAudiencePct("admin", camp, clip.id, 50);
    [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row.payout).not.toBeNull(); // computed once %, is set...
    const payoutBeforeAnalyticsApprove = row.payout;
    expect(row.status).toBe("pending"); // ...but the STATUS (what actually pays) hasn't moved to "approved" yet

    await svc.reviewClip("admin", camp, clip.id, { action: "approve" });
    [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row).toMatchObject({ status: "approved", payout: payoutBeforeAnalyticsApprove }); // unchanged by clipApprove having run first
  });

  it("Clip Approved, then Analytics-Rejected -- the final outcome is a full reject with zero payout, regardless of the earlier Clip Approved state", async () => {
    const clip = await makeClip("c1", camp, 5000);
    await svc.attachVideoProof("c1", camp, clip.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("admin", camp, clip.id, 50);
    await svc.clipApprove("admin", camp, clip.id);

    await svc.reviewClip("admin", camp, clip.id, { action: "reject", reason: "bad proof" });
    const [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row).toMatchObject({ clipApproved: true, status: "rejected", rejectionReason: "bad proof" }); // flag stands, but it never guaranteed payment
    expect(row.paidStatus).toBe("unpaid");
    await expect(svc.markPaid("admin", camp, clip.id)).rejects.toThrow(); // no path to payout from here
  });

  it("is idempotent-guarded (can't Clip Approve twice) and Admin/Owner only", async () => {
    const clip = await makeClip("c1", camp, 1000);
    await expect(svc.clipApprove("modA", camp, clip.id)).rejects.toThrow(/Access denied/);
    await expect(svc.clipApprove("c1", camp, clip.id)).rejects.toThrow(/Access denied/);
    await svc.clipApprove("admin", camp, clip.id);
    await expect(svc.clipApprove("owner", camp, clip.id)).rejects.toThrow(/already been Clip Approved/);
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

describe("deleteClip (soft delete — Owner/Admin only)", () => {
  async function freshCampaign(name: string) {
    const c = (await campaignSvc.createCampaign("owner", { ...validCampaign, name })).id;
    await db.insert(campaignCreators).values([{ campaignId: c, userId: "c1" }, { campaignId: c, userId: "c2" }]);
    return c;
  }

  it("is Owner/Admin only — a Mod, a creator, and an outsider are all refused", async () => {
    const campX = await freshCampaign("Delete access");
    const clip = await makeClip("c1", campX, 1000);
    await expect(svc.deleteClip("modA", campX, clip.id)).rejects.toThrow(/Access denied/); // modA belongs to `camp`, not this one anyway
    await expect(svc.deleteClip("c1", campX, clip.id)).rejects.toThrow(/Access denied/);
    await expect(svc.deleteClip("outsider", campX, clip.id)).rejects.toThrow(/Access denied/);
    // untouched by every refusal
    const [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row.deletedAt).toBeNull();
  });

  it("Owner/Admin can delete a clip in ANY status — pending, approved-unpaid, rejected, and paid", async () => {
    const campX = await freshCampaign("Delete any status");
    const pending = await makeClip("c1", campX, 1000);
    const rejected = await makeClip("c1", campX, 1000);
    await svc.reviewClip("owner", campX, rejected.id, { action: "reject", reason: "spam" });
    const approvedUnpaid = await approvedWithPayout(campX, "c1", 60, 4000);
    const paid = await approvedWithPayout(campX, "c1", 60, 4000);
    await svc.markPaid("owner", campX, paid.id);

    await svc.deleteClip("owner", campX, pending.id);
    await svc.deleteClip("admin", campX, rejected.id);
    await svc.deleteClip("owner", campX, approvedUnpaid.id);
    await svc.deleteClip("admin", campX, paid.id);

    for (const id of [pending.id, rejected.id, approvedUnpaid.id, paid.id]) {
      const [row] = await db.select().from(clips).where(eq(clips.id, id));
      expect(row.deletedAt).not.toBeNull();
    }
    // the paid clip's payout/audit data is untouched, just no longer listed anywhere (checked below)
    const [paidRow] = await db.select().from(clips).where(eq(clips.id, paid.id));
    expect(paidRow).toMatchObject({ paidStatus: "paid", payout: "4.00", deletedBy: "admin" });
  });

  it("logs a clip_review_events entry recording the actor and the prior status", async () => {
    const campX = await freshCampaign("Delete audit trail");
    const clip = await approvedWithPayout(campX, "c1", 50, 10_000);
    await svc.deleteClip("owner", campX, clip.id);
    const [event] = await db
      .select()
      .from(clipReviewEvents)
      .where(and(eq(clipReviewEvents.clipId, clip.id), eq(clipReviewEvents.action, "delete")));
    expect(event).toMatchObject({ actorUserId: "owner" });
    expect(event.reason).toMatch(/approved/i);
  });

  it("disappears from every list/query: review queue, both history views, and the roster's aggregates", async () => {
    const campX = await freshCampaign("Delete visibility");
    const pending = await makeClip("c1", campX, 1000);
    const rejected = await makeClip("c1", campX, 1000);
    await svc.reviewClip("owner", campX, rejected.id, { action: "reject", reason: "spam" });
    const paid = await approvedWithPayout(campX, "c1", 60, 4000);
    await svc.markPaid("owner", campX, paid.id);

    const rosterBefore = await svc.getCreatorRoster("owner", campX);
    const c1Before = rosterBefore.find((r) => r.userId === "c1")!;

    await svc.deleteClip("owner", campX, pending.id);
    await svc.deleteClip("owner", campX, rejected.id);
    await svc.deleteClip("owner", campX, paid.id);

    expect((await svc.getReviewQueue("owner", campX)).pending.map((r) => r.clip.id)).not.toContain(pending.id);
    const history = await svc.getClipHistory("owner", campX);
    expect(history.paid.map((r) => r.clip.id)).not.toContain(paid.id);
    expect(history.rejected.map((r) => r.clip.id)).not.toContain(rejected.id);
    const filtered = await svc.getReviewerClipHistory("owner", campX);
    expect(filtered.rows.map((r) => r.clip.id)).toEqual([]);
    expect(filtered.summary.total).toBe(0);

    const rosterAfter = await svc.getCreatorRoster("owner", campX);
    const c1After = rosterAfter.find((r) => r.userId === "c1")!;
    expect(c1After.clips).toBe(c1Before.clips - 3);
    expect(Number(c1Before.earned)).toBeGreaterThan(0); // sanity: the paid clip really was counted before
    expect(c1After.earned).toBe("0.00"); // every clip (including the paid one) is now deleted, so nothing is left to count
  });

  it("frees a PENDING (never-paid) clip's URL up for resubmission — by the same creator, or a different one", async () => {
    const campX = await freshCampaign("Delete frees URL");
    const url = tiktok();
    const original = (await svc.submitClip("c1", campX, url, opts())).clip;
    await svc.deleteClip("owner", campX, original.id);

    const resubmitted = await svc.submitClip("c1", campX, url, opts()); // same creator, same exact link
    expect(resubmitted.clip.deletedAt).toBeNull();
    await svc.deleteClip("owner", campX, resubmitted.clip.id);
    const byOther = await svc.submitClip("c2", campX, url, opts()); // different creator, after a second delete
    expect(byOther.clip.deletedAt).toBeNull();
  });

  it("keeps a PAID-then-deleted clip's URL permanently blocked — it can never be resubmitted and re-earned", async () => {
    const campX = await freshCampaign("Delete keeps paid URL blocked");
    const url = tiktok();
    const { clip: submitted } = await svc.submitClip("c1", campX, url, opts(4000));
    await svc.attachVideoProof("c1", campX, submitted.id, "https://youtu.be/aaaaaaaaaaa");
    await svc.setQualifyingAudiencePct("owner", campX, submitted.id, 60);
    await svc.reviewClip("owner", campX, submitted.id, { action: "approve" });
    await svc.markPaid("owner", campX, submitted.id);
    await svc.deleteClip("owner", campX, submitted.id);

    // same creator, exact same link — blocked, and correctly attributed as their own
    await expect(svc.submitClip("c1", campX, url, opts())).rejects.toThrow(
      "You've already submitted this link to this campaign.",
    );
    // a different creator trying the same link — blocked, and never reveals who it belongs to
    const other = await svc.submitClip("c2", campX, url, opts()).catch((e: Error) => e.message);
    expect(other).toBe("This link has already been submitted to this campaign by another creator and can't be added again.");
    expect(other).not.toMatch(/c1/);

    // the deleted, paid clip itself is untouched by any of these attempts
    const [row] = await db.select().from(clips).where(eq(clips.id, submitted.id));
    expect(row).toMatchObject({ paidStatus: "paid", deletedAt: expect.anything() });
  });

  it("deleting an already-deleted clip, or one from another campaign, is refused as \"not found\"", async () => {
    const campX = await freshCampaign("Delete idempotency");
    const campY = await freshCampaign("Delete idempotency B");
    const clip = await makeClip("c1", campX, 1000);
    await svc.deleteClip("owner", campX, clip.id);
    await expect(svc.deleteClip("owner", campX, clip.id)).rejects.toThrow(/not found/i);
    await expect(svc.deleteClip("owner", campY, clip.id)).rejects.toThrow(/not found/i);
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

describe("filterable clip history (getReviewerClipHistory / getMyClipHistory)", () => {
  async function freshCampaign(name: string) {
    const c = (await campaignSvc.createCampaign("owner", { ...validCampaign, name })).id;
    await db.insert(campaignCreators).values([{ campaignId: c, userId: "c1" }, { campaignId: c, userId: "c2" }]);
    return c;
  }

  it("scopes the reviewer view to THIS campaign only, and covers every status including pending/approved-unpaid/paid", async () => {
    const campX = await freshCampaign("History scope A");
    const campY = await freshCampaign("History scope B");
    const pending = await makeClip("c1", campX, 1000);
    await svc.attachVideoProof("c1", campX, pending.id, "https://youtu.be/aaaaaaaaaaa"); // clears the gate -> genuinely "pending"
    const rejected = await makeClip("c1", campX, 1000);
    await svc.reviewClip("owner", campX, rejected.id, { action: "reject", reason: "spam" });
    const approvedUnpaid = await approvedWithPayout(campX, "c1", 60, 4000);
    const paid = await approvedWithPayout(campX, "c1", 60, 4000);
    await svc.markPaid("owner", campX, paid.id);
    await makeClip("c1", campY, 1000); // a different campaign — must never appear

    const { summary, rows } = await svc.getReviewerClipHistory("owner", campX);
    expect(summary).toMatchObject({ total: 4, pending: 1, approved: 2, rejected: 1, paid: 1 });
    const ids = rows.map((r) => r.clip.id);
    expect(ids).toEqual(expect.arrayContaining([pending.id, rejected.id, approvedUnpaid.id, paid.id]));
    expect(ids).toHaveLength(4);
  });

  it("the status filter narrows the list but the summary counts stay the full-range breakdown", async () => {
    const campX = await freshCampaign("History filter tabs");
    const pending = await makeClip("c1", campX, 1000);
    await svc.attachVideoProof("c1", campX, pending.id, "https://youtu.be/aaaaaaaaaaa"); // clears the gate -> genuinely "pending"
    const rejected = await makeClip("c1", campX, 1000);
    await svc.reviewClip("owner", campX, rejected.id, { action: "reject", reason: "spam" });
    const paid = await approvedWithPayout(campX, "c1", 60, 4000);
    await svc.markPaid("owner", campX, paid.id);

    const forRejected = await svc.getReviewerClipHistory("owner", campX, { status: "rejected" });
    expect(forRejected.rows.map((r) => r.clip.id)).toEqual([rejected.id]);
    expect(forRejected.summary).toMatchObject({ total: 3, pending: 1, approved: 1, rejected: 1, paid: 1 }); // unchanged by the tab

    const forPending = await svc.getReviewerClipHistory("owner", campX, { status: "pending" });
    expect(forPending.rows.map((r) => r.clip.id)).toEqual([pending.id]);

    const forPaid = await svc.getReviewerClipHistory("owner", campX, { status: "paid" });
    expect(forPaid.rows.map((r) => r.clip.id)).toEqual([paid.id]);
  });

  it("the date range narrows both the list and the summary counts", async () => {
    const campX = await freshCampaign("History date range");
    const old = await makeClip("c1", campX, 1000);
    await db.update(clips).set({ submittedAt: new Date("2020-01-01T00:00:00Z") }).where(eq(clips.id, old.id));
    const recent = await makeClip("c1", campX, 1000);

    const r = await svc.getReviewerClipHistory("owner", campX, { from: new Date("2020-06-01T00:00:00Z") });
    expect(r.rows.map((x) => x.clip.id)).toEqual([recent.id]);
    expect(r.summary.total).toBe(1);
  });

  it("the summary's Total Views/Approved Views sum effective views across every status/only approved+paid, and ignore the status tab like the other tiles", async () => {
    const campX = await freshCampaign("History views aggregate");
    const pending = await makeClip("c1", campX, 1000); // still awaiting_analytics -- counts toward Total Views regardless
    const rejected = await makeClip("c1", campX, 2000);
    await svc.reviewClip("owner", campX, rejected.id, { action: "reject", reason: "spam" });
    const approvedUnpaid = await approvedWithPayout(campX, "c1", 60, 4000);
    const paid = await approvedWithPayout(campX, "c1", 60, 3000);
    await svc.markPaid("owner", campX, paid.id);

    const all = await svc.getReviewerClipHistory("owner", campX);
    expect(all.summary.totalViews).toBe(1000 + 2000 + 4000 + 3000);
    expect(all.summary.approvedViews).toBe(4000 + 3000);

    // Narrowing the list to "rejected" doesn't change the aggregate -- same as the other summary tiles.
    const rejectedTab = await svc.getReviewerClipHistory("owner", campX, { status: "rejected" });
    expect(rejectedTab.summary.totalViews).toBe(1000 + 2000 + 4000 + 3000);
    expect(rejectedTab.summary.approvedViews).toBe(4000 + 3000);
    expect(rejectedTab.rows.map((r) => r.clip.id)).toEqual([rejected.id]);
    void pending;
    void approvedUnpaid;
  });

  it("Total Views/Approved Views respect the date range filter, same as the other summary tiles", async () => {
    const campX = await freshCampaign("History views date range");
    const old = await makeClip("c1", campX, 5000);
    await db.update(clips).set({ submittedAt: new Date("2020-01-01T00:00:00Z") }).where(eq(clips.id, old.id));
    await makeClip("c1", campX, 1000);

    const r = await svc.getReviewerClipHistory("owner", campX, { from: new Date("2020-06-01T00:00:00Z") });
    expect(r.summary.totalViews).toBe(1000); // the old, out-of-range clip's views are excluded
  });

  it("the views sum uses manual_views over the auto-fetched views, same as effectiveViews()", async () => {
    const campX = await freshCampaign("History views manual override");
    const clip = await makeClip("c1", campX, 5000);
    await db.update(clips).set({ manualViews: 42 }).where(eq(clips.id, clip.id));

    const r = await svc.getReviewerClipHistory("owner", campX);
    expect(r.summary.totalViews).toBe(42);
  });

  it("getMyClipHistory's views aggregates are scoped to the creator's own clips only", async () => {
    const campX = await freshCampaign("History views creator scope");
    await makeClip("c1", campX, 1000);
    await makeClip("c2", campX, 9000); // another creator's views must never leak into c1's aggregate

    const mine = await svc.getMyClipHistory("c1", campX);
    expect(mine.summary.totalViews).toBe(1000);
  });

  it("getReviewerClipHistory is Mod/Admin/Owner only — a creator and an outsider are denied", async () => {
    const campX = await freshCampaign("History access");
    await expect(svc.getReviewerClipHistory("c1", campX)).rejects.toThrow(/Access denied/);
    await expect(svc.getReviewerClipHistory("outsider", campX)).rejects.toThrow(/Access denied/);
  });

  it("getMyClipHistory scopes a creator to only their own clips on this campaign, never another creator's or another campaign's", async () => {
    const campX = await freshCampaign("History mine A");
    const campY = await freshCampaign("History mine B");
    const mine = await makeClip("c1", campX, 1000);
    await makeClip("c2", campX, 1000); // another creator, same campaign — must never appear
    await makeClip("c1", campY, 1000); // same creator, different campaign — must never appear

    const { summary, rows } = await svc.getMyClipHistory("c1", campX);
    expect(rows.map((r) => r.clip.id)).toEqual([mine.id]);
    expect(summary.total).toBe(1);
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
    // Task 5 Part 3: a freshly-submitted clip is "awaiting_analytics", which can never have proof by
    // construction — sendProofReminders now excludes that bucket entirely (see runAnalyticsGateSweep
    // for its own reminder). Force this one to "pending" to simulate the (now rare/legacy) case this
    // reminder still exists for: a pending clip that somehow still has no proof.
    await db.update(clips).set({ submittedAt: new Date(Date.now() - 8 * 86_400_000), status: "pending" }).where(eq(clips.id, old.id));

    await sendProofReminders();
    const notes = await db.select().from(notifications).where(eq(notifications.type, "proof_reminder"));
    const forOld = notes.filter((x) => x.clipId === old.id);
    expect(forOld.map((x) => x.userId).sort()).toEqual(["owner", "remMod"]);
    expect(notes.some((x) => x.clipId === fresh.id)).toBe(false);

    await sendProofReminders(); // idempotent
    expect((await db.select().from(notifications).where(eq(notifications.clipId, old.id))).length).toBe(2);
  });

  it("does not remind about an old clip that already has an existing screenshot on file (Task 5 Part 2: submission is removed, but an existing one still counts as proof)", async () => {
    const c = await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Reminders (screenshot)" });
    await db.insert(campaignCreators).values({ campaignId: c.id, userId: "c1" });
    const old = await makeClip("c1", c.id);
    await db
      .update(clips)
      .set({
        submittedAt: new Date(Date.now() - 8 * 86_400_000),
        analyticsScreenshotPathname: "analytics-proof/seed/existing.png", // seeded directly: submission is gone, but old data must still be honored
      })
      .where(eq(clips.id, old.id));

    await sendProofReminders();
    expect((await db.select().from(notifications).where(eq(notifications.clipId, old.id))).length).toBe(0);
  });
});

describe("an existing screenshot proof (seeded directly — Task 5 Part 2 removed new submission, but an already-accepted one keeps working end to end)", () => {
  it("still counts as proof, can be approved, and can be paid, even after its views grow well past 10,000", async () => {
    const clip = await makeClip("c1", camp, 9000);
    await db
      .update(clips)
      .set({
        // A pre-Part-3 legacy row: already "pending" with a screenshot on file, exactly the
        // retroactive scenario Task 5 Part 3 describes (proof already existed before the gate did).
        status: "pending",
        analyticsScreenshotPathname: "analytics-proof/seed/legacy.png",
        analyticsScreenshotSubmittedAt: new Date(),
        analyticsScreenshotViewsAtSubmit: 9000,
      })
      .where(eq(clips.id, clip.id));
    expect(await svc.getReviewQueue("owner", camp).then((q) => q.pending.some((r) => r.clip.id === clip.id))).toBe(true);

    await svc.setQualifyingAudiencePct("owner", camp, clip.id, 50); // proof already present -> allowed
    await svc.refreshViews("owner", camp, clip.id, opts(500_000)); // views explode well past 10,000
    await svc.reviewClip("owner", camp, clip.id, { action: "approve" });
    await svc.markPaid("owner", camp, clip.id);

    const [row] = await db.select().from(clips).where(eq(clips.id, clip.id));
    expect(row).toMatchObject({ paidStatus: "paid", analyticsScreenshotPathname: "analytics-proof/seed/legacy.png" });
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
