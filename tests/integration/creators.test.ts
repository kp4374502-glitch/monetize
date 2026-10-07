import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { campaignCreators, campaigns, creatorProfiles, users } from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as creatorSvc from "@/lib/creators/service";

let db: Awaited<ReturnType<typeof createTestDb>>;
let active: string;
let paused: string;

const profile = {
  firstName: "John",
  lastName: "Doe",
  birthday: "2004-11-07",
  gender: "male",
  country: "India",
  phoneCountryCode: "+91",
  phoneNumber: "9876543210",
  termsAccepted: true,
  creatorType: "faceless",
  socials: [{ platform: "tiktok", handle: "@glowlarp", language: "English" }],
  showcaseUrls: ["https://youtu.be/abc"],
};

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "newbie", username: "newbie" },
    { id: "other", username: "other" },
    { id: "banned", username: "banned" },
  ]);
  active = (await campaignSvc.createCampaign("owner", validCampaign)).id;
  paused = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Paused one" })).id;
  await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, paused));
});

describe("creator onboarding", () => {
  it("rejects an invalid profile without writing anything", async () => {
    await expect(creatorSvc.saveCreatorProfile("newbie", { ...profile, termsAccepted: false })).rejects.toThrow();
    expect(await creatorSvc.getCreatorProfile("newbie")).toBeNull();
  });

  it("won't record the Discord click or complete before a profile exists", async () => {
    await expect(creatorSvc.recordDiscordJoinClick("newbie")).rejects.toThrow(/profile/);
    await expect(creatorSvc.completeOnboarding("newbie")).rejects.toThrow(/profile/);
  });

  it("saves the profile, normalising the social handle", async () => {
    const row = await creatorSvc.saveCreatorProfile("newbie", profile);
    expect(row.socials).toEqual([{ platform: "tiktok", handle: "glowlarp", language: "English" }]);
    expect(row.onboardingCompletedAt).toBeNull();
  });

  it("refuses to complete until Join Community has been clicked (Discord is mandatory)", async () => {
    await expect(creatorSvc.completeOnboarding("newbie")).rejects.toThrow(/Discord/);
    await creatorSvc.recordDiscordJoinClick("newbie");
    const done = await creatorSvc.completeOnboarding("newbie");
    expect(done.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it("re-saving after completion keeps it completed and keeps the Discord click", async () => {
    const before = await creatorSvc.getCreatorProfile("newbie");
    await creatorSvc.saveCreatorProfile("newbie", { ...profile, firstName: "Jon" });
    const after = await creatorSvc.getCreatorProfile("newbie");
    expect(after?.firstName).toBe("Jon");
    expect(after?.onboardingCompletedAt).toEqual(before?.onboardingCompletedAt);
    expect(after?.discordJoinClickedAt).toEqual(before?.discordJoinClickedAt);
  });

  it("each user only ever touches their own row", async () => {
    expect(await creatorSvc.getCreatorProfile("other")).toBeNull();
    expect(await db.select().from(creatorProfiles)).toHaveLength(1);
  });
});

describe("active campaign directory", () => {
  it("lists only active campaigns, with no budget or rate fields", async () => {
    const list = await campaignSvc.listActiveCampaigns("newbie");
    expect(list.map((c) => c.id)).toEqual([active]);
    expect(Object.keys(list[0]).sort()).toEqual(["brandName", "eligiblePlatforms", "id", "joined", "name"]);
    expect(list[0].joined).toBe(false);
  });

  it("joins an active campaign once, even when clicked twice", async () => {
    await campaignSvc.joinActiveCampaign("newbie", active);
    await campaignSvc.joinActiveCampaign("newbie", active);
    const rows = await db
      .select()
      .from(campaignCreators)
      .where(and(eq(campaignCreators.campaignId, active), eq(campaignCreators.userId, "newbie")));
    expect(rows).toHaveLength(1);
    expect(rows[0].inviteLinkId).toBeNull();
    expect((await campaignSvc.listActiveCampaigns("newbie"))[0].joined).toBe(true);
    expect((await campaignSvc.listActiveCampaigns("other"))[0].joined).toBe(false);
  });

  it("refuses paused or unknown campaigns", async () => {
    await expect(campaignSvc.joinActiveCampaign("other", paused)).rejects.toThrow(/isn't open/);
    await expect(campaignSvc.joinActiveCampaign("other", "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/isn't open/);
  });

  it("does not un-suspend a suspended creator who clicks Join again", async () => {
    await db.insert(campaignCreators).values({ campaignId: active, userId: "banned", suspended: true });
    await campaignSvc.joinActiveCampaign("banned", active);
    const [row] = await db
      .select()
      .from(campaignCreators)
      .where(and(eq(campaignCreators.campaignId, active), eq(campaignCreators.userId, "banned")));
    expect(row.suspended).toBe(true);
  });
});
