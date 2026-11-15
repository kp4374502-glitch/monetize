import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { campaignCreators, campaignMods, campaigns, platformAdmins, users } from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import { campaignDetailsSchema } from "@/lib/campaigns/schemas";

let db: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;

const row = async (id: string) => (await db.select().from(campaigns).where(eq(campaigns.id, id)))[0];

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin", username: "admin" },
    { id: "brandowner", username: "brandowner" },
    { id: "mod1", username: "mod1" },
    { id: "brandviewer", username: "brandviewer" },
    { id: "c1", username: "c1" },
    { id: "outsider", username: "outsider" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });
  A = (await campaignSvc.createCampaign("owner", { ...validCampaign, brandName: "Koonami", name: "Efootball Diwali" })).id;
  B = (await campaignSvc.createCampaign("owner", { ...validCampaign, brandName: "HairU", name: "Hair u" })).id;
  await db.update(campaigns).set({ ownerUserId: "brandowner" }).where(eq(campaigns.id, A));
  await db.insert(campaignMods).values({ campaignId: A, userId: "mod1", addedBy: "owner" });
  await campaignSvc.addBrand("owner", A, "brandviewer");
  await db.insert(campaignCreators).values({ campaignId: A, userId: "c1" });
});

describe("updateCampaignDetails", () => {
  it("lets the platform Owner rename the campaign and brand, trimming whitespace", async () => {
    expect(await campaignSvc.updateCampaignDetails("owner", A, { brandName: "  Konami ", name: " eFootball Diwali Cup " })).toEqual({
      id: A,
      brandName: "Konami",
      name: "eFootball Diwali Cup",
    });
  });

  it("lets an Admin and the campaign's own owner rename it too", async () => {
    await campaignSvc.updateCampaignDetails("admin", A, { brandName: "Konami", name: "Admin rename" });
    expect((await row(A)).name).toBe("Admin rename");
    await campaignSvc.updateCampaignDetails("brandowner", A, { brandName: "Konami", name: "Owner rename" });
    expect((await row(A)).name).toBe("Owner rename");
  });

  it("refuses a Mod, a Brand viewer, a Creator and an outsider, and changes nothing", async () => {
    const before = await row(A);
    for (const who of ["mod1", "brandviewer", "c1", "outsider"]) {
      await expect(campaignSvc.updateCampaignDetails(who, A, { brandName: "X", name: "Hijacked" })).rejects.toThrow(/Access denied/);
    }
    expect(await row(A)).toEqual(before);
  });

  it("rejects a blank brand or campaign name", async () => {
    await expect(campaignSvc.updateCampaignDetails("owner", A, { brandName: "Konami", name: "   " })).rejects.toThrow(/Campaign name is required/);
    await expect(campaignSvc.updateCampaignDetails("owner", A, { brandName: "", name: "Fine" })).rejects.toThrow(/Brand name is required/);
    await expect(campaignSvc.updateCampaignDetails("owner", A, { name: "Fine" })).rejects.toThrow();
  });

  it("only changes the two names: payout settings, platforms, status and owner stay exactly as they were", async () => {
    const before = await row(A);
    await campaignSvc.updateCampaignDetails("owner", A, { brandName: "Konami", name: "Untouched check" });
    const after = await row(A);
    expect(after).toEqual({ ...before, brandName: "Konami", name: "Untouched check" });
  });

  it("never touches another campaign (tenant isolation)", async () => {
    const otherBefore = await row(B);
    await campaignSvc.updateCampaignDetails("owner", A, { brandName: "Konami", name: "Only A" });
    expect(await row(B)).toEqual(otherBefore);
    // a Mod on A has no access to B at all
    await expect(campaignSvc.updateCampaignDetails("mod1", B, { brandName: "X", name: "Y" })).rejects.toThrow(/Access denied/);
  });
});

describe("campaignDetailsSchema", () => {
  it("accepts only brandName and name, and drops anything else", () => {
    expect(campaignDetailsSchema.parse({ brandName: "B", name: "N", baseRate: 99, status: "closed" })).toEqual({ brandName: "B", name: "N" });
  });
});
