import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { campaignBrands, campaignCreators, campaignMods, clips, platformAdmins, users } from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as clipSvc from "@/lib/clips/service";
import * as team from "@/lib/team/service";
import { getRoleForCampaign, requireRole } from "@/lib/auth/roles";

let db: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;

const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/Access denied/i);
const modRows = (campaignId: string) => db.select().from(campaignMods).where(eq(campaignMods.campaignId, campaignId));

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin1", username: "admin1" },
    { id: "cpe1", username: "cpe1" },
    { id: "cpe2", username: "cpe2" },
    { id: "c1", username: "c1" },
    { id: "c2", username: "c2" },
    { id: "c3", username: "c3" },
    { id: "brand1", username: "brand1" },
    { id: "newadmin", username: "newadmin" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin1" });
  A = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Alpha" })).id;
  B = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Beta" })).id;
  await db.insert(campaignCreators).values([
    { campaignId: A, userId: "c1" },
    { campaignId: A, userId: "c2" },
  ]);
});

describe("who can assign a Mod/CPE", () => {
  it("lets the Owner and an Admin add and remove one, and nobody else", async () => {
    const m1 = await campaignSvc.addMod("owner", A, "cpe1");
    expect(await getRoleForCampaign("cpe1", A)).toBe("mod");
    await campaignSvc.removeMod("admin1", A, m1.id);
    expect(await getRoleForCampaign("cpe1", A)).toBeNull();

    await campaignSvc.addMod("admin1", A, "cpe1");
    for (const who of ["cpe1", "c1", "brand1", "c3"]) {
      await denied(campaignSvc.addMod(who, A, "cpe2"));
      await denied(campaignSvc.listMods(who, A));
      await denied(campaignSvc.listAssignableUsernames(who, A));
    }
    expect((await modRows(A)).map((r) => r.userId)).toEqual(["cpe1"]);
    const [row] = await modRows(A);
    await denied(campaignSvc.removeMod("cpe1", A, row.id)); // a Mod can't remove Mods either
  });

  it("works on one campaign at a time and never reaches across campaigns", async () => {
    await expect(campaignSvc.addMod("owner", B, "cpe1")).rejects.toThrow(/one campaign at a time/);
    const mine = await campaignSvc.addMod("owner", B, "cpe2");
    const [aRow] = await modRows(A);
    await campaignSvc.removeMod("owner", B, aRow.id); // A's row addressed through B: nothing happens
    expect((await modRows(A)).map((r) => r.userId)).toEqual(["cpe1"]);
    expect((await modRows(B)).map((r) => r.id)).toEqual([mine.id]);
  });

  it("refuses unknown usernames, Admins and the Owner, with a clear message", async () => {
    await expect(campaignSvc.addMod("owner", A, "nobody_here")).rejects.toThrow(/No user with username "nobody_here"/);
    await expect(campaignSvc.addMod("owner", A, "admin1")).rejects.toThrow(/already an Owner\/Admin/);
    await expect(campaignSvc.addMod("owner", A, "owner")).rejects.toThrow(/already an Owner\/Admin/);
    await expect(campaignSvc.addMod("owner", A, "   ")).rejects.toThrow(/Enter a username/);
  });

  it("can't be a Mod and a Brand viewer on the same campaign", async () => {
    await campaignSvc.addBrand("owner", A, "brand1");
    await expect(campaignSvc.addMod("owner", A, "brand1")).rejects.toThrow(/Brand viewer on this campaign/);
    await expect(campaignSvc.addBrand("owner", A, "cpe1")).rejects.toThrow(/Mod\/CPE on this campaign/);
  });

  it("lists only people who can still be assigned here", async () => {
    const names = await campaignSvc.listAssignableUsernames("admin1", A);
    expect(names).toEqual(expect.arrayContaining(["c1", "c2", "c3", "newadmin"]));
    for (const gone of ["owner", "admin1", "cpe1", "brand1"]) expect(names).not.toContain(gone);
  });
});

describe("Mod/CPE limits", () => {
  it("keeps a creator's membership when they become the campaign's Mod, and the Mod role wins", async () => {
    await campaignSvc.addMod("owner", A, "c2");
    expect(await getRoleForCampaign("c2", A)).toBe("mod");
    const rows = await db
      .select()
      .from(campaignCreators)
      .where(and(eq(campaignCreators.campaignId, A), eq(campaignCreators.userId, "c2")));
    expect(rows).toHaveLength(1); // "keep both roles"
    await requireRole("c2", A, "mod");
  });

  it("blocks a Mod from reviewing their OWN post, while another Mod or an Admin still can", async () => {
    const [own] = await db
      .insert(clips)
      .values({ campaignId: A, creatorUserId: "c2", platform: "tiktok", url: "https://www.tiktok.com/@c2/video/9001" })
      .returning();
    await expect(clipSvc.reviewClip("c2", A, own.id, { action: "reject", reason: "no" })).rejects.toThrow(/your own post/);
    await expect(clipSvc.setQualifyingAudiencePct("c2", A, own.id, 50)).rejects.toThrow(/your own post/);
    await expect(clipSvc.setManualViews("c2", A, own.id, 10)).rejects.toThrow(/your own post/);
    await expect(clipSvc.updateRejectionReason("c2", A, own.id, "x")).rejects.toThrow(/your own post/);
    await expect(clipSvc.unlockAnalyticsEarly("c2", A, own.id)).rejects.toThrow(/your own post/);

    await clipSvc.reviewClip("cpe1", A, own.id, { action: "reject", reason: "Not on brief" }); // a different Mod can
    const [after] = await db.select().from(clips).where(eq(clips.id, own.id));
    expect(after.status).toBe("rejected");
  });

  it("can't mark paid, delete or Post Approve", async () => {
    const [c] = await db
      .insert(clips)
      .values({ campaignId: A, creatorUserId: "c1", platform: "tiktok", url: "https://www.tiktok.com/@c1/video/9002", status: "approved", payout: "1.00" })
      .returning();
    await denied(clipSvc.markPaid("cpe1", A, c.id));
    await denied(clipSvc.deleteClip("cpe1", A, c.id));
    await denied(clipSvc.clipApprove("cpe1", A, c.id));
    const [still] = await db.select().from(clips).where(eq(clips.id, c.id));
    expect(still).toMatchObject({ paidStatus: "unpaid", deletedAt: null });
  });
});

describe("making and removing Admins", () => {
  it("is the platform Owner's call alone, not even an Admin's", async () => {
    for (const who of ["admin1", "cpe1", "c1"]) {
      await denied(team.addPlatformAdmin(who, "newadmin"));
      await denied(team.removePlatformAdmin(who, "admin1"));
      await denied(team.listPlatformAdmins(who));
      await denied(team.listAdminCandidates(who));
    }
    expect((await db.select().from(platformAdmins)).map((r) => r.userId)).toEqual(["admin1"]);
  });

  it("gives and takes away power on every campaign", async () => {
    expect(await getRoleForCampaign("newadmin", A)).toBeNull();
    await team.addPlatformAdmin("owner", "newadmin");
    expect(await getRoleForCampaign("newadmin", A)).toBe("admin");
    expect(await getRoleForCampaign("newadmin", B)).toBe("admin");
    expect((await team.listPlatformAdmins("owner")).map((a) => a.username).sort()).toEqual(["admin1", "newadmin"]);
    expect(await team.listAdminCandidates("owner")).not.toContain("newadmin");

    await team.removePlatformAdmin("owner", "newadmin");
    expect(await getRoleForCampaign("newadmin", A)).toBeNull();
    expect(await team.listAdminCandidates("owner")).toContain("newadmin");
    await expect(team.removePlatformAdmin("owner", "newadmin")).rejects.toThrow(/isn't an Admin/);
  });

  it("rejects unknown usernames and the Owner, and adding twice is harmless", async () => {
    await expect(team.addPlatformAdmin("owner", "ghost")).rejects.toThrow(/No user with username "ghost"/);
    await expect(team.addPlatformAdmin("owner", "owner")).rejects.toThrow(/the platform Owner already/);
    await team.addPlatformAdmin("owner", "admin1");
    expect((await db.select().from(platformAdmins).where(eq(platformAdmins.userId, "admin1")))).toHaveLength(1);
  });

  it("lets a brand-new Admin add a Mod/CPE, but not make another Admin", async () => {
    await team.addPlatformAdmin("owner", "newadmin");
    await denied(team.addPlatformAdmin("newadmin", "c3"));
    await campaignSvc.addBrand("newadmin", B, "c3");
    expect((await db.select().from(campaignBrands).where(eq(campaignBrands.campaignId, B))).map((r) => r.userId)).toEqual(["c3"]);
  });
});
