import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { users, platformAdmins, campaignMods, campaignCreators, campaigns, clips, notifications } from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as svc from "@/lib/clips/service";
import { sendProofReminders } from "@/lib/notifications";
import type { ProofImageStore } from "@/lib/clips/proof-store";

process.env.SCRAPECREATORS_API_KEY = "test-key";

/** In-memory stand-in for Vercel Blob (the real one needs a token and network). */
function memStore() {
  const blobs = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const deleted: string[] = [];
  const store: ProofImageStore = {
    async put(p, bytes, contentType) {
      blobs.set(p, { bytes, contentType });
    },
    async del(p) {
      deleted.push(p);
      blobs.delete(p);
    },
    async get(p) {
      const b = blobs.get(p);
      if (!b) return null;
      return {
        stream: new Response(b.bytes as BodyInit).body as ReadableStream<Uint8Array>,
        contentType: b.contentType,
        size: b.bytes.length,
      };
    },
  };
  return Object.assign(store, { blobs, deleted });
}

const pad = (head: number[], total = 64) => Uint8Array.from([...head, ...new Array(total - head.length).fill(0)]);
const PNG = () => pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const GIF = () => pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

const tiktokBody = (views: number) => ({
  aweme_detail: { statistics: { play_count: views, digg_count: 1 }, desc: "c", video: { cover: { url_list: ["https://img.example/c.jpg"] } } },
});
const okFetch = (views: number) =>
  (async () => ({ ok: true, status: 200, json: async () => tiktokBody(views) })) as unknown as typeof fetch;
const sleep = async () => {};

let db: Awaited<ReturnType<typeof createTestDb>>;
let camp: string;
let campB: string;
let n = 0;

async function mkClip(creator: string, views: number, campaignId = camp) {
  const [row] = await db
    .insert(clips)
    .values({ campaignId, creatorUserId: creator, platform: "tiktok", url: `https://www.tiktok.com/@u/video/${700000 + ++n}`, views })
    .returning();
  return row.id;
}
const readClip = async (id: string) => (await db.select().from(clips).where(eq(clips.id, id)))[0];
const bytesOf = async (s: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(s).arrayBuffer());

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
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });
  camp = (await campaignSvc.createCampaign("owner", validCampaign)).id;
  campB = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "B" })).id;
  await db.insert(campaignMods).values([
    { campaignId: camp, userId: "modA", addedBy: "owner" },
    { campaignId: campB, userId: "modB", addedBy: "owner" },
  ]);
  for (const c of [camp, campB]) {
    await db.insert(campaignCreators).values([
      { campaignId: c, userId: "c1" },
      { campaignId: c, userId: "c2" },
    ]);
  }
});

describe("the 10,000-view rule on submission", () => {
  it("accepts a screenshot at 9,999 views and records the evidence", async () => {
    const store = memStore();
    const id = await mkClip("c1", 9_999);
    const row = await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);
    expect(row.analyticsScreenshotPathname).toMatch(new RegExp(`^analytics-proof/${camp}/${id}/[0-9a-f-]{36}\\.png$`));
    expect(row.analyticsScreenshotViewsAtSubmit).toBe(9_999);
    expect(row.analyticsScreenshotSubmittedAt).not.toBeNull();
    expect(row.videoProofUrl).toBeNull();
    expect(store.blobs.get(row.analyticsScreenshotPathname!)?.contentType).toBe("image/png");
  });

  it("REJECTS a screenshot at exactly 10,000 views and above — nothing is stored or changed", async () => {
    const store = memStore();
    for (const views of [10_000, 10_001, 5_000_000]) {
      const id = await mkClip("c1", views);
      await expect(svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store)).rejects.toThrow(/fewer than 10,000 views.*video link/i);
      const c = await readClip(id);
      expect(c.analyticsScreenshotPathname).toBeNull();
      expect(c.analyticsScreenshotViewsAtSubmit).toBeNull();
    }
    expect(store.blobs.size).toBe(0);
  });

  it("accepts a video link at ANY view count", async () => {
    const store = memStore();
    for (const views of [0, 9_999, 10_000, 50_000_000]) {
      const id = await mkClip("c1", views);
      const row = await svc.attachVideoProof("c1", camp, id, "https://youtu.be/abcdefghijk", store);
      expect(row.videoProofUrl).toBe("https://youtu.be/abcdefghijk");
    }
  });
});

describe("accepted proof stays valid when views grow past 10,000 (not retroactive)", () => {
  it("screenshot accepted at 9,999 views -> views explode -> still counts, gets reviewed, and is paid", async () => {
    const store = memStore();
    const id = await mkClip("c1", 9_999);
    await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);

    // views grow far past the limit via the real refresh path
    await svc.refreshViews("c1", camp, id, { fetchImpl: okFetch(3_000_000), sleep });
    const grown = await readClip(id);
    expect(grown.views).toBe(3_000_000);
    expect(grown.analyticsScreenshotPathname).not.toBeNull(); // proof untouched
    expect(grown.analyticsScreenshotViewsAtSubmit).toBe(9_999); // evidence of when it was valid

    // the reviewer can still enter the %, the payout calculates, and it can be approved and marked paid
    const withPct = await svc.setQualifyingAudiencePct("admin", camp, id, 25);
    expect([withPct.cpm, withPct.earnings, withPct.payout]).toEqual(["0.5000", "1500.00", "500.00"]);
    await svc.reviewClip("admin", camp, id, { action: "approve" });
    await svc.markPaid("admin", camp, id);
    const paid = await readClip(id);
    expect(paid).toMatchObject({ status: "approved", paidStatus: "paid", analyticsScreenshotPathname: expect.any(String) });
  });

  it("but the limit still governs NEW submissions: no new screenshot once views are 10,000+", async () => {
    const store = memStore();
    const id = await mkClip("c1", 9_000);
    const first = await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);
    await db.update(clips).set({ views: 25_000 }).where(eq(clips.id, id));

    await expect(svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store)).rejects.toThrow(/fewer than 10,000/);
    expect((await readClip(id)).analyticsScreenshotPathname).toBe(first.analyticsScreenshotPathname); // old one intact
    expect(store.deleted).toEqual([]);
  });
});

describe("one proof at a time", () => {
  it("a video link replaces a screenshot (and deletes the image), at any view count", async () => {
    const store = memStore();
    const id = await mkClip("c1", 9_000);
    const shot = await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);
    await db.update(clips).set({ views: 40_000 }).where(eq(clips.id, id));

    const row = await svc.attachVideoProof("c1", camp, id, "https://youtu.be/abcdefghijk", store);
    expect(row).toMatchObject({
      videoProofUrl: "https://youtu.be/abcdefghijk",
      analyticsScreenshotPathname: null,
      analyticsScreenshotSubmittedAt: null,
      analyticsScreenshotViewsAtSubmit: null,
    });
    expect(store.deleted).toEqual([shot.analyticsScreenshotPathname]);
    expect(store.blobs.size).toBe(0);
  });

  it("a screenshot replaces a video link (under 10,000 views)", async () => {
    const store = memStore();
    const id = await mkClip("c1", 500);
    await svc.attachVideoProof("c1", camp, id, "https://youtu.be/abcdefghijk", store);
    const row = await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);
    expect(row.videoProofUrl).toBeNull();
    expect(row.analyticsScreenshotPathname).not.toBeNull();
  });

  it("a second screenshot replaces the first and deletes the old image", async () => {
    const store = memStore();
    const id = await mkClip("c1", 500);
    const a = await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);
    const b = await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);
    expect(b.analyticsScreenshotPathname).not.toBe(a.analyticsScreenshotPathname);
    expect(store.deleted).toEqual([a.analyticsScreenshotPathname]);
    expect([...store.blobs.keys()]).toEqual([b.analyticsScreenshotPathname]);
  });
});

describe("file and ownership checks", () => {
  it("rejects non-image files (nothing stored, DB unchanged)", async () => {
    const store = memStore();
    const id = await mkClip("c1", 100);
    await expect(svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: GIF() }, store)).rejects.toThrow(/PNG, JPEG or WebP/);
    await expect(svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: new Uint8Array(0) }, store)).rejects.toThrow(/empty/i);
    expect(store.blobs.size).toBe(0);
    expect((await readClip(id)).analyticsScreenshotPathname).toBeNull();
  });

  it("only the clip's own creator can attach one; a paid clip is locked", async () => {
    const store = memStore();
    const id = await mkClip("c1", 100);
    for (const who of ["c2", "modA", "admin", "owner", "outsider"]) {
      await expect(svc.attachAnalyticsScreenshot(who, camp, id, { bytes: PNG() }, store)).rejects.toThrow(/not found/i);
    }
    await expect(svc.attachAnalyticsScreenshot("c1", campB, id, { bytes: PNG() }, store)).rejects.toThrow(/not found/i); // wrong campaign
    expect(store.blobs.size).toBe(0);

    await db.update(clips).set({ paidStatus: "paid" }).where(eq(clips.id, id));
    await expect(svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store)).rejects.toThrow(/already been paid/);
  });

  it("reviewers can't enter a % until SOME proof exists; a screenshot satisfies that", async () => {
    const store = memStore();
    const id = await mkClip("c1", 500);
    await expect(svc.setQualifyingAudiencePct("modA", camp, id, 30)).rejects.toThrow(/proof is missing/i);
    await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);
    expect((await svc.setQualifyingAudiencePct("modA", camp, id, 30)).qualifyingAudiencePct).toBe("30.00");
  });
});

describe("proof reminders treat a screenshot as proof", () => {
  it("only reminds about clips with neither a video link nor a screenshot", async () => {
    const store = memStore();
    const c = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Reminders" })).id;
    await db.insert(campaignCreators).values({ campaignId: c, userId: "c1" });
    const missing = await mkClip("c1", 100, c);
    const withShot = await mkClip("c1", 100, c);
    await svc.attachAnalyticsScreenshot("c1", c, withShot, { bytes: PNG() }, store);
    const old = new Date(Date.now() - 9 * 86_400_000);
    await db.update(clips).set({ submittedAt: old }).where(eq(clips.campaignId, c));

    await sendProofReminders();
    const reminded = (await db.select().from(notifications).where(eq(notifications.type, "proof_reminder"))).map((x) => x.clipId);
    expect(reminded).toContain(missing);
    expect(reminded).not.toContain(withShot);
  });
});

describe("who can view a screenshot (getProofImage)", () => {
  it("the owning creator and this campaign's reviewers can; nobody else can", async () => {
    const store = memStore();
    const id = await mkClip("c1", 500);
    const row = await svc.attachAnalyticsScreenshot("c1", camp, id, { bytes: PNG() }, store);

    for (const who of ["c1", "modA", "admin", "owner"]) {
      const img = await svc.getProofImage(who, camp, id, store);
      expect(img.contentType).toBe("image/png");
      expect(await bytesOf(img.stream)).toEqual(store.blobs.get(row.analyticsScreenshotPathname!)!.bytes);
    }
    // another creator in the SAME campaign, a mod of a DIFFERENT campaign, and a stranger: all "not found"
    for (const who of ["c2", "modB", "outsider"]) {
      await expect(svc.getProofImage(who, camp, id, store)).rejects.toThrow(/not found/i);
    }
  });

  it("is scoped to the campaign in the URL, and a clip without a screenshot is 'not found'", async () => {
    const store = memStore();
    const withShot = await mkClip("c1", 500);
    await svc.attachAnalyticsScreenshot("c1", camp, withShot, { bytes: PNG() }, store);
    const noShot = await mkClip("c1", 500);

    await expect(svc.getProofImage("modB", campB, withShot, store)).rejects.toThrow(/not found/i); // right role, wrong campaign
    await expect(svc.getProofImage("owner", campB, withShot, store)).rejects.toThrow(/not found/i);
    await expect(svc.getProofImage("c1", camp, noShot, store)).rejects.toThrow(/not found/i);
    store.blobs.clear(); // blob vanished from storage
    await expect(svc.getProofImage("c1", camp, withShot, store)).rejects.toThrow(/not found/i);
  });
});
