import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { campaigns, campaignCreators, campaignMods, platformAdmins, users } from "../../drizzle/schema";

/**
 * Every function in this file is the single choke point for "can this user see/do this in this
 * campaign?" per docs/PRODUCT_SPEC.md -> "Roles & permissions". No Server Action or query touching
 * campaign-scoped data should bypass this layer — see CLAUDE.md's non-negotiable architectural rule.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

export type Role = "owner" | "admin" | "mod" | "creator" | null;

export async function isPlatformOwner(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isPlatformOwner: users.isPlatformOwner })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.isPlatformOwner ?? false;
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, userId))
    .limit(1);
  return !!row;
}

/**
 * Resolves a user's role WITHIN a specific campaign.
 *   - Platform Owner (users.is_platform_owner) -> "owner" on every campaign
 *   - campaign Owner (campaigns.owner_user_id) -> "owner"
 *   - platform_admins membership       -> "admin"  (implicit on every campaign, no row needed)
 *   - campaign_mods row for this campaign -> "mod"
 *   - campaign_creators row for this campaign -> "creator"
 *   - none of the above                -> null (no access)
 */
export async function getRoleForCampaign(userId: string, campaignId: string): Promise<Role> {
  if (!isUuid(campaignId)) return null;
  const [campaign] = await db
    .select({ ownerUserId: campaigns.ownerUserId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return null;

  if (campaign.ownerUserId === userId || (await isPlatformOwner(userId))) return "owner";
  if (await isPlatformAdmin(userId)) return "admin";

  const [modRow] = await db
    .select()
    .from(campaignMods)
    .where(and(eq(campaignMods.campaignId, campaignId), eq(campaignMods.userId, userId)))
    .limit(1);
  if (modRow) return "mod";

  const [creatorRow] = await db
    .select()
    .from(campaignCreators)
    .where(and(eq(campaignCreators.campaignId, campaignId), eq(campaignCreators.userId, userId)))
    .limit(1);
  if (creatorRow) return "creator";

  return null;
}

/**
 * Throws if `userId` does not hold at least `minimumRole` on `campaignId`.
 * Role ranking: owner > admin > mod > creator. Use this at the top of every Server Action.
 */
const ROLE_RANK: Record<Exclude<Role, null>, number> = {
  owner: 3,
  admin: 3, // Admin is a strict superset of Mod but ranks alongside Owner for most checks;
  // actions that are literally Owner-only (create campaign, approve new brand) must check
  // `role === "owner"` explicitly rather than relying on rank alone.
  mod: 1,
  creator: 0,
};

export async function requireRole(
  userId: string,
  campaignId: string,
  minimumRole: Exclude<Role, null>,
): Promise<Exclude<Role, null>> {
  const role = await getRoleForCampaign(userId, campaignId);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
    throw new Error(
      `Access denied: user ${userId} does not have ${minimumRole}+ access to campaign ${campaignId}.`,
    );
  }
  return role;
}

/**
 * Fetches a campaign row, but ONLY if `userId` has some role on it. Never fetch a campaign by id
 * alone in a Server Action — always go through this so Campaign A can't leak into a Campaign B
 * view. Returns null rather than throwing, since "not found" and "not yours" should look the same
 * to the caller (don't leak existence of campaigns the user can't access).
 */
export async function getCampaignForUser(userId: string, campaignId: string) {
  const role = await getRoleForCampaign(userId, campaignId);
  if (!role) return null;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  return campaign ?? null;
}

/**
 * Every campaign the user holds a role on, with that role — powers the campaign switcher.
 * Platform Owner and platform Admins see all campaigns (roles apply implicitly everywhere); a Mod
 * sees the campaign they are assigned to; a Creator sees campaigns they have joined. A user can
 * hold different roles in different campaigns (e.g. Mod on one, Creator on another).
 */
export async function getCampaignsForUser(userId: string) {
  const cols = { id: campaigns.id, name: campaigns.name, brandName: campaigns.brandName, status: campaigns.status };

  if ((await isPlatformOwner(userId)) || (await isPlatformAdmin(userId))) {
    const role: Role = (await isPlatformOwner(userId)) ? "owner" : "admin";
    const rows = await db.select(cols).from(campaigns).orderBy(asc(campaigns.name));
    return rows.map((c) => ({ ...c, role }));
  }

  const found = new Map<string, { id: string; name: string; brandName: string; status: string; role: Role }>();

  const owned = await db.select(cols).from(campaigns).where(eq(campaigns.ownerUserId, userId));
  for (const c of owned) found.set(c.id, { ...c, role: "owner" });

  const modded = await db
    .select(cols)
    .from(campaignMods)
    .innerJoin(campaigns, eq(campaigns.id, campaignMods.campaignId))
    .where(eq(campaignMods.userId, userId));
  for (const c of modded) if (!found.has(c.id)) found.set(c.id, { ...c, role: "mod" });

  const joined = await db
    .select(cols)
    .from(campaignCreators)
    .innerJoin(campaigns, eq(campaigns.id, campaignCreators.campaignId))
    .where(eq(campaignCreators.userId, userId));
  for (const c of joined) if (!found.has(c.id)) found.set(c.id, { ...c, role: "creator" });

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
