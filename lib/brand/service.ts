import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { brandRequests, users } from "../../drizzle/schema";
import { isPlatformOwner } from "../auth/roles";

/**
 * Brand requests are platform-level (not campaign data): a queue the platform Owner reviews by hand.
 * Approval grants no authority by itself — see the note on the brand_requests table.
 */

export const brandRequestSchema = z.object({
  brandName: z.string().trim().min(1, "Brand name is required").max(100),
  discord: z.string().trim().min(1, "A Discord handle is required so we can reach you").max(100),
  note: z.string().trim().max(1000).optional(),
});

async function requirePlatformOwner(actorId: string) {
  if (!(await isPlatformOwner(actorId))) throw new Error("Access denied: only the platform Owner can do this.");
}

/** One request per user; a repeat submission returns the existing one instead of creating another. */
export async function submitBrandRequest(userId: string, input: unknown) {
  const data = brandRequestSchema.parse(input);
  const [created] = await db
    .insert(brandRequests)
    .values({ userId, brandName: data.brandName, discord: data.discord, note: data.note || null })
    .onConflictDoNothing({ target: brandRequests.userId })
    .returning();
  if (created) return { created: true, request: created };
  const [existing] = await db.select().from(brandRequests).where(eq(brandRequests.userId, userId));
  return { created: false, request: existing };
}

export async function getBrandRequestForUser(userId: string) {
  const [r] = await db.select().from(brandRequests).where(eq(brandRequests.userId, userId)).limit(1);
  return r ?? null;
}

/** Platform Owner only. Pending first, then newest. */
export async function listBrandRequests(actorId: string) {
  await requirePlatformOwner(actorId);
  return db
    .select({ request: brandRequests, username: users.username })
    .from(brandRequests)
    .innerJoin(users, eq(users.id, brandRequests.userId))
    .orderBy(sql`case ${brandRequests.status} when 'pending' then 0 else 1 end`, desc(brandRequests.createdAt));
}

export async function countPendingBrandRequests(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(brandRequests)
    .where(eq(brandRequests.status, "pending"));
  return r?.n ?? 0;
}

/** Platform Owner only. Can be changed later (approved <-> rejected). */
export async function reviewBrandRequest(actorId: string, requestId: string, decision: "approved" | "rejected") {
  await requirePlatformOwner(actorId);
  const [row] = await db
    .update(brandRequests)
    .set({ status: decision, reviewedBy: actorId, reviewedAt: new Date() })
    .where(eq(brandRequests.id, requestId))
    .returning();
  if (!row) throw new Error("Brand request not found.");
  return row;
}

/** Approved brands the Owner can assign as a campaign's owner. Platform Owner only. */
export async function listApprovedBrands(actorId: string) {
  await requirePlatformOwner(actorId);
  return db
    .select({ userId: brandRequests.userId, brandName: brandRequests.brandName, username: users.username })
    .from(brandRequests)
    .innerJoin(users, eq(users.id, brandRequests.userId))
    .where(eq(brandRequests.status, "approved"))
    .orderBy(asc(brandRequests.brandName));
}

export async function isApprovedBrand(userId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: brandRequests.id })
    .from(brandRequests)
    .where(and(eq(brandRequests.userId, userId), eq(brandRequests.status, "approved")))
    .limit(1);
  return !!r;
}
