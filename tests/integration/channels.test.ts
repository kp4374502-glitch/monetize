import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import {
  campaignBrands,
  campaignChannelPosts,
  campaignChannelReads,
  campaignCreators,
  campaignMods,
  notifications,
  platformAdmins,
  users,
} from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import * as campaignSvc from "@/lib/campaigns/service";
import * as channels from "@/lib/channels/service";
import { CHANNEL_IDS } from "@/lib/channels/schemas";

let db: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;

const post = (over: Record<string, unknown> = {}) => ({
  channel: "announcements",
  title: "Campaign is live",
  body: "Welcome. Read post-requirements first.",
  links: [] as { url: string; label: string }[],
  ...over,
});
const countPosts = async (campaignId: string) =>
  (await db.select().from(campaignChannelPosts).where(eq(campaignChannelPosts.campaignId, campaignId))).length;
const view = async (userId: string, campaignId: string, id: string) =>
  (await channels.getCampaignChannels(userId, campaignId)).channels.find((c) => c.id === id)!;

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin1", username: "admin1" },
    { id: "mod1", username: "mod1" },
    { id: "c1", username: "c1" },
    { id: "c2", username: "c2" },
    { id: "c3", username: "c3" },
    { id: "outsider", username: "outsider" },
    { id: "brandv", username: "brandv" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin1" });
  A = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Alpha" })).id;
  B = (await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Beta" })).id;
  await db.insert(campaignMods).values({ campaignId: A, userId: "mod1", addedBy: "owner" });
  await db.insert(campaignCreators).values([
    { campaignId: A, userId: "c1" },
    { campaignId: A, userId: "c2" },
    { campaignId: B, userId: "c3" },
  ]);
  await db.insert(campaignBrands).values({ campaignId: A, userId: "brandv", addedBy: "owner" });
});

describe("campaign channels: who can read", () => {
  it("shows all nine channels, in order, even when empty", async () => {
    const o = await channels.getCampaignChannels("c1", A);
    expect(o.channels.map((c) => c.id)).toEqual([...CHANNEL_IDS]);
    expect(o.channels.every((c) => c.posts.length === 0 && c.unread === 0)).toBe(true);
  });

  it("lets creators, Mods, Admin and Owner read; only Owner/Admin get the posting controls", async () => {
    for (const [who, canPost] of [["c1", false], ["mod1", false], ["admin1", true], ["owner", true]] as const) {
      expect((await channels.getCampaignChannels(who, A)).canPost, who).toBe(canPost);
    }
  });

  it("refuses an outsider, a Brand viewer, and a creator of a DIFFERENT campaign", async () => {
    for (const who of ["outsider", "brandv", "c3"]) {
      await expect(channels.getCampaignChannels(who, A), who).rejects.toThrow(/Access denied/);
      await expect(channels.markChannelRead(who, A, "announcements"), who).rejects.toThrow(/Access denied/);
    }
  });
});

describe("campaign channels: who can write", () => {
  it("lets Owner and Admin post, and nobody else", async () => {
    await channels.createChannelPost("owner", A, post({ title: "By owner" }));
    await channels.createChannelPost("admin1", A, post({ title: "By admin" }));
    expect(await countPosts(A)).toBe(2);
    for (const who of ["mod1", "c1", "outsider", "brandv", "c3"]) {
      await expect(channels.createChannelPost(who, A, post()), who).rejects.toThrow(/Access denied/);
    }
    expect(await countPosts(A)).toBe(2);
  });

  it("rejects bad input without writing anything", async () => {
    const before = await countPosts(A);
    const bad: Record<string, unknown>[] = [
      { channel: "chat" },
      { channel: "submit_your_posts" },
      { title: "   " },
      { body: "" },
      { title: "x".repeat(121) },
      { links: [{ url: "javascript:alert(1)", label: "" }] },
      { links: [{ url: "not a url", label: "" }] },
      { links: [{ url: "ftp://files.example.com/a", label: "" }] },
      { links: Array.from({ length: 4 }, (_, i) => ({ url: `https://example.com/${i}`, label: "" })) },
    ];
    for (const over of bad) await expect(channels.createChannelPost("owner", A, post(over)), JSON.stringify(over)).rejects.toThrow();
    expect(await countPosts(A)).toBe(before);
  });

  it("stores trimmed text and up to three http(s) links on the right channel, newest first", async () => {
    await channels.createChannelPost("owner", A, post({ channel: "assets", title: "  Logo pack ", body: " Drive folder ", links: [{ url: "https://drive.google.com/x", label: "Logo pack" }] }));
    await channels.createChannelPost("owner", A, post({ channel: "assets", title: "Recordings", links: [{ url: "http://example.com/r", label: "" }] }));
    const assets = await view("c1", A, "assets");
    expect(assets.posts.map((p) => p.title)).toEqual(["Recordings", "Logo pack"]);
    expect(assets.posts[1]).toMatchObject({ body: "Drive folder", links: [{ url: "https://drive.google.com/x", label: "Logo pack" }] });
    expect((await view("c1", A, "bonus")).posts).toEqual([]);
  });
});

describe("campaign channels: new-post badges", () => {
  it("counts other people's new posts per viewer, never the viewer's own, and clears on open", async () => {
    const before = (await view("c1", A, "bonus")).unread;
    await channels.createChannelPost("owner", A, post({ channel: "bonus", title: "Weekly bonus" }));
    expect((await view("c1", A, "bonus")).unread).toBe(before + 1);
    expect((await view("owner", A, "bonus")).unread).toBe(0); // your own post is never "new" to you

    await channels.markChannelRead("c1", A, "bonus");
    expect((await view("c1", A, "bonus")).unread).toBe(0);
    expect((await view("c2", A, "bonus")).unread).toBe(1); // c2 hasn't opened it

    await new Promise((r) => setTimeout(r, 15));
    await channels.createChannelPost("admin1", A, post({ channel: "bonus", title: "Second bonus" }));
    expect((await view("c1", A, "bonus")).unread).toBe(1);
  });

  it("keeps exactly one read marker per person per channel, however often they open it", async () => {
    await channels.markChannelRead("c1", A, "bonus");
    await channels.markChannelRead("c1", A, "bonus");
    const rows = await db
      .select()
      .from(campaignChannelReads)
      .where(and(eq(campaignChannelReads.userId, "c1"), eq(campaignChannelReads.campaignId, A), eq(campaignChannelReads.channel, "bonus")));
    expect(rows).toHaveLength(1);
    await expect(channels.markChannelRead("c1", A, "chat")).rejects.toThrow();
  });
});

describe("campaign channels: announcements ping creators", () => {
  const notesFor = (userId: string, campaignId: string) =>
    db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.campaignId, campaignId), eq(notifications.type, "announcement")));

  it("notifies every creator on THIS campaign (not the author, not other campaigns) for an announcement only", async () => {
    const c1Before = (await notesFor("c1", A)).length;
    await channels.createChannelPost("owner", A, post({ title: "Bonus week starts Monday" }));
    const c1 = await notesFor("c1", A);
    expect(c1).toHaveLength(c1Before + 1);
    expect(c1.at(-1)!.message).toBe("New announcement in Alpha: Bonus week starts Monday");
    expect((await notesFor("c2", A)).length).toBeGreaterThan(0);
    expect(await notesFor("owner", A)).toHaveLength(0);
    expect(await notesFor("c3", A)).toHaveLength(0);
    expect(await notesFor("c3", B)).toHaveLength(0); // a different campaign's creator is never pinged

    const total = (await db.select().from(notifications)).length;
    await channels.createChannelPost("owner", A, post({ channel: "assets", title: "More assets" }));
    expect((await db.select().from(notifications)).length).toBe(total); // other channels stay quiet
  });

  it("does not notify again when an announcement is edited", async () => {
    const created = await channels.createChannelPost("owner", A, post({ title: "Original" }));
    const total = (await db.select().from(notifications)).length;
    await channels.updateChannelPost("owner", A, created.id, { title: "Reworded", body: "New text", links: [] });
    expect((await db.select().from(notifications)).length).toBe(total);
  });
});

describe("campaign channels: edit and delete", () => {
  it("lets Owner/Admin edit, keeps the channel, refuses everyone else", async () => {
    const created = await channels.createChannelPost("owner", A, post({ channel: "content_brief", title: "Brief v1" }));
    const edited = await channels.updateChannelPost("admin1", A, created.id, {
      title: "Brief v2",
      body: "Updated",
      links: [{ url: "https://example.com/brief", label: "" }],
    });
    expect(edited).toMatchObject({ title: "Brief v2", body: "Updated", channel: "content_brief" });
    expect(edited.updatedAt.getTime()).toBeGreaterThanOrEqual(edited.createdAt.getTime());
    for (const who of ["mod1", "c1", "brandv"]) {
      await expect(channels.updateChannelPost(who, A, created.id, { title: "x", body: "y", links: [] }), who).rejects.toThrow(/Access denied/);
    }
  });

  it("only reaches posts of the campaign it's addressed through", async () => {
    const inB = await channels.createChannelPost("owner", B, post({ title: "Beta only" }));
    await expect(channels.updateChannelPost("owner", A, inB.id, { title: "hijack", body: "x", links: [] })).rejects.toThrow(/not found/);
    await expect(channels.deleteChannelPost("owner", A, inB.id)).rejects.toThrow(/not found/);
    expect(await db.select().from(campaignChannelPosts).where(eq(campaignChannelPosts.id, inB.id))).toHaveLength(1);
    expect((await view("c3", B, "announcements")).posts.map((p) => p.title)).toContain("Beta only");
    expect((await view("c1", A, "announcements")).posts.map((p) => p.title)).not.toContain("Beta only");
  });

  it("lets Owner/Admin delete (once), and refuses everyone else", async () => {
    const created = await channels.createChannelPost("owner", A, post({ channel: "bonus", title: "Temporary" }));
    for (const who of ["mod1", "c1", "outsider"]) await expect(channels.deleteChannelPost(who, A, created.id), who).rejects.toThrow(/Access denied/);
    await channels.deleteChannelPost("admin1", A, created.id);
    await expect(channels.deleteChannelPost("owner", A, created.id)).rejects.toThrow(/not found/);
    expect((await view("c1", A, "bonus")).posts.map((p) => p.title)).not.toContain("Temporary");
  });
});

describe("campaign channels: deleting a campaign", () => {
  it("removes its channel posts and read markers with it, and leaves other campaigns alone", async () => {
    await channels.markChannelRead("c3", B, "announcements");
    expect(await countPosts(B)).toBeGreaterThan(0);
    const aBefore = await countPosts(A);
    await campaignSvc.deleteCampaign("owner", B);
    expect(await countPosts(B)).toBe(0);
    expect(await db.select().from(campaignChannelReads).where(eq(campaignChannelReads.campaignId, B))).toHaveLength(0);
    expect(await countPosts(A)).toBe(aBefore);
  });
});
