import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { users, campaignMods, campaignCreators, clips } from "../../drizzle/schema";

type Blob = { bytes: Uint8Array; contentType: string };
const holder = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: null as string | null,
  blobs: new Map<string, { bytes: Uint8Array; contentType: string }>(),
}));

vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: holder.userId }) }));
// The route calls the service with its default store, so swap the real Blob store for an in-memory one.
vi.mock("@/lib/clips/proof-store", () => ({
  vercelBlobStore: {
    async put(p: string, bytes: Uint8Array, contentType: string) {
      holder.blobs.set(p, { bytes, contentType });
    },
    async del(p: string) {
      holder.blobs.delete(p);
    },
    async get(p: string) {
      const b = holder.blobs.get(p);
      return b ? { stream: new Response(b.bytes as BodyInit).body, contentType: b.contentType, size: b.bytes.length } : null;
    },
  },
}));

import * as campaignSvc from "@/lib/campaigns/service";
import { GET } from "@/app/api/proof/[campaignId]/[clipId]/route";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6, 5, 4, 3, 2]);
let camp: string;
let campB: string;
let clipId: string;

const call = async (userId: string | null, c = camp, k = clipId) => {
  holder.userId = userId;
  return GET(new Request("http://localhost/api/proof"), { params: Promise.resolve({ campaignId: c, clipId: k }) });
};

beforeAll(async () => {
  const db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "modA", username: "modA" },
    { id: "modB", username: "modB" },
    { id: "c1", username: "c1" },
    { id: "c2", username: "c2" },
    { id: "stranger", username: "stranger" },
  ]);
  camp = (await campaignSvc.createCampaign("owner", validCampaign)).id;
  campB = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "B" })).id;
  await db.insert(campaignMods).values([
    { campaignId: camp, userId: "modA", addedBy: "owner" },
    { campaignId: campB, userId: "modB", addedBy: "owner" },
  ]);
  await db.insert(campaignCreators).values([
    { campaignId: camp, userId: "c1" },
    { campaignId: camp, userId: "c2" },
  ]);
  [{ id: clipId }] = await db
    .insert(clips)
    .values({ campaignId: camp, creatorUserId: "c1", platform: "tiktok", url: "https://www.tiktok.com/@u/video/1", views: 500 })
    .returning({ id: clips.id });
  // Task 5 Part 2 removed screenshot submission, but existing screenshots must keep serving — seed
  // one directly (as if it had been accepted before the removal) instead of through the removed
  // svc.attachAnalyticsScreenshot.
  const pathname = `analytics-proof/${camp}/${clipId}/seed.png`;
  holder.blobs.set(pathname, { bytes: PNG, contentType: "image/png" });
  await db.update(clips).set({ analyticsScreenshotPathname: pathname }).where(eq(clips.id, clipId));
});

describe("GET /api/proof/[campaignId]/[clipId]", () => {
  it("serves the image with safe, non-cacheable headers to the owning creator and to reviewers", async () => {
    for (const who of ["c1", "modA", "owner"]) {
      const res = await call(who);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    }
  });

  it("is a uniform 404 for everyone else: signed out, other creators, other campaigns' mods, strangers", async () => {
    for (const who of [null, "c2", "modB", "stranger"]) {
      const res = await call(who);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).not.toMatch(/image/);
      expect(await res.text()).toBe("Not found");
    }
  });

  it("is a 404 for a mismatched campaign, malformed ids and unknown clips", async () => {
    expect((await call("modB", campB, clipId)).status).toBe(404); // right role, but the clip isn't in that campaign
    expect((await call("owner", camp, "not-a-uuid")).status).toBe(404);
    expect((await call("owner", "nope", clipId)).status).toBe(404);
    expect((await call("owner", camp, "00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});
