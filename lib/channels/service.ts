import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { campaignChannelPosts, campaignChannelReads, campaignCreators, campaigns, notifications } from "../../drizzle/schema";
import { getRoleForCampaign, requireRole } from "../auth/roles";
import { ANNOUNCEMENTS_CHANNEL, CHANNEL_IDS, channelPostBodySchema, channelPostSchema } from "./schemas";

/**
 * Campaign channels (the right-hand panel on a campaign page). Every query filters by campaign_id.
 * Read: creators and Mods on the campaign, plus Admin/Owner. Never Brand. Write: Owner/Admin only.
 */

const POSTS_LIMIT = 300;

async function requireReader(userId: string, campaignId: string) {
  const role = await getRoleForCampaign(userId, campaignId);
  if (!role || role === "brand") throw new Error("Access denied: you can't view this campaign's channels.");
  return role;
}

/**
 * All nine channels for the panel, each with its posts (newest first) and how many are new to THIS
 * viewer: posts by someone else, created after they last opened the channel.
 */
export async function getCampaignChannels(userId: string, campaignId: string) {
  const role = await requireReader(userId, campaignId);
  const posts = await db
    .select()
    .from(campaignChannelPosts)
    .where(eq(campaignChannelPosts.campaignId, campaignId))
    .orderBy(desc(campaignChannelPosts.createdAt))
    .limit(POSTS_LIMIT);
  const reads = await db
    .select()
    .from(campaignChannelReads)
    .where(and(eq(campaignChannelReads.userId, userId), eq(campaignChannelReads.campaignId, campaignId)));
  const lastRead = new Map(reads.map((r) => [r.channel, r.lastReadAt]));

  return {
    canPost: role === "owner" || role === "admin",
    channels: CHANNEL_IDS.map((id) => {
      const mine = posts.filter((p) => p.channel === id);
      const seen = lastRead.get(id);
      const unread = mine.filter((p) => p.authorUserId !== userId && (!seen || p.createdAt > seen)).length;
      return {
        id,
        unread,
        posts: mine.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          links: p.links,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      };
    }),
  };
}

/** Owner/Admin: post to a channel. A post in announcements also lands on every creator's bell. */
export async function createChannelPost(actorId: string, campaignId: string, input: unknown) {
  await requireRole(actorId, campaignId, "admin");
  const data = channelPostSchema.parse(input);
  const [campaign] = await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error("Campaign not found.");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(campaignChannelPosts)
      .values({ campaignId, channel: data.channel, title: data.title, body: data.body, links: data.links, authorUserId: actorId })
      .returning();

    if (data.channel === ANNOUNCEMENTS_CHANNEL) {
      const members = await tx
        .select({ userId: campaignCreators.userId })
        .from(campaignCreators)
        .where(and(eq(campaignCreators.campaignId, campaignId), ne(campaignCreators.userId, actorId)));
      if (members.length) {
        await tx.insert(notifications).values(
          members.map((m) => ({
            userId: m.userId,
            campaignId,
            type: "announcement" as const,
            message: `New announcement in ${campaign.name}: ${data.title}`,
          })),
        );
      }
    }
    return row;
  });
}

/** Owner/Admin: edit a post's title, message and links. The channel stays put, and editing never re-notifies. */
export async function updateChannelPost(actorId: string, campaignId: string, postId: string, input: unknown) {
  await requireRole(actorId, campaignId, "admin");
  const data = channelPostBodySchema.parse(input);
  const [row] = await db
    .update(campaignChannelPosts)
    .set({ title: data.title, body: data.body, links: data.links, updatedAt: new Date() })
    .where(and(eq(campaignChannelPosts.id, postId), eq(campaignChannelPosts.campaignId, campaignId)))
    .returning();
  if (!row) throw new Error("Post not found.");
  return row;
}

/** Owner/Admin: remove a post. */
export async function deleteChannelPost(actorId: string, campaignId: string, postId: string) {
  await requireRole(actorId, campaignId, "admin");
  const removed = await db
    .delete(campaignChannelPosts)
    .where(and(eq(campaignChannelPosts.id, postId), eq(campaignChannelPosts.campaignId, campaignId)))
    .returning({ id: campaignChannelPosts.id });
  if (!removed.length) throw new Error("Post not found.");
}

/** The viewer opened a channel: clears its "new" count for them only. */
export async function markChannelRead(userId: string, campaignId: string, channel: unknown) {
  await requireReader(userId, campaignId);
  const id = z.enum(CHANNEL_IDS).parse(channel);
  const now = new Date();
  await db
    .insert(campaignChannelReads)
    .values({ campaignId, userId, channel: id, lastReadAt: now })
    .onConflictDoUpdate({
      target: [campaignChannelReads.userId, campaignChannelReads.campaignId, campaignChannelReads.channel],
      set: { lastReadAt: now },
    });
}
