import { and, desc, eq, isNull, lte, ne } from "drizzle-orm";
import { db } from "./db/client";
import { campaignMods, campaigns, clips, notifications } from "../drizzle/schema";

type Executor = Pick<typeof db, "insert">;
type NotificationType = typeof notifications.$inferInsert["type"];

export async function notify(
  tx: Executor,
  n: { userId: string; campaignId: string; clipId?: string; type: NotificationType; message: string },
) {
  await tx.insert(notifications).values(n);
}

/** A user's own unread notifications only. */
export async function listNotifications(userId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Scoped by user_id so nobody can dismiss someone else's notification. */
export async function markNotificationRead(userId: string, notificationId: string) {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export const PROOF_REMINDER_AFTER_DAYS = 7;

/**
 * Reviewer reminder: a non-rejected clip in an active campaign still has no video proof 7 days
 * after submission. Recipients are that campaign's Mods plus its owner (Admins are platform-wide,
 * so they are not pinged per clip). Each clip is reminded once (video_proof_reminder_sent_at).
 */
export async function sendProofReminders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PROOF_REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const due = await db
    .select({ id: clips.id, campaignId: clips.campaignId, ownerUserId: campaigns.ownerUserId })
    .from(clips)
    .innerJoin(campaigns, eq(campaigns.id, clips.campaignId))
    .where(
      and(
        isNull(clips.videoProofUrl),
        isNull(clips.videoProofReminderSentAt),
        ne(clips.status, "rejected"),
        eq(campaigns.status, "active"),
        lte(clips.submittedAt, cutoff),
      ),
    );

  for (const c of due) {
    const mods = await db
      .select({ userId: campaignMods.userId })
      .from(campaignMods)
      .where(eq(campaignMods.campaignId, c.campaignId));
    const recipients = [...new Set([...mods.map((m) => m.userId), c.ownerUserId])];
    await db.transaction(async (tx) => {
      for (const userId of recipients) {
        await notify(tx as unknown as Executor, {
          userId,
          campaignId: c.campaignId,
          clipId: c.id,
          type: "proof_reminder",
          message: `A clip is ${PROOF_REMINDER_AFTER_DAYS}+ days old and still has no video proof.`,
        });
      }
      await tx
        .update(clips)
        .set({ videoProofReminderSentAt: now })
        .where(and(eq(clips.id, c.id), eq(clips.campaignId, c.campaignId)));
    });
  }
  return due.length;
}
