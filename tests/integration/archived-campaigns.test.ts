import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { campaignCreators, campaignMods, clips, inviteLinks, platformAdmins, users } from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as clipSvc from "@/lib/clips/service";
import { getCampaignForUser, getCampaignsForUser, getRoleForCampaign } from "@/lib/auth/roles";

/**
 * Archiving a campaign hides it from Creators (they lose ALL access: page, posts, joining, submitting) while the
 * Owner, Admins, Mods and Brand viewers keep seeing it. It is reversible, and it only ever touches the one campaign.
 */
let db: Awaited<ReturnType<typeof createTestDb>>;
let A: string; // the campaign we archive
let B: string; // a bystander campaign that must be completely unaffected
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin", username: "admin" },
    { id: "mod1", username: "mod1" },
    { id: "brandviewer", username: "brandviewer" },
    { id: "creator1", username: "creator1" },
    { id: "creatorB", username: "creatorB" },
    { id: "newcomer", username: "newcomer" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });
  A = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "A" })).id;
  B = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "B" })).id;
  await db.insert(campaignMods).values({ campaignId: A, userId: "mod1", addedBy: "owner" });
  await campaignSvc.addBrand("owner", A, "brandviewer");
  await db.insert(campaignCreators).values([
    { campaignId: A, userId: "creator1" },
    { campaignId: B, userId: "creator1" },
    { campaignId: B, userId: "creatorB" },
  ]);
});

const ids = async (user: string) => (await getCampaignsForUser(user)).map((c) => c.id);
const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/Access denied/);

describe("archiving a campaign", () => {
  it("only an Owner or Admin can archive or unarchive; Mod, Brand and Creator cannot", async () => {
    for (const who of ["mod1", "brandviewer", "creator1", "newcomer"]) {
      await denied(campaignSvc.archiveCampaign(who, A));
      await denied(campaignSvc.reopenCampaign(who, A));
    }
    expect((await getCampaignForUser("owner", A))?.status).toBe("active");
  });

  it("before archiving, every role sees the campaign", async () => {
    for (const who of ["owner", "admin", "mod1", "brandviewer", "creator1"]) {
      expect(await ids(who)).toContain(A);
      expect(await getCampaignForUser(who, A)).not.toBeNull();
    }
  });

  it("an Admin can archive it", async () => {
    const row = await campaignSvc.archiveCampaign("admin", A);
    expect(row.status).toBe("archived");
  });

  it("the Owner, Admin, Mod and Brand viewer can still see it, with their usual role", async () => {
    expect(await getRoleForCampaign("owner", A)).toBe("owner");
    expect(await getRoleForCampaign("admin", A)).toBe("admin");
    expect(await getRoleForCampaign("mod1", A)).toBe("mod");
    expect(await getRoleForCampaign("brandviewer", A)).toBe("brand");
    for (const who of ["owner", "admin", "mod1", "brandviewer"]) {
      expect(await ids(who)).toContain(A);
      expect((await getCampaignForUser(who, A))?.status).toBe("archived");
    }
  });

  it("a Creator can no longer see it: no role, no page, not in their list", async () => {
    expect(await getRoleForCampaign("creator1", A)).toBeNull();
    expect(await getCampaignForUser("creator1", A)).toBeNull();
    expect(await ids("creator1")).not.toContain(A);
    expect(await ids("creator1")).toContain(B); // their other campaign is untouched
  });

  it("a Creator can't submit a post to it or read their own posts in it", async () => {
    await expect(clipSvc.submitClip("creator1", A, "https://www.tiktok.com/@u/video/7100000000000000001")).rejects.toThrow();
    expect(await clipSvc.getCreatorClips("creator1", A)).toEqual([]);
  });

  it("it is not joinable: not listed on /explore, no one-click join, and its invite link is dead", async () => {
    const link = await campaignSvc.generateInviteLink("owner", A);
    expect((await campaignSvc.listActiveCampaigns("newcomer")).map((c) => c.id)).not.toContain(A);
    await expect(campaignSvc.joinActiveCampaign("newcomer", A)).rejects.toThrow(/isn't open/);
    expect(await campaignSvc.lookupInvite(link.code)).toEqual({ ok: false, reason: "not_found" });
    await expect(campaignSvc.redeemInvite("newcomer", link.code)).rejects.toThrow(/not found/i);
    expect(await db.select().from(campaignCreators).where(eq(campaignCreators.userId, "newcomer"))).toHaveLength(0);
  });

  it("another campaign is not affected at all", async () => {
    expect((await getCampaignForUser("creatorB", B))?.status).toBe("active");
    expect(await getRoleForCampaign("creatorB", B)).toBe("creator");
    expect((await campaignSvc.listActiveCampaigns("newcomer")).map((c) => c.id)).toContain(B);
  });

  it("the reviewers' view of the archived campaign still works", async () => {
    await db.insert(clips).values({
      campaignId: A,
      creatorUserId: "creator1",
      platform: "tiktok",
      url: `https://www.tiktok.com/@u/video/${7_200_000 + ++n}`,
      views: 100,
      status: "pending",
    });
    expect((await clipSvc.getBrandClipFeed("brandviewer", A)).rows.length).toBe(1);
    expect((await clipSvc.getReviewQueue("mod1", A)).pending.length).toBe(1);
  });

  it("unarchiving restores everything: the Creator sees it again, with their membership and posts intact", async () => {
    expect((await campaignSvc.reopenCampaign("owner", A)).status).toBe("active");
    expect(await getRoleForCampaign("creator1", A)).toBe("creator");
    expect(await ids("creator1")).toContain(A);
    expect((await clipSvc.getCreatorClips("creator1", A)).length).toBe(1);
    expect((await db.select().from(inviteLinks).where(eq(inviteLinks.campaignId, A))).length).toBe(1);
  });
});
