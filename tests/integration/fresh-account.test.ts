import { beforeAll, describe, expect, it, vi } from "vitest";
import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { createTestDb, validCampaign } from "./helpers";
import {
  brandRequests,
  campaignCreators,
  campaignMods,
  campaigns,
  clips,
  inviteLinks,
  platformAdmins,
  users,
} from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as clipSvc from "@/lib/clips/service";
import * as brand from "@/lib/brand/service";
import { getCampaignForUser, getCampaignsForUser, getRoleForCampaign, isPlatformAdmin, isPlatformOwner, requireRole } from "@/lib/auth/roles";

/**
 * "A brand-new stranger who signs in gets no Owner/Admin/Mod power." A first login inserts exactly
 * { id, username } into `users` (lib/auth/ensure-user.ts) — isPlatformOwner defaults to false and no
 * other role row exists. Here that account (and one that has never even logged in) attacks every
 * privileged function, and we assert that all of them refuse AND that nothing in the DB changed.
 */

let db: Awaited<ReturnType<typeof createTestDb>>;
let camp: string;
let clipId: string;
let linkId: string;
const FRESH = "user_fresh_stranger";
const GHOST = "user_never_logged_in";
const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/Access denied|not found|not joined|only the platform Owner|hasn't been approved/i);

async function snapshot() {
  const n = async (t: PgTable) => (await db.select({ c: count() }).from(t))[0].c;
  return {
    campaigns: await n(campaigns),
    clips: await n(clips),
    mods: await n(campaignMods),
    admins: await n(platformAdmins),
    creators: await n(campaignCreators),
    links: await n(inviteLinks),
    requests: await n(brandRequests),
    owners: (await db.select().from(users).where(eq(users.isPlatformOwner, true))).map((u) => u.id),
    campaignRows: (await db.select().from(campaigns)).map((c) => `${c.id}:${c.status}:${c.ownerUserId}:${c.budgetSpent}`),
    clipRows: (await db.select().from(clips)).map((c) => `${c.id}:${c.status}:${c.paidStatus}:${c.qualifyingAudiencePct}:${c.deletedAt}`),
  };
}

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin", username: "admin" },
    { id: "mod", username: "mod" },
    { id: "creator", username: "creator" },
    // exactly what ensureUser inserts on a first login: id + username, nothing else
    { id: FRESH, username: FRESH },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });
  camp = (await campaignSvc.createCampaign("owner", validCampaign)).id;
  await db.insert(campaignMods).values({ campaignId: camp, userId: "mod", addedBy: "owner" });
  await db.insert(campaignCreators).values({ campaignId: camp, userId: "creator" });
  [{ id: clipId }] = await db
    .insert(clips)
    .values({ campaignId: camp, creatorUserId: "creator", platform: "tiktok", url: "https://www.tiktok.com/@u/video/111" })
    .returning({ id: clips.id });
  linkId = (await campaignSvc.generateInviteLink("owner", camp)).id;
});

describe("a brand-new account (users row with no roles) and one that never logged in", () => {
  it("starts with the Owner flag off and no role row of any kind", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, FRESH));
    expect(u.isPlatformOwner).toBe(false);
    for (const id of [FRESH, GHOST]) {
      expect(await isPlatformOwner(id)).toBe(false);
      expect(await isPlatformAdmin(id)).toBe(false);
      expect(await getRoleForCampaign(id, camp)).toBeNull();
      expect(await getCampaignForUser(id, camp)).toBeNull();
      expect(await getCampaignsForUser(id)).toEqual([]);
      for (const min of ["creator", "mod", "admin", "owner"] as const) await denied(requireRole(id, camp, min));
    }
  });

  it("is refused by EVERY privileged action, and the database is unchanged afterwards", async () => {
    const before = await snapshot();
    for (const who of [FRESH, GHOST]) {
      // campaign administration
      await denied(campaignSvc.createCampaign(who, validCampaign));
      await denied(campaignSvc.updateCampaignSettings(who, camp, { ...validCampaign, baseRate: 999 }));
      await denied(campaignSvc.pauseCampaign(who, camp));
      await denied(campaignSvc.closeCampaign(who, camp));
      await denied(campaignSvc.archiveCampaign(who, camp));
      await denied(campaignSvc.reopenCampaign(who, camp));
      await denied(campaignSvc.deleteCampaign(who, camp));
      // people / invites
      await denied(campaignSvc.generateInviteLink(who, camp));
      await denied(campaignSvc.revokeInviteLink(who, camp, linkId));
      await denied(campaignSvc.listInviteLinks(who, camp));
      // review, money and every campaign read the review team has
      await denied(clipSvc.reviewClip(who, camp, clipId, { action: "approve" }));
      await denied(clipSvc.setQualifyingAudiencePct(who, camp, clipId, 50));
      await denied(clipSvc.markPaid(who, camp, clipId));
      await denied(clipSvc.getReviewQueue(who, camp));
      await denied(clipSvc.getReviewerClipHistory(who, camp));
      await denied(clipSvc.getClipHistory(who, camp));
      await denied(clipSvc.getCreatorRoster(who, camp));
      await denied(clipSvc.refreshViews(who, camp, clipId));
      await denied(clipSvc.deleteClip(who, camp, clipId)); // Owner/Admin only, per Task 5
      await denied(clipSvc.setPostedAt(who, camp, clipId, "2020-01-01")); // Mod/Admin/Owner only, per Task 5 Part 3
      // creator-only actions need a campaign_creators row they don't have
      await denied(clipSvc.submitClip(who, camp, "https://www.tiktok.com/@u/video/222"));
      await denied(clipSvc.attachVideoProof(who, camp, clipId, "https://youtu.be/aaaaaaaaaaa"));
      await denied(clipSvc.getProofImage(who, camp, clipId));
      // platform-Owner-only brand queue
      await denied(brand.listBrandRequests(who));
      await denied(brand.listApprovedBrands(who));
      await denied(brand.reviewBrandRequest(who, "00000000-0000-0000-0000-000000000000", "approved"));
    }
    // their own clip list is scoped to themselves, so it's simply empty
    expect(await clipSvc.getCreatorClips(FRESH, camp)).toEqual([]);
    expect(await snapshot()).toEqual(before); // nothing was created, changed, approved, paid or deleted
  });

  it("filing a brand request creates ONE pending row and still grants nothing", async () => {
    const before = await snapshot();
    const r = await brand.submitBrandRequest(FRESH, { brandName: "Sneaky Co", discord: "sneaky#1" });
    expect(r.request.status).toBe("pending");
    expect(await isPlatformOwner(FRESH)).toBe(false);
    expect(await getCampaignsForUser(FRESH)).toEqual([]);
    await denied(campaignSvc.createCampaign(FRESH, validCampaign));
    await denied(brand.reviewBrandRequest(FRESH, r.request.id, "approved")); // can't approve themselves
    await denied(campaignSvc.createCampaign("owner", validCampaign, FRESH)); // pending brand can't be assigned
    const after = await snapshot();
    expect(after.requests).toBe(before.requests + 1);
    expect({ ...after, requests: 0 }).toEqual({ ...before, requests: 0 });
  });

  it("even once the Owner APPROVES the brand, it has no platform power and no role on other campaigns", async () => {
    const [r] = await db.select().from(brandRequests).where(eq(brandRequests.userId, FRESH));
    await brand.reviewBrandRequest("owner", r.id, "approved");
    expect(await isPlatformOwner(FRESH)).toBe(false);
    expect(await isPlatformAdmin(FRESH)).toBe(false);
    expect(await getRoleForCampaign(FRESH, camp)).toBeNull();
    await denied(campaignSvc.createCampaign(FRESH, validCampaign));
    await denied(brand.listBrandRequests(FRESH));
    // only an explicit assignment by the Owner gives authority — and only inside that one campaign
    const theirs = await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Theirs" }, FRESH);
    expect(await getRoleForCampaign(FRESH, theirs.id)).toBe("owner");
    expect(await getRoleForCampaign(FRESH, camp)).toBeNull();
    await denied(campaignSvc.pauseCampaign(FRESH, camp));
    await denied(clipSvc.getReviewQueue(FRESH, camp));
  });

  it("redeeming an invite link makes a stranger a CREATOR of that campaign only — no review, money or people powers", async () => {
    await db.insert(users).values({ id: "invitee", username: "invitee" });
    const link = await campaignSvc.generateInviteLink("owner", camp);
    await campaignSvc.redeemInvite("invitee", link.code);
    expect(await getRoleForCampaign("invitee", camp)).toBe("creator");
    await denied(requireRole("invitee", camp, "mod"));
    await denied(clipSvc.reviewClip("invitee", camp, clipId, { action: "approve" }));
    await denied(clipSvc.markPaid("invitee", camp, clipId));
    await denied(clipSvc.getReviewQueue("invitee", camp));
    await denied(clipSvc.getCreatorRoster("invitee", camp));
    await denied(campaignSvc.generateInviteLink("invitee", camp));
    await denied(campaignSvc.pauseCampaign("invitee", camp));
    expect(await isPlatformOwner("invitee")).toBe(false);
  });
});

describe("campaign_brands (read-only Brand role)", () => {
  it("addBrand assigns the role; Brand is refused every reviewer/admin/people/creator action, but its own read-only feed succeeds and never carries creator identity", async () => {
    await db.insert(users).values({ id: "brandviewer", username: "brandviewer" });
    await campaignSvc.addBrand("owner", camp, "brandviewer");
    expect(await getRoleForCampaign("brandviewer", camp)).toBe("brand");
    await denied(requireRole("brandviewer", camp, "mod"));

    // Reviewer/admin/people actions -- refused server-side, same as any other non-privileged actor.
    await denied(clipSvc.reviewClip("brandviewer", camp, clipId, { action: "approve" }));
    await denied(clipSvc.setQualifyingAudiencePct("brandviewer", camp, clipId, 50));
    await denied(clipSvc.markPaid("brandviewer", camp, clipId));
    await denied(clipSvc.deleteClip("brandviewer", camp, clipId));
    await denied(clipSvc.setPostedAt("brandviewer", camp, clipId, "2020-01-01"));
    await denied(clipSvc.getReviewQueue("brandviewer", camp));
    await denied(clipSvc.getReviewerClipHistory("brandviewer", camp)); // includes creatorUsername -- brand must never reach it
    await denied(clipSvc.getClipHistory("brandviewer", camp));
    await denied(clipSvc.getCreatorRoster("brandviewer", camp));
    await denied(clipSvc.refreshViews("brandviewer", camp, clipId));
    await denied(clipSvc.getProofImage("brandviewer", camp, clipId));
    await denied(campaignSvc.generateInviteLink("brandviewer", camp));
    await denied(campaignSvc.revokeInviteLink("brandviewer", camp, linkId));
    await denied(campaignSvc.listInviteLinks("brandviewer", camp));
    await denied(campaignSvc.pauseCampaign("brandviewer", camp));
    await denied(campaignSvc.updateCampaignSettings("brandviewer", camp, { ...validCampaign, baseRate: 999 }));
    await denied(campaignSvc.addBrand("brandviewer", camp, "brandviewer")); // can't add other Brands either -- admin minimum
    await denied(campaignSvc.removeBrand("brandviewer", camp, "00000000-0000-0000-0000-000000000000"));
    // creator-only actions still refused -- brand outranks creator, but these are self-scoped by
    // campaign_creators membership, not rank, and brandviewer has no such row.
    await denied(clipSvc.submitClip("brandviewer", camp, "https://www.tiktok.com/@u/video/333"));
    await denied(clipSvc.attachVideoProof("brandviewer", camp, clipId, "https://youtu.be/aaaaaaaaaaa"));

    // Its own permitted read succeeds, sees every clip regardless of status, and carries no creator identity.
    const feed = await clipSvc.getBrandClipFeed("brandviewer", camp);
    expect(feed.rows.some((r) => r.id === clipId)).toBe(true);
    for (const r of feed.rows) expect(r).not.toHaveProperty("creatorUsername");
    expect(feed.stats.totalClips).toBeGreaterThan(0);
  });

  it("addBrand/removeBrand are Owner/Admin only, and enforce one campaign at a time like a Mod", async () => {
    const campY = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Brand scope B" })).id;
    await db.insert(users).values({ id: "brandviewer2", username: "brandviewer2" });
    await denied(campaignSvc.addBrand("mod", camp, "brandviewer2")); // Mod can't add a Brand
    const row = await campaignSvc.addBrand("owner", camp, "brandviewer2");
    await expect(campaignSvc.addBrand("admin", campY, "brandviewer2")).rejects.toThrow(/one campaign at a time/i);
    await campaignSvc.removeBrand("admin", camp, row!.id);
    expect(await getRoleForCampaign("brandviewer2", camp)).toBeNull();
  });
});
