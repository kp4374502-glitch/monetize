import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/client";
import {
  campaigns,
  campaignBrands,
  campaignChannelPosts,
  campaignChannelReads,
  campaignCreators,
  campaignMods,
  platformAdmins,
  clipReviewEvents,
  clips,
  inviteLinks,
  notifications,
  users,
} from "../../drizzle/schema";
import { getRoleForCampaign, isPlatformAdmin, isPlatformOwner, requireRole } from "../auth/roles";
import { isApprovedBrand } from "../brand/service";
import { campaignDetailsSchema, createCampaignSchema, eligiblePlatformsSchema, payoutSettingsSchema, updateCampaignSchema } from "./schemas";

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

/**
 * Owner/Admin: rename the campaign and/or its brand. Only these two columns change; payout settings,
 * platforms and status are untouched (they have their own controls).
 */
export async function updateCampaignDetails(actorId: string, campaignId: string, input: unknown) {
  await requireRole(actorId, campaignId, "admin");
  const { brandName, name } = campaignDetailsSchema.parse(input);
  const [row] = await db
    .update(campaigns)
    .set({ brandName, name })
    .where(eq(campaigns.id, campaignId))
    .returning({ id: campaigns.id, brandName: campaigns.brandName, name: campaigns.name });
  return row;
}

export type PayTerm = "baseRate" | "divisor" | "maxPayPerPost" | "viewMinimum";

/**
 * Owner/Admin: edit a live campaign's pay terms and limits. Pay terms (base rate, divisor, max pay per
 * post, view minimum) apply going forward only: every post already in the campaign is first pinned to
 * the value it was submitted under (its clips.*_override), unless it already has its own pin (e.g. the
 * Hair u rate change), so nothing already submitted re-prices. Total budget and the daily submission
 * limit apply immediately; the budget may be set to any non-negative amount, even below what's been
 * paid. Name, brand, platforms and status are untouched (they have their own controls).
 */
export async function updatePayoutSettings(actorId: string, campaignId: string, input: unknown) {
  await requireRole(actorId, campaignId, "admin");
  const data = payoutSettingsSchema.parse(input);

  return db.transaction(async (tx) => {
    // Locked so two concurrent edits can't each pin against a value the other is replacing.
    const [c] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).for("update");
    if (!c) throw new Error("Campaign not found.");

    // Compare as stored: the columns round (base rate/divisor to 4 decimals, money to 2).
    const changed: PayTerm[] = [];
    if (Number(c.baseRate) !== Number(data.baseRate.toFixed(4))) changed.push("baseRate");
    if (Number(c.divisor) !== Number(data.divisor.toFixed(4))) changed.push("divisor");
    if (Number(c.maxPayPerPost) !== Number(data.maxPayPerPost.toFixed(2))) changed.push("maxPayPerPost");
    if (c.viewMinimum !== data.viewMinimum) changed.push("viewMinimum");

    let pinnedPosts = 0;
    if (changed.length) {
      const pins = {
        ...(changed.includes("baseRate") && { baseRateOverride: sql`coalesce(${clips.baseRateOverride}, ${c.baseRate})` }),
        ...(changed.includes("divisor") && { divisorOverride: sql`coalesce(${clips.divisorOverride}, ${c.divisor})` }),
        ...(changed.includes("maxPayPerPost") && {
          maxPayPerPostOverride: sql`coalesce(${clips.maxPayPerPostOverride}, ${c.maxPayPerPost})`,
        }),
        ...(changed.includes("viewMinimum") && { viewMinimumOverride: sql`coalesce(${clips.viewMinimumOverride}, ${c.viewMinimum})` }),
      };
      // Every post already in THIS campaign, paid or deleted included, so the rule holds if one is ever restored or un-paid.
      const pinned = await tx.update(clips).set(pins).where(eq(clips.campaignId, campaignId)).returning({ id: clips.id });
      pinnedPosts = pinned.length;
    }

    const [row] = await tx
      .update(campaigns)
      .set({
        baseRate: String(data.baseRate),
        divisor: String(data.divisor),
        maxPayPerPost: String(data.maxPayPerPost),
        viewMinimum: data.viewMinimum,
        totalBudget: String(data.totalBudget),
        dailySubmissionLimit: data.dailySubmissionLimit,
      })
      .where(eq(campaigns.id, campaignId))
      .returning();
    return { campaign: row, changedPayTerms: changed, pinnedPosts };
  });
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
/**
 * Owner/Admin. Hides the campaign from creators (they lose all access; their membership and posts are kept)
 * while the Owner, Admins, Mods and Brand viewers still see it. Reversible: reopenCampaign ("Unarchive").
 */
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
    await tx.delete(campaignChannelReads).where(eq(campaignChannelReads.campaignId, campaignId));
    await tx.delete(campaignChannelPosts).where(eq(campaignChannelPosts.campaignId, campaignId));
    await tx.delete(clips).where(eq(clips.campaignId, campaignId));
    await tx.delete(campaignCreators).where(eq(campaignCreators.campaignId, campaignId));
    await tx.delete(campaignMods).where(eq(campaignMods.campaignId, campaignId));
    await tx.delete(campaignBrands).where(eq(campaignBrands.campaignId, campaignId));
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

// ---------------------------------------------------------------------------------------------
// Brand (read-only per-campaign viewer) -- added directly by username like a Mod, not via invite
// link, and Owner/Admin only (same authority spec gives for adding a Mod). One campaign at a time,
// enforced by campaign_brands' unique(user_id), same shape as campaign_mods.
// ---------------------------------------------------------------------------------------------

/**
 * Owner/Admin: which platforms this campaign accepts posts from. Only affects NEW submissions; posts
 * already submitted from a platform that is switched off stay exactly as they are.
 */
export async function setEligiblePlatforms(actorId: string, campaignId: string, platforms: unknown) {
  await requireRole(actorId, campaignId, "admin");
  const list = [...new Set(eligiblePlatformsSchema.parse(platforms))];
  await db.update(campaigns).set({ eligiblePlatforms: list }).where(eq(campaigns.id, campaignId));
  return list;
}

const isUniqueViolation = (e: unknown) =>
  String((e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code) === "23505";

/**
 * Finds the person a Mod/Brand assignment is for, by username. They must have signed up and signed in
 * once (that's what creates their users row). Owner/Admin already see every campaign, so assigning them
 * a campaign-scoped role would be meaningless and is refused.
 */
async function resolveAssignee(username: string) {
  const name = username.trim();
  if (!name) throw new Error("Enter a username.");
  const [user] = await db
    .select({ id: users.id, username: users.username, isPlatformOwner: users.isPlatformOwner })
    .from(users)
    .where(eq(users.username, name))
    .limit(1);
  if (!user) throw new Error(`No user with username "${name}". They need to sign up and sign in once first.`);
  if (user.isPlatformOwner || (await isPlatformAdmin(user.id))) {
    throw new Error(`${user.username} is already an Owner/Admin and has access to every campaign.`);
  }
  return user;
}

/** Brand viewer: read-only, one campaign at a time. Owner/Admin assign. */
export async function addBrand(actorId: string, campaignId: string, username: string) {
  await requireRole(actorId, campaignId, "admin");
  const user = await resolveAssignee(username);
  const [alsoMod] = await db
    .select({ id: campaignMods.id })
    .from(campaignMods)
    .where(and(eq(campaignMods.campaignId, campaignId), eq(campaignMods.userId, user.id)))
    .limit(1);
  if (alsoMod) throw new Error(`${user.username} is a Mod/CPE on this campaign. Remove that first.`);
  try {
    const [row] = await db.insert(campaignBrands).values({ campaignId, userId: user.id, addedBy: actorId }).returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error("That user is already the Brand viewer on a campaign (one campaign at a time).");
    }
    throw e;
  }
}

/**
 * Mod/CPE: reviews posts on this one campaign (one campaign at a time) but can never mark paid, delete,
 * Post Approve or change settings. Owner/Admin assign.
 */
export async function addMod(actorId: string, campaignId: string, username: string) {
  await requireRole(actorId, campaignId, "admin");
  const user = await resolveAssignee(username);
  const [alsoBrand] = await db
    .select({ id: campaignBrands.id })
    .from(campaignBrands)
    .where(and(eq(campaignBrands.campaignId, campaignId), eq(campaignBrands.userId, user.id)))
    .limit(1);
  if (alsoBrand) throw new Error(`${user.username} is a Brand viewer on this campaign. Remove that first.`);
  try {
    const [row] = await db.insert(campaignMods).values({ campaignId, userId: user.id, addedBy: actorId }).returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error("That user is already a Mod/CPE on a campaign (one campaign at a time).");
    }
    throw e;
  }
}

export async function removeMod(actorId: string, campaignId: string, modRowId: string) {
  await requireRole(actorId, campaignId, "admin");
  await db.delete(campaignMods).where(and(eq(campaignMods.id, modRowId), eq(campaignMods.campaignId, campaignId)));
}

export async function listMods(actorId: string, campaignId: string) {
  await requireRole(actorId, campaignId, "admin");
  return db
    .select({ id: campaignMods.id, username: users.username, createdAt: campaignMods.createdAt })
    .from(campaignMods)
    .innerJoin(users, eq(users.id, campaignMods.userId))
    .where(eq(campaignMods.campaignId, campaignId))
    .orderBy(asc(users.username));
}

/**
 * Usernames the Owner/Admin can pick from when assigning a Mod/CPE or Brand viewer on this campaign:
 * everyone who has signed up, minus the Owner, Admins, and people already holding one of those two
 * roles here. (A person already on another campaign is still listed; the one-campaign rule explains itself on add.)
 */
export async function listAssignableUsernames(actorId: string, campaignId: string, limit = 1000) {
  await requireRole(actorId, campaignId, "admin");
  const exclude = new Set<string>();
  for (const r of await db.select({ id: platformAdmins.userId }).from(platformAdmins)) exclude.add(r.id);
  for (const r of await db.select({ id: campaignMods.userId }).from(campaignMods).where(eq(campaignMods.campaignId, campaignId))) exclude.add(r.id);
  for (const r of await db.select({ id: campaignBrands.userId }).from(campaignBrands).where(eq(campaignBrands.campaignId, campaignId))) exclude.add(r.id);
  const notOwner = eq(users.isPlatformOwner, false);
  const ids = [...exclude];
  const rows = await db
    .select({ username: users.username })
    .from(users)
    .where(ids.length ? and(notOwner, notInArray(users.id, ids)) : notOwner)
    .orderBy(asc(users.username))
    .limit(limit);
  return rows.map((r) => r.username);
}

export async function removeBrand(actorId: string, campaignId: string, brandRowId: string) {
  await requireRole(actorId, campaignId, "admin");
  await db.delete(campaignBrands).where(and(eq(campaignBrands.id, brandRowId), eq(campaignBrands.campaignId, campaignId)));
}

export async function listBrands(actorId: string, campaignId: string) {
  await requireRole(actorId, campaignId, "admin");
  return db
    .select({ id: campaignBrands.id, username: users.username, createdAt: campaignBrands.createdAt })
    .from(campaignBrands)
    .innerJoin(users, eq(users.id, campaignBrands.userId))
    .where(eq(campaignBrands.campaignId, campaignId));
}

export type InviteLookup =
  | { ok: true; link: typeof inviteLinks.$inferSelect; campaign: { id: string; name: string; brandName: string; status: string } }
  | { ok: false; reason: "not_found" | "revoked" };

export async function lookupInvite(code: string): Promise<InviteLookup> {
  const [row] = await db
    .select({
      link: inviteLinks,
      campaign: { id: campaigns.id, name: campaigns.name, brandName: campaigns.brandName, status: campaigns.status },
    })
    .from(inviteLinks)
    .innerJoin(campaigns, eq(campaigns.id, inviteLinks.campaignId))
    .where(eq(inviteLinks.code, code))
    .limit(1);
  // An archived campaign is hidden from everyone but its team, so its invite link behaves as if it didn't exist
  // (no joining, and the campaign's name is not revealed to the person holding the link).
  if (!row || row.campaign.status === "archived") return { ok: false, reason: "not_found" };
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

/**
 * The creator-facing directory of joinable campaigns (/explore): every ACTIVE campaign, with whether the
 * caller already joined it. Exposes only what a creator needs to choose (names + platforms) — never
 * budgets, rates or other campaigns' creators/clips.
 */
export async function listActiveCampaigns(userId: string) {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      brandName: campaigns.brandName,
      eligiblePlatforms: campaigns.eligiblePlatforms,
    })
    .from(campaigns)
    .where(eq(campaigns.status, "active"))
    .orderBy(campaigns.name);
  if (rows.length === 0) return [];
  const joined = await db
    .select({ campaignId: campaignCreators.campaignId })
    .from(campaignCreators)
    .where(and(eq(campaignCreators.userId, userId), inArray(campaignCreators.campaignId, rows.map((r) => r.id))));
  const joinedIds = new Set(joined.map((j) => j.campaignId));
  return rows.map((r) => ({ ...r, joined: joinedIds.has(r.id) }));
}

/**
 * One-click join from /explore — the self-serve equivalent of opening the campaign's invite link, so it
 * lands in the same campaign_creators row (invite_link_id null). Only ACTIVE campaigns can be joined, and
 * the same ON CONFLICT DO NOTHING keeps a repeat click (or a previously suspended creator) unchanged.
 */
export async function joinActiveCampaign(userId: string, campaignId: string) {
  const [campaign] = await db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign || campaign.status !== "active") throw new Error("This campaign isn't open for new creators.");
  await db
    .insert(campaignCreators)
    .values({ campaignId: campaign.id, userId })
    .onConflictDoNothing({ target: [campaignCreators.campaignId, campaignCreators.userId] });
  return campaign;
}
