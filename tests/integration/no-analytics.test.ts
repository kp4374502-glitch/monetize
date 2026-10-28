import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { campaignCreators, campaignMods, campaigns, clips, notifications, platformAdmins, users } from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as svc from "@/lib/clips/service";
import { sendProofReminders } from "@/lib/notifications";

process.env.SCRAPECREATORS_API_KEY = "test-key";

let db: Awaited<ReturnType<typeof createTestDb>>;
let noProof: string; // Efootball-like: analytics not required
let withProof: string; // an ordinary campaign, to prove nothing changed for it
let n = 0;
const tiktok = () => `https://www.tiktok.com/@u/video/${700000 + ++n}`;

// Posted 30 days ago, so the 7-day gate is never the thing under test.
const body = (views: number) => ({
  aweme_detail: {
    statistics: { play_count: views, digg_count: 5 },
    desc: "caption",
    video: { cover: { url_list: ["https://img.example/c.jpg"] } },
    create_time: Math.floor(Date.now() / 1000) - 30 * 86_400,
  },
});
const okFetch = (views: number) => (async () => ({ ok: true, status: 200, json: async () => body(views) })) as unknown as typeof fetch;
const sleep = async () => {};
const opts = (views = 100_000) => ({ fetchImpl: okFetch(views), sleep });

async function submit(creator: string, campaignId: string, views = 100_000) {
  return (await svc.submitClip(creator, campaignId, tiktok(), opts(views))).clip;
}
const row = async (id: string) => (await db.select().from(clips).where(eq(clips.id, id)))[0];
const notesFor = (clipId: string) => db.select().from(notifications).where(eq(notifications.clipId, clipId));

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin", username: "admin" },
    { id: "modA", username: "modA" },
    { id: "c1", username: "c1" },
    { id: "c2", username: "c2" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });

  // Efootball Diwali's real numbers: base rate $0.10, divisor 50, max $1,000/post, budget $1,000.
  const efootball = { ...validCampaign, name: "NoProof", baseRate: 0.1, divisor: 50, maxPayPerPost: 1000, viewMinimum: 1, totalBudget: 1000 };
  noProof = (await campaignSvc.createCampaign("owner", efootball)).id;
  withProof = (await campaignSvc.createCampaign("owner", { ...efootball, name: "WithProof" })).id;
  await db.update(campaigns).set({ requireAnalyticsProof: false }).where(eq(campaigns.id, noProof));

  for (const c of [noProof, withProof]) {
    await db.insert(campaignCreators).values([
      { campaignId: c, userId: "c1" },
      { campaignId: c, userId: "c2" },
    ]);
  }
  await db.insert(campaignMods).values({ campaignId: noProof, userId: "modA", addedBy: "owner" });
});

describe("new campaigns default to requiring analytics proof", () => {
  it("createCampaign leaves require_analytics_proof on", async () => {
    const fresh = await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Fresh" });
    expect(fresh.requireAnalyticsProof).toBe(true);
  });
});

describe("submitClip on a no-analytics campaign", () => {
  it("goes straight to the review queue (pending) and is priced from views alone, immediately", async () => {
    const clip = await submit("c1", noProof, 100_000);
    expect(clip.status).toBe("pending");
    // min(100 / 50, 1) x $0.10 = $0.10 CPM (Base Rate is the ceiling); 100,000 views = $10.00
    expect([clip.cpm, clip.earnings, clip.payout]).toEqual(["0.1000", "10.00", "10.00"]);
    expect(clip.qualifyingAudiencePct).toBeNull();
  });

  it("an ordinary campaign is unchanged: awaiting_analytics, nothing priced", async () => {
    const clip = await submit("c1", withProof);
    expect(clip.status).toBe("awaiting_analytics");
    expect([clip.cpm, clip.earnings, clip.payout]).toEqual([null, null, null]);
  });
});

describe("proof and audience % are refused where the campaign doesn't use them", () => {
  it("attachVideoProof and setQualifyingAudiencePct both explain why", async () => {
    const clip = await submit("c1", noProof);
    await expect(svc.attachVideoProof("c1", noProof, clip.id, "https://youtu.be/abcdefghijk")).rejects.toThrow(/doesn't use analytics proof/);
    await expect(svc.setQualifyingAudiencePct("owner", noProof, clip.id, 50)).rejects.toThrow(/doesn't use analytics proof/);
    const after = await row(clip.id);
    expect(after.videoProofUrl).toBeNull();
    expect(after.qualifyingAudiencePct).toBeNull();
  });

  it("an ordinary campaign still accepts proof, and still refuses approval without it", async () => {
    const clip = await submit("c1", withProof);
    await expect(svc.reviewClip("owner", withProof, clip.id, { action: "approve" })).rejects.toThrow(/proof is missing/);
    await svc.attachVideoProof("c1", withProof, clip.id, "https://youtu.be/abcdefghijk");
    expect((await row(clip.id)).status).toBe("pending");
  });
});

describe("approve and pay without any analytics", () => {
  it("a reviewer approves in one step, the creator hears plainly, and the Owner marks it paid", async () => {
    const clip = await submit("c1", noProof, 100_000);
    await svc.reviewClip("modA", noProof, clip.id, { action: "approve" });
    expect((await row(clip.id)).status).toBe("approved");
    const approved = (await notesFor(clip.id)).find((x) => x.type === "clip_approved");
    expect(approved?.message).toBe("Your post was approved.");

    const before = Number((await db.select().from(campaigns).where(eq(campaigns.id, noProof)))[0].budgetSpent);
    await svc.markPaid("owner", noProof, clip.id);
    const after = Number((await db.select().from(campaigns).where(eq(campaigns.id, noProof)))[0].budgetSpent);
    expect(after - before).toBe(10);
    expect(await row(clip.id)).toMatchObject({ paidStatus: "paid", payout: "10.00" });
  });

  it("the budget cap still applies: a payout over the remaining budget is refused", async () => {
    // Two $600 posts against a $1,000 budget (6,000,000 views x $0.10/1000 = $600). The second can't be paid.
    const a = await submit("c1", noProof, 6_000_000);
    const b = await submit("c2", noProof, 6_000_000);
    await svc.reviewClip("owner", noProof, a.id, { action: "approve" });
    await svc.markPaid("owner", noProof, a.id);
    await expect(svc.reviewClip("owner", noProof, b.id, { action: "approve" })).rejects.toThrow(/exceed/);
  });
});

describe("refreshing views reprices a no-analytics post", () => {
  it("payout follows the new view count", async () => {
    const clip = await submit("c1", noProof, 100_000); // $10.00
    await svc.refreshViews("c1", noProof, clip.id, opts(200_000));
    expect(await row(clip.id)).toMatchObject({ views: 200_000, payout: "20.00" });
  });
});

describe("reminders and unlock notices skip no-analytics campaigns", () => {
  it("no 'no analytics proof' reminder for an old post on a no-analytics campaign, but one for an ordinary campaign", async () => {
    const plain = await submit("c1", noProof);
    const gated = await submit("c1", withProof);
    const old = new Date(Date.now() - 8 * 86_400_000);
    await db.update(clips).set({ submittedAt: old }).where(eq(clips.id, plain.id));
    // Put the ordinary one at "pending" without proof, the only state the reminder job looks at.
    await db.update(clips).set({ submittedAt: old, status: "pending" }).where(eq(clips.id, gated.id));

    await sendProofReminders();
    expect((await notesFor(plain.id)).filter((x) => x.type === "proof_reminder")).toHaveLength(0);
    expect((await notesFor(gated.id)).filter((x) => x.type === "proof_reminder").length).toBeGreaterThan(0);
  });

  it("the daily analytics sweep never tells a creator to submit proof on a no-analytics campaign", async () => {
    const plain = await submit("c1", noProof);
    const gated = await submit("c2", withProof);
    // Force the old state on the no-analytics one: awaiting_analytics, posted 30 days ago, no proof.
    await db.update(clips).set({ status: "awaiting_analytics" }).where(eq(clips.id, plain.id));

    await svc.runAnalyticsGateSweep();
    expect((await notesFor(plain.id)).filter((x) => x.type === "analytics_unlocked")).toHaveLength(0);
    expect((await notesFor(gated.id)).filter((x) => x.type === "analytics_unlocked")).toHaveLength(1);
  });
});

describe("history filters on a no-analytics campaign", () => {
  it("waiting_payment needs no %, waiting_audience_pct is always empty, waiting_analytics_approved means 'not yet approved'", async () => {
    const camp = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Filters", baseRate: 0.1, viewMinimum: 1, totalBudget: 100_000 })).id;
    await db.update(campaigns).set({ requireAnalyticsProof: false }).where(eq(campaigns.id, camp));
    await db.insert(campaignCreators).values({ campaignId: camp, userId: "c1" });

    const waiting = await submit("c1", camp);
    const approved = await submit("c1", camp);
    await svc.reviewClip("owner", camp, approved.id, { action: "approve" });

    const ids = async (status: "waiting_payment" | "waiting_audience_pct" | "waiting_analytics_approved") =>
      (await svc.getReviewerClipHistory("owner", camp, { status })).rows.map((r) => r.clip.id);
    expect(await ids("waiting_payment")).toEqual([approved.id]);
    expect(await ids("waiting_audience_pct")).toEqual([]);
    expect(await ids("waiting_analytics_approved")).toEqual([waiting.id]);
  });
});

describe("disableAnalyticsProof (switching a campaign over)", () => {
  let camp: string;
  let other: string; // a second, untouched campaign
  let a: string;
  let b: string;
  let rejected: string;
  let paid: string;
  let otherClip: string;

  beforeAll(async () => {
    const base = { ...validCampaign, baseRate: 1, divisor: 50, maxPayPerPost: 500, viewMinimum: 1000, totalBudget: 10_000 };
    camp = (await campaignSvc.createCampaign("owner", { ...base, name: "ToSwitch" })).id;
    other = (await campaignSvc.createCampaign("owner", { ...base, name: "Untouched" })).id;
    for (const c of [camp, other]) await db.insert(campaignCreators).values({ campaignId: c, userId: "c1" });

    a = (await submit("c1", camp, 100_000)).id; // will price at min(100/50, 1) x $1 x 100 = $100.00
    b = (await submit("c1", camp, 2_000)).id; // $2.00
    rejected = (await submit("c1", camp, 50_000)).id;
    await svc.reviewClip("owner", camp, rejected, { action: "reject", reason: "no" });

    // A paid post under the OLD rules (50% audience from real proof): frozen, must never be repriced.
    paid = (await submit("c1", camp, 100_000)).id;
    await svc.attachVideoProof("c1", camp, paid, "https://youtu.be/abcdefghijk");
    await svc.setQualifyingAudiencePct("owner", camp, paid, 50); // (50/50) x $1 x 100 = $100.00
    await svc.reviewClip("owner", camp, paid, { action: "approve" });
    await svc.markPaid("owner", camp, paid);

    otherClip = (await submit("c1", other, 100_000)).id;
  });

  it("only the Owner can do it — not an Admin, a Mod, or a creator", async () => {
    await expect(svc.disableAnalyticsProof("admin", camp)).rejects.toThrow(/only an Owner/);
    await expect(svc.disableAnalyticsProof("modA", camp)).rejects.toThrow(/Access denied/);
    await expect(svc.disableAnalyticsProof("c1", camp)).rejects.toThrow(/Access denied/);
    expect((await db.select().from(campaigns).where(eq(campaigns.id, camp)))[0].requireAnalyticsProof).toBe(true);
  });

  it("moves stuck posts to pending and reprices open ones; rejected, paid and other campaigns are untouched", async () => {
    expect((await row(a)).status).toBe("awaiting_analytics");

    const r = await svc.disableAnalyticsProof("owner", camp);
    expect(r).toEqual({ alreadyOff: false, movedToPending: 2, repriced: 2 });

    expect(await row(a)).toMatchObject({ status: "pending", cpm: "1.0000", earnings: "100.00", payout: "100.00" });
    expect(await row(b)).toMatchObject({ status: "pending", payout: "2.00" });
    expect(await row(rejected)).toMatchObject({ status: "rejected", payout: null });
    expect(await row(paid)).toMatchObject({ status: "approved", paidStatus: "paid", payout: "100.00" });
    expect(await row(otherClip)).toMatchObject({ status: "awaiting_analytics", payout: null });
    expect((await db.select().from(campaigns).where(eq(campaigns.id, camp)))[0].requireAnalyticsProof).toBe(false);
    expect((await db.select().from(campaigns).where(eq(campaigns.id, other)))[0].requireAnalyticsProof).toBe(true);
  });

  it("is idempotent: a second call changes nothing", async () => {
    expect(await svc.disableAnalyticsProof("owner", camp)).toEqual({ alreadyOff: true, movedToPending: 0, repriced: 0 });
    expect(await row(a)).toMatchObject({ status: "pending", payout: "100.00" });
  });

  it("also works for the campaign's own owner (not only the platform Owner)", async () => {
    await db.insert(users).values({ id: "brandowner", username: "brandowner" });
    const mine = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "BrandOwned" })).id;
    await db.update(campaigns).set({ ownerUserId: "brandowner" }).where(eq(campaigns.id, mine));
    expect((await svc.disableAnalyticsProof("brandowner", mine)).alreadyOff).toBe(false);
  });
});
