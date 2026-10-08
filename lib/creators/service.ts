import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { campaignCreators, creatorProfiles, users } from "../../drizzle/schema";
import { requireRole } from "../auth/roles";
import { creatorProfileSchema } from "./schemas";

/**
 * Self-serve creator onboarding (/sign-up -> /onboarding). A profile is the user's own record, never
 * campaign data, so every function here acts on exactly the caller's row (userId comes from the session).
 */

export async function getCreatorProfile(userId: string) {
  const [row] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * Saves the onboarding answers. Re-saving (e.g. after pressing Back from the Discord step) overwrites
 * them but never un-completes a finished onboarding or forgets the Discord click.
 */
export async function saveCreatorProfile(userId: string, input: unknown) {
  const data = creatorProfileSchema.parse(input);
  const values = {
    firstName: data.firstName,
    lastName: data.lastName,
    birthday: data.birthday,
    gender: data.gender,
    country: data.country,
    phoneCountryCode: data.phoneCountryCode,
    phoneNumber: data.phoneNumber,
    discordUsername: data.discordUsername,
    creatorType: data.creatorType,
    socials: data.socials,
    showcaseUrls: data.showcaseUrls.filter(Boolean),
    termsAcceptedAt: new Date(),
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(creatorProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: creatorProfiles.userId, set: values })
    .returning();
  return row;
}

/**
 * Owner/Admin only: one creator's onboarding form details (username + Discord username + everything
 * else they filled in), for a creator who is a member of THIS campaign. A profile is the person's own
 * record, but this VIEW is campaign-scoped: it reaches the profile only through campaign_creators, so
 * an admin can't pull up someone who isn't on this campaign. Mods never see it (phone, birthday).
 * Returns null if they aren't a member; "profile" is null for accounts with no form on file (they
 * joined by invite link before self-serve sign-up existed).
 */
export async function getCreatorDetailsForAdmin(actorId: string, campaignId: string, creatorId: string) {
  await requireRole(actorId, campaignId, "admin");
  const [row] = await db
    .select({
      userId: campaignCreators.userId,
      username: users.username,
      joinedAt: campaignCreators.joinedAt,
      suspended: campaignCreators.suspended,
      profile: creatorProfiles,
    })
    .from(campaignCreators)
    .innerJoin(users, eq(users.id, campaignCreators.userId))
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, campaignCreators.userId))
    .where(and(eq(campaignCreators.campaignId, campaignId), eq(campaignCreators.userId, creatorId)))
    .limit(1);
  return row ?? null;
}

/** "Join Community" was clicked. The app can't see Discord, so this records the click, not membership. */
export async function recordDiscordJoinClick(userId: string) {
  const [row] = await db
    .update(creatorProfiles)
    .set({ discordJoinClickedAt: new Date(), updatedAt: new Date() })
    .where(eq(creatorProfiles.userId, userId))
    .returning();
  if (!row) throw new Error("Finish your profile before joining the community.");
  return row;
}

/** The final Next: only allowed once the profile is saved AND Join Community has been clicked. */
export async function completeOnboarding(userId: string) {
  const profile = await getCreatorProfile(userId);
  if (!profile) throw new Error("Finish your profile first.");
  if (!profile.discordJoinClickedAt) throw new Error("Join our Discord community to continue.");
  if (profile.onboardingCompletedAt) return profile;
  const [row] = await db
    .update(creatorProfiles)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(creatorProfiles.userId, userId))
    .returning();
  return row;
}
