import { and, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/client";
import {
  campaigns,
  campaignCreators,
  campaignMods,
  clipReviewEvents,
  clips,
  inviteLinks,
  notifications,
} from "../../drizzle/schema";
import { getRoleForCampaign, isPlatformOwner, requireRole } from "../auth/roles";
import { isApprovedBrand } from "../brand/service";
import { createCampaignSchema, updateCampaignSchema } from "./schemas";

/**
 * Tenant-scoped campaign operations. Every function takes the acting user explicitly and checks
 * the role BEFORE touching data; every query on campaign-scoped tables filters by campaign_id.
 */

const toDb = (i: ReturnType<typeof createCampaignSchema.parse>) => ({
  brandName: i.brandName,
  name: i.name,
  baseRate: String(i.baseRate),
  divisor: String(i.divisor),
  maxPayPerPost: String(i.maxPayPerPost),
  viewMinimum: i.viewMinimum,
  totalBudget: String(i.totalBudget),
  modMarkPaidThreshold: String(i.modMarkPaidThreshold),
  dailySubmissionLimit: i.dailySubmissionLimit,
  eligiblePlatforms: i.eligiblePlatforms,
});

/**
 * Strictly platform-Owner-only — not even Admin. By default the caller owns the campaign; pass an
 * APPROVED brand's user id to assign them as the campaign's owner instead (ownership is transferable
 * per the spec). The platform Owner keeps owner authority on every campaign either way.
 */
export async function createCampaign(actorId: string, input: unknown, brandOwnerUserId?: string | null) {
  if (!(await isPlatformOwner(actorId))) {
    throw new Error("Access denied: only the platform Owner can create campaigns.");
  }
  const data = createCampaignSchema.parse(input);
  if (brandOwnerUserId && !(await isApprovedBrand(brandOwnerUserId))) {
    throw new Error("That brand hasn't been approved, so it can't be assigned as a campaign owner.");
  }
  const [row] = await db
    .insert(campaigns)
    .values({ ...toDb(data), ownerUserId: brandOwnerUserId || actorId })
    .returning();
  return row;
}

/**
 * Applies going forward only. Nothing here recalculates already-approved clips' cached
 * cpm/earnings/payout — later tasks must keep it that way.
 */
export async function updateCampaignSettings(actorId: string, campaignId: string, input: unknown) {
  await requireRole(actorId, campaignId, "admin");
  const data = updateCampaignSchema.parse(input);
  const [row] = await db.update(campaigns).set(toDb(data)).where(eq(campaigns.id, campaignId)).returning();
  return row;
}

async function setStatus(
  actorId: string,
  campaignId: string,
  status: "active" | "paused" | "closed" | "archived",
) {
  await requireRole(actorId, campaignId, "admin");
  const [row] = await db
    .update(campaigns)
    .set({ status, closedAt: status === "closed" || status === "archived" ? new Date() : null })
    .where(eq(campaigns.id, campaignId))
    .returning();
  return row;
}

export const pauseCampaign = (actor: string, id: string) => setStatus(actor, id, "paused");
export const closeCampaign = (actor: string, id: string) => setStatus(actor, id, "closed");
export const archiveCampaign = (actor: string, id: string) => setStatus(actor, id, "archived");
export const reopenCampaign = (actor: string, id: string) => setStatus(actor, id, "active");

/** Owner-only (platform Owner or this campaign's owner) — Admin is explicitly NOT allowed. */
export async function deleteCampaign(actorId: string, campaignId: string) {
  const role = await getRoleForCampaign(actorId, campaignId);
  if (role !== "owner") {
    throw new Error("Access denied: only an Owner can delete a campaign.");
  }
  await db.transaction(async (tx) => {
    const clipIds = (
      await tx.select({ id: clips.id }).from(clips).where(eq(clips.campaignId, campaignId))
    ).map((c) => c.id);
    if (clipIds.length) {
      await tx.delete(clipReviewEvents).where(inArray(clipReviewEvents.clipId, clipIds));
    }
    await tx.delete(notifications).where(eq(notifications.campaignId, campaignId));
    await tx.delete(clips).where(eq(clips.campaignId, campaignId));
    await tx.delete(campaignCreators).where(eq(campaignCreators.campaignId, campaignId));
    await tx.delete(campaignMods).where(eq(campaignMods.campaignId, campaignId));
    await tx.delete(inviteLinks).where(eq(inviteLinks.campaignId, campaignId));
    await tx.delete(campaigns).where(eq(campaigns.id, campaignId));
  });
}

/** Owner, Admin or Mod. */
export async function generateInviteLink(actorId: string, campaignId: string) {
  await requireRole(actorId, campaignId, "mod");
  const [row] = await db
    .insert(inviteLinks)
    .values({ campaignId, code: randomBytes(16).toString("base64url"), createdBy: actorId })
    .returning();
  return row;
}

/** Soft-revoke (audit trail kept). Scoped by campaign so a link id from another campaign is a no-op. */
export async function revokeInviteLink(actorId: string, campaignId: string, linkId: string) {
  await requireRole(actorId, campaignId, "mod");
  const [row] = await db
    .update(inviteLinks)
    .set({ revoked: true })
    .where(and(eq(inviteLinks.id, linkId), eq(inviteLinks.campaignId, campaignId)))
    .returning();
  if (!row) throw new Error("Invite link not found for this campaign.");
  return row;
}

export async function listInviteLinks(actorId: string, campaignId: string) {
  await requireRole(actorId, campaignId, "mod");
  return db.select().from(inviteLinks).where(eq(inviteLinks.campaignId, campaignId));
}

export type InviteLookup =
  | { ok: true; link: typeof inviteLinks.$inferSelect; campaign: { id: string; name: string; brandName: string } }
  | { ok: false; reason: "not_found" | "revoked" };

export async function lookupInvite(code: string): Promise<InviteLookup> {
  const [row] = await db
    .select({
      link: inviteLinks,
      campaign: { id: campaigns.id, name: campaigns.name, brandName: campaigns.brandName },
    })
    .from(inviteLinks)
    .innerJoin(campaigns, eq(campaigns.id, inviteLinks.campaignId))
    .where(eq(inviteLinks.code, code))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.link.revoked) return { ok: false, reason: "revoked" };
  return { ok: true, ...row };
}

/**
 * Reusable link: never consumed. The unique(campaign_id, user_id) constraint plus
 * ON CONFLICT DO NOTHING makes concurrent redemption by the same user create exactly one row.
 */
export async function redeemInvite(userId: string, code: string) {
  const found = await lookupInvite(code);
  if (!found.ok) {
    throw new Error(found.reason === "revoked" ? "This invite link has been revoked." : "Invite link not found.");
  }
  await db
    .insert(campaignCreators)
    .values({ campaignId: found.campaign.id, userId, inviteLinkId: found.link.id })
    .onConflictDoNothing({ target: [campaignCreators.campaignId, campaignCreators.userId] });
  return found.campaign;
}
