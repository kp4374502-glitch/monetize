import { and, asc, desc, eq, like, sql, gte, count, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { campaigns, campaignCreators, clipReviewEvents, clips, users } from "../../drizzle/schema";
import { getRoleForCampaign, requireRole } from "../auth/roles";
import { fetchClipMetadata, type FetchOptions } from "../scrapecreators";
import { notify } from "../notifications";
import { isValidProofUrl, parseClipUrl } from "./url";
import {
  computeEconomics,
  duplicateFlag,
  roleCanMarkPaid,
  roleCanOverride,
  startOfUtcDay,
  wouldExceedBudget,
} from "./rules";

/**
 * Every query here filters by campaign_id (CLAUDE.md's non-negotiable rule). The one exception is
 * refreshAllClips, a system job for the cron route: it selects across campaigns on purpose, and
 * every write it makes is scoped to the clip's own campaign_id.
 */

type Campaign = typeof campaigns.$inferSelect;
type Clip = typeof clips.$inferSelect;

async function loadCampaign(campaignId: string): Promise<Campaign> {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c) throw new Error("Campaign not found.");
  return c;
}

async function loadClip(campaignId: string, clipId: string): Promise<Clip> {
  const [c] = await db
    .select()
    .from(clips)
    .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId)))
    .limit(1);
  if (!c) throw new Error("Clip not found.");
  return c;
}

/** cpm/earnings/payout columns for a clip's current state; nulls when not (yet) earning. */
function economicsColumns(clip: Pick<Clip, "views" | "qualifyingAudiencePct" | "videoProofUrl">, campaign: Campaign) {
  const e = computeEconomics({
    views: clip.views,
    qualifyingAudiencePct: clip.qualifyingAudiencePct === null ? null : Number(clip.qualifyingAudiencePct),
    videoProofUrl: clip.videoProofUrl,
    campaign: {
      baseRate: Number(campaign.baseRate),
      divisor: Number(campaign.divisor),
      maxPayPerPost: Number(campaign.maxPayPerPost),
      viewMinimum: campaign.viewMinimum,
    },
  });
  return e.eligible
    ? { cpm: e.cpm, earnings: e.earnings, payout: e.payout }
    : { cpm: null, earnings: null, payout: null };
}

// ---------------------------------------------------------------------------------------------
// Creator actions
// ---------------------------------------------------------------------------------------------

export async function submitClip(actorId: string, campaignId: string, rawUrl: string, fetchOpts?: FetchOptions) {
  const [membership] = await db
    .select()
    .from(campaignCreators)
    .where(and(eq(campaignCreators.campaignId, campaignId), eq(campaignCreators.userId, actorId)))
    .limit(1);
  if (!membership) throw new Error("Access denied: you have not joined this campaign.");
  if (membership.suspended) throw new Error("Your submissions are temporarily suspended on this campaign.");

  const campaign = await loadCampaign(campaignId);
  if (campaign.status !== "active") throw new Error("This campaign is not accepting submissions right now.");

  const parsed = parseClipUrl(rawUrl);
  if (!parsed) throw new Error("That doesn't look like a TikTok, Instagram or YouTube post link.");
  if (!campaign.eligiblePlatforms.includes(parsed.platform)) {
    throw new Error(`${parsed.platform} clips are not eligible for this campaign.`);
  }

  const now = new Date();
  const [{ n }] = await db
    .select({ n: count() })
    .from(clips)
    .where(
      and(
        eq(clips.campaignId, campaignId),
        eq(clips.creatorUserId, actorId),
        gte(clips.submittedAt, startOfUtcDay(now)),
      ),
    );
  if (n >= campaign.dailySubmissionLimit) {
    throw new Error(
      `You've reached today's limit of ${campaign.dailySubmissionLimit} submissions for this campaign. Come back tomorrow!`,
    );
  }

  // Same underlying post already in THIS campaign (any URL spelling) — tenant-scoped, never cross-campaign.
  const likePattern = `%${parsed.postId.replace(/[\\%_]/g, "\\$&")}%`;
  const matches = await db
    .select({ creatorUserId: clips.creatorUserId, url: clips.url })
    .from(clips)
    .where(and(eq(clips.campaignId, campaignId), eq(clips.platform, parsed.platform), like(clips.url, likePattern)));
  const flag = duplicateFlag(actorId, matches);
  if (flag.sameCreator || matches.some((m) => m.url === parsed.url)) {
    throw new Error("This link has already been submitted to this campaign.");
  }

  const meta = await fetchClipMetadata(parsed.url, parsed.platform, fetchOpts);

  try {
    const [row] = await db
      .insert(clips)
      .values({
        campaignId,
        creatorUserId: actorId,
        platform: parsed.platform,
        url: parsed.url,
        views: meta.ok ? meta.data.views : 0,
        likes: meta.ok ? meta.data.likes : 0,
        thumbnailUrl: meta.ok ? meta.data.thumbnailUrl : null,
        caption: meta.ok ? meta.data.caption : null,
        // null when the lookup failed: the UI shows "stats pending" and the cron fills it in later
        lastRefreshedAt: meta.ok && !meta.stale ? meta.fetchedAt : null,
        flaggedDuplicate: flag.reason !== null,
        flaggedReason: flag.reason,
      })
      .returning();
    return { clip: row, statsAvailable: meta.ok };
  } catch (e) {
    if (String((e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code) === "23505") {
      throw new Error("This link has already been submitted to this campaign.");
    }
    throw e;
  }
}

const proofSchema = z.string().trim().refine(isValidProofUrl, "Video proof must be a YouTube (unlisted) or Google Drive link.");

/** Creator-only, own clips. Early submission and replacement are both allowed (no date checks). */
export async function attachVideoProof(actorId: string, campaignId: string, clipId: string, rawUrl: string) {
  const url = proofSchema.parse(rawUrl);
  const [clip] = await db
    .select()
    .from(clips)
    .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId), eq(clips.creatorUserId, actorId)))
    .limit(1);
  if (!clip) throw new Error("Clip not found.");
  if (clip.paidStatus === "paid") throw new Error("This clip has already been paid.");

  const campaign = await loadCampaign(campaignId);
  const next = { ...clip, videoProofUrl: url };
  const [row] = await db
    .update(clips)
    .set({ videoProofUrl: url, videoProofSubmittedAt: new Date(), ...economicsColumns(next, campaign) })
    .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId)))
    .returning();
  return row;
}

// ---------------------------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------------------------

async function refreshClipRow(clip: Clip, campaign: Campaign, opts: FetchOptions) {
  const meta = await fetchClipMetadata(clip.url, clip.platform, { force: true, ...opts });
  if (!meta.ok || meta.stale) return { updated: false, stale: true };

  const next = { ...clip, views: meta.data.views };
  // Paid clips are frozen: numbers already paid out are never recalculated.
  const econ = clip.paidStatus === "paid" ? {} : economicsColumns(next, campaign);
  await db
    .update(clips)
    .set({
      views: meta.data.views,
      likes: meta.data.likes,
      thumbnailUrl: meta.data.thumbnailUrl ?? clip.thumbnailUrl,
      caption: meta.data.caption ?? clip.caption,
      lastRefreshedAt: meta.fetchedAt,
      ...econ,
    })
    .where(and(eq(clips.id, clip.id), eq(clips.campaignId, clip.campaignId)));
  return { updated: true, stale: false };
}

/** Manual "Refresh views now": the clip's creator, or Mod/Admin/Owner of the campaign. */
export async function refreshViews(actorId: string, campaignId: string, clipId: string, opts: FetchOptions = {}) {
  const role = await getRoleForCampaign(actorId, campaignId);
  if (!role) throw new Error("Access denied.");
  const clip = await loadClip(campaignId, clipId);
  if (role === "creator" && clip.creatorUserId !== actorId) throw new Error("Clip not found.");
  return refreshClipRow(clip, await loadCampaign(campaignId), opts);
}

/** Cron entry point: oldest-refreshed first, capped per run to bound ScrapeCreators credit spend. */
export async function refreshAllClips(opts: FetchOptions = {}, limit = 200) {
  const due = await db
    .select({ clip: clips, campaign: campaigns })
    .from(clips)
    .innerJoin(campaigns, eq(campaigns.id, clips.campaignId))
    .where(and(eq(campaigns.status, "active"), ne(clips.status, "rejected"), eq(clips.paidStatus, "unpaid")))
    .orderBy(sql`${clips.lastRefreshedAt} asc nulls first`)
    .limit(limit);

  let updated = 0;
  let failed = 0;
  for (const { clip, campaign } of due) {
    const r = await refreshClipRow(clip, campaign, opts);
    if (r.updated) updated++;
    else failed++;
  }
  return { attempted: due.length, updated, failed };
}

// ---------------------------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------------------------

const reviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1, "A reason is required to reject a clip") }),
]);

export async function reviewClip(actorId: string, campaignId: string, clipId: string, input: unknown) {
  const role = await requireRole(actorId, campaignId, "mod");
  const decision = reviewSchema.parse(input);
  const clip = await loadClip(campaignId, clipId);
  if (clip.paidStatus === "paid") throw new Error("This clip has already been paid; its review can't be changed.");
  if (clip.status === (decision.action === "approve" ? "approved" : "rejected")) {
    throw new Error(`This clip is already ${clip.status}.`);
  }

  const [last] = await db
    .select({ actorUserId: clipReviewEvents.actorUserId })
    .from(clipReviewEvents)
    .where(eq(clipReviewEvents.clipId, clipId))
    .orderBy(desc(clipReviewEvents.createdAt))
    .limit(1);
  if (!roleCanOverride(role, actorId, last?.actorUserId ?? null)) {
    throw new Error("Access denied: only an Admin or Owner can override another reviewer's decision.");
  }

  if (decision.action === "approve") {
    const campaign = await loadCampaign(campaignId);
    if (wouldExceedBudget(campaign.budgetSpent, clip.payout ?? 0, campaign.totalBudget)) {
      throw new Error("This clip's payout would exceed the campaign's total budget.");
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(clipReviewEvents).values({
      clipId,
      actorUserId: actorId,
      action: decision.action,
      reason: decision.action === "reject" ? decision.reason : null,
    });
    await tx
      .update(clips)
      .set({
        status: decision.action === "approve" ? "approved" : "rejected",
        rejectionReason: decision.action === "reject" ? decision.reason : null,
      })
      .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId)));
    await notify(tx, {
      userId: clip.creatorUserId,
      campaignId,
      clipId,
      type: decision.action === "approve" ? "clip_approved" : "clip_rejected",
      message:
        decision.action === "approve" ? "Your clip was approved." : `Your clip was rejected: ${decision.reason}`,
    });
  });
}

const pctSchema = z.coerce.number().min(0, "Must be 0–100").max(100, "Must be 0–100");

export async function setQualifyingAudiencePct(actorId: string, campaignId: string, clipId: string, rawPct: unknown) {
  const role = await requireRole(actorId, campaignId, "mod");
  const pct = pctSchema.parse(rawPct);
  const clip = await loadClip(campaignId, clipId);
  if (clip.paidStatus === "paid") throw new Error("This clip has already been paid.");
  // CLAUDE.md verification flow: proof must exist before a % can be entered.
  if (!clip.videoProofUrl) throw new Error("Video proof is missing — the creator must attach it before a Qualifying Audience % can be entered.");
  if (!roleCanOverride(role, actorId, clip.qualifyingPctSetBy)) {
    throw new Error("Access denied: only an Admin or Owner can edit a % another reviewer entered.");
  }

  const campaign = await loadCampaign(campaignId);
  const next = { ...clip, qualifyingAudiencePct: String(pct) };
  const [row] = await db
    .update(clips)
    .set({ qualifyingAudiencePct: String(pct), qualifyingPctSetBy: actorId, ...economicsColumns(next, campaign) })
    .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId)))
    .returning();
  return row;
}

// ---------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------

export async function markPaid(actorId: string, campaignId: string, clipId: string) {
  const role = await requireRole(actorId, campaignId, "mod");
  const clip = await loadClip(campaignId, clipId);
  if (clip.status !== "approved") throw new Error("Only approved clips can be marked paid.");
  if (clip.paidStatus === "paid") throw new Error("This clip is already marked paid.");
  if (clip.payout === null || Number(clip.payout) <= 0) throw new Error("Nothing is owed on this clip yet.");

  const campaign = await loadCampaign(campaignId);
  if (!roleCanMarkPaid(role, clip.payout, campaign.modMarkPaidThreshold)) {
    throw new Error("Access denied: this payout is above the Mod mark-paid threshold — an Admin or Owner must mark it paid.");
  }
  if (wouldExceedBudget(campaign.budgetSpent, clip.payout, campaign.totalBudget)) {
    throw new Error("Marking this paid would exceed the campaign's total budget.");
  }

  await db.transaction(async (tx) => {
    const paid = await tx
      .update(clips)
      .set({ paidStatus: "paid", paidBy: actorId, paidAt: new Date() })
      .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId), eq(clips.paidStatus, "unpaid")))
      .returning({ id: clips.id });
    if (!paid.length) throw new Error("This clip is already marked paid.");

    // Atomic cap check-and-increment: two concurrent payouts can't both slip under the cap.
    const bumped = await tx
      .update(campaigns)
      .set({ budgetSpent: sql`${campaigns.budgetSpent} + ${clip.payout}` })
      .where(and(eq(campaigns.id, campaignId), sql`${campaigns.budgetSpent} + ${clip.payout} <= ${campaigns.totalBudget}`))
      .returning({ id: campaigns.id });
    if (!bumped.length) throw new Error("Marking this paid would exceed the campaign's total budget.");

    await notify(tx, {
      userId: clip.creatorUserId,
      campaignId,
      clipId,
      type: "payout_paid",
      message: "Your clip has been marked paid.",
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Reads for the dashboard
// ---------------------------------------------------------------------------------------------

/** A creator's own clips on one campaign — never anyone else's. */
export async function getCreatorClips(actorId: string, campaignId: string) {
  return db
    .select()
    .from(clips)
    .where(and(eq(clips.campaignId, campaignId), eq(clips.creatorUserId, actorId)))
    .orderBy(desc(clips.submittedAt));
}

export async function getReviewQueue(actorId: string, campaignId: string) {
  await requireRole(actorId, campaignId, "mod");
  const rows = (status: "pending" | "approved") =>
    db
      .select({ clip: clips, creatorUsername: users.username })
      .from(clips)
      .innerJoin(users, eq(users.id, clips.creatorUserId))
      .where(
        status === "pending"
          ? and(eq(clips.campaignId, campaignId), eq(clips.status, "pending"))
          : and(eq(clips.campaignId, campaignId), eq(clips.status, "approved"), eq(clips.paidStatus, "unpaid")),
      )
      .orderBy(asc(clips.submittedAt));
  return { pending: await rows("pending"), awaitingPayment: await rows("approved") };
}
