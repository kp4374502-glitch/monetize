import { and, asc, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { platformAdmins, users } from "../../drizzle/schema";
import { isPlatformOwner } from "../auth/roles";

/**
 * Platform-wide Admins. Strictly the platform Owner's call, not even another Admin's: an Admin sees
 * and can act on every campaign, so who becomes one is the most sensitive role decision in the app.
 * (Campaign-scoped Mods and Brand viewers are assigned by Owner/Admin in lib/campaigns/service.ts.)
 */

async function requirePlatformOwner(actorId: string) {
  if (!(await isPlatformOwner(actorId))) throw new Error("Access denied: only the platform Owner can manage Admins.");
}

/** Current Admins, for the Owner's team page. */
export async function listPlatformAdmins(actorId: string) {
  await requirePlatformOwner(actorId);
  return db
    .select({ userId: platformAdmins.userId, username: users.username })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .orderBy(asc(users.username));
}

/** Everyone who has signed up and isn't already the Owner or an Admin: the pool the Owner picks Admins from. */
export async function listAdminCandidates(actorId: string, limit = 1000) {
  await requirePlatformOwner(actorId);
  const adminIds = (await db.select({ userId: platformAdmins.userId }).from(platformAdmins)).map((a) => a.userId);
  const notOwner = eq(users.isPlatformOwner, false);
  const rows = await db
    .select({ username: users.username })
    .from(users)
    .where(adminIds.length ? and(notOwner, notInArray(users.id, adminIds)) : notOwner)
    .orderBy(asc(users.username))
    .limit(limit);
  return rows.map((r) => r.username);
}

export async function addPlatformAdmin(actorId: string, username: string) {
  await requirePlatformOwner(actorId);
  const name = username.trim();
  if (!name) throw new Error("Enter a username.");
  const [user] = await db
    .select({ id: users.id, username: users.username, isPlatformOwner: users.isPlatformOwner })
    .from(users)
    .where(eq(users.username, name))
    .limit(1);
  if (!user) throw new Error(`No user with username "${name}". They need to sign up and sign in once first.`);
  if (user.isPlatformOwner) throw new Error("That account is the platform Owner already.");
  await db.insert(platformAdmins).values({ userId: user.id }).onConflictDoNothing({ target: platformAdmins.userId });
  return user;
}

export async function removePlatformAdmin(actorId: string, userId: string) {
  await requirePlatformOwner(actorId);
  const removed = await db.delete(platformAdmins).where(eq(platformAdmins.userId, userId)).returning({ userId: platformAdmins.userId });
  if (!removed.length) throw new Error("That person isn't an Admin.");
}
