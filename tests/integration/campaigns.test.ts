import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { users, platformAdmins, campaignMods, campaignCreators, campaigns } from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as svc from "@/lib/campaigns/service";
import { getCampaignForUser, getCampaignsForUser, getRoleForCampaign } from "@/lib/auth/roles";

let db: Awaited<ReturnType<typeof createTestDb>>;
let campA: string;
let campB: string;

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin", username: "admin" },
    { id: "mod", username: "mod" },
    { id: "creatorA", username: "creatorA" },
    { id: "creatorB", username: "creatorB" },
    { id: "brandowner", username: "brandowner" },
    { id: "nobody", username: "nobody" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });
  campA = (await svc.createCampaign("owner", validCampaign)).id;
  campB = (await svc.createCampaign("owner", { ...validCampaign, name: "Second" })).id;
  await db.insert(campaignMods).values({ campaignId: campA, userId: "mod", addedBy: "owner" });
});

describe("createCampaign", () => {
  it("rejects a non-Owner caller, including Admin, Mod and Creator", async () => {
    for (const who of ["admin", "mod", "creatorA", "nobody"]) {
      await expect(svc.createCampaign(who, validCampaign)).rejects.toThrow(/only the platform Owner/);
    }
    expect(await db.select().from(campaigns)).toHaveLength(2);
  });

  it("rejects invalid input from the Owner", async () => {
    await expect(svc.createCampaign("owner", { ...validCampaign, baseRate: -1 })).rejects.toThrow();
  });

  it("stores the caller as ownerUserId", async () => {
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, campA));
    expect(row.ownerUserId).toBe("owner");
  });
});

describe("roles", () => {
  it("platform Owner is owner on every campaign, even one they do not own", async () => {
    await db.update(campaigns).set({ ownerUserId: "brandowner" }).where(eq(campaigns.id, campB));
    expect(await getRoleForCampaign("owner", campB)).toBe("owner");
    expect(await getRoleForCampaign("brandowner", campB)).toBe("owner");
    expect(await getRoleForCampaign("brandowner", campA)).toBeNull();
  });

  it("admin is implicit everywhere; mod only where assigned", async () => {
    expect(await getRoleForCampaign("admin", campA)).toBe("admin");
    expect(await getRoleForCampaign("admin", campB)).toBe("admin");
    expect(await getRoleForCampaign("mod", campA)).toBe("mod");
    expect(await getRoleForCampaign("mod", campB)).toBeNull();
  });

  it("malformed campaign ids resolve to no access instead of throwing", async () => {
    expect(await getRoleForCampaign("owner", "not-a-uuid")).toBeNull();
  });
});

describe("tenant isolation", () => {
  it("getCampaignForUser returns null for campaigns the user has no role on", async () => {
    expect(await getCampaignForUser("mod", campB)).toBeNull();
    expect(await getCampaignForUser("nobody", campA)).toBeNull();
    expect((await getCampaignForUser("mod", campA))?.id).toBe(campA);
  });

  it("an Admin-level action on campaign A is denied for a Mod, and invite revoke cannot cross campaigns", async () => {
    await expect(svc.pauseCampaign("mod", campA)).rejects.toThrow(/Access denied/);
    const linkB = await svc.generateInviteLink("owner", campB);
    await expect(svc.revokeInviteLink("mod", campA, linkB.id)).rejects.toThrow(/not found/);
    expect((await svc.lookupInvite(linkB.code)).ok).toBe(true);
  });

  it("a Mod cannot generate an invite link for another campaign", async () => {
    await expect(svc.generateInviteLink("mod", campB)).rejects.toThrow(/Access denied/);
  });
});

describe("campaign switcher (getCampaignsForUser)", () => {
  it("shows the right campaigns and role per campaign for a multi-campaign user", async () => {
    // mod on A (assigned), creator on B (joined via invite)
    const link = await svc.generateInviteLink("owner", campB);
    await svc.redeemInvite("mod", link.code);
    const list = await getCampaignsForUser("mod");
    expect(list.map((c) => [c.id, c.role]).sort()).toEqual(
      [
        [campA, "mod"],
        [campB, "creator"],
      ].sort(),
    );
  });

  it("creator sees only joined campaigns; stranger sees none; admin/owner see all", async () => {
    expect(await getCampaignsForUser("nobody")).toEqual([]);
    expect(await getCampaignsForUser("admin")).toHaveLength(2);
    expect(await getCampaignsForUser("owner")).toHaveLength(2);
    const link = await svc.generateInviteLink("admin", campA);
    await svc.redeemInvite("creatorA", link.code);
    expect((await getCampaignsForUser("creatorA")).map((c) => c.id)).toEqual([campA]);
  });
});

describe("lifecycle", () => {
  it("Admin can update settings, pause, close, archive and reopen", async () => {
    await svc.updateCampaignSettings("admin", campA, { ...validCampaign, baseRate: 2 });
    for (const [fn, status] of [
      [svc.pauseCampaign, "paused"],
      [svc.closeCampaign, "closed"],
      [svc.archiveCampaign, "archived"],
      [svc.reopenCampaign, "active"],
    ] as const) {
      expect((await fn("admin", campA)).status).toBe(status);
    }
  });

  it("Admin cannot delete; platform Owner and the campaign's own owner can", async () => {
    await expect(svc.deleteCampaign("admin", campA)).rejects.toThrow(/only an Owner/);
    await expect(svc.deleteCampaign("mod", campA)).rejects.toThrow(/only an Owner/);
    const c = await svc.createCampaign("owner", { ...validCampaign, name: "Temp" });
    await db.update(campaigns).set({ ownerUserId: "brandowner" }).where(eq(campaigns.id, c.id));
    const link = await svc.generateInviteLink("brandowner", c.id);
    await svc.redeemInvite("creatorB", link.code);
    await svc.deleteCampaign("brandowner", c.id);
    expect(await db.select().from(campaigns).where(eq(campaigns.id, c.id))).toHaveLength(0);
    const c2 = await svc.createCampaign("owner", { ...validCampaign, name: "Temp2" });
    await svc.deleteCampaign("owner", c2.id);
    expect(await db.select().from(campaigns).where(eq(campaigns.id, c2.id))).toHaveLength(0);
  });
});

describe("invite links", () => {
  it("a revoked link cannot be looked up as valid or redeemed, and the row is kept", async () => {
    const link = await svc.generateInviteLink("owner", campA);
    await svc.revokeInviteLink("owner", campA, link.id);
    expect(await svc.lookupInvite(link.code)).toEqual({ ok: false, reason: "revoked" });
    await expect(svc.redeemInvite("creatorB", link.code)).rejects.toThrow(/revoked/);
    const rows = await db.select().from(campaignCreators).where(eq(campaignCreators.userId, "creatorB"));
    expect(rows.filter((r) => r.campaignId === campA)).toHaveLength(0);
  });

  it("unknown codes are reported as not found", async () => {
    expect(await svc.lookupInvite("nope")).toEqual({ ok: false, reason: "not_found" });
  });

  it("is reusable: many users join with the same link, link stays valid", async () => {
    const link = await svc.generateInviteLink("owner", campA);
    await svc.redeemInvite("creatorA", link.code);
    await svc.redeemInvite("creatorB", link.code);
    expect((await svc.lookupInvite(link.code)).ok).toBe(true);
  });

  it("concurrent redemption by the same user creates exactly one campaign_creators row", async () => {
    await db.insert(users).values({ id: "racer", username: "racer" });
    const link = await svc.generateInviteLink("owner", campA);
    await Promise.all(Array.from({ length: 5 }, () => svc.redeemInvite("racer", link.code)));
    const rows = await db.select().from(campaignCreators).where(eq(campaignCreators.userId, "racer"));
    expect(rows).toHaveLength(1);
    expect(rows[0].inviteLinkId).toBe(link.id);
  });
});
