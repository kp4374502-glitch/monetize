import { and, asc, desc, eq, inArray, isNull, like, sql, gte, lte, count, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../db/client";
import { campaigns, campaignCreators, clipReviewEvents, clips, users } from "../../drizzle/schema";
import { getRoleForCampaign, requireRole } from "../auth/roles";
import { fetchClipMetadata, type FetchOptions } from "../scrapecreators";
import { notify } from "../notifications";
import { isValidProofUrl, parseClipUrl } from "./url";
import { vercelBlobStore, type ProofImageStore } from "./proof-store";
import {
  ANALYTICS_GATE_DAYS,
  analyticsGateState,
  canSetManualViews,
  effectiveViews,
  hasAnalyticsProof,
  computeEconomics,
  duplicateFlag,
  roleCanMarkPaid,
  roleCanOverride,
  startOfUtcDay,
  wouldExceedBudget,
} from "./rules";

const OWN_DUPLICATE_MESSAGE = "You've already submitted this link to this campaign.";
// Deliberately never says WHICH creator: creators must not see each other's activity.
const OTHER_DUPLICATE_MESSAGE = "This link has already been submitted to this campaign by another creator and can't be added again.";

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

/** Never returns a soft-deleted clip — every mutation that loads through here treats it as gone. */
async function loadClip(campaignId: string, clipId: string): Promise<Clip> {
  const [c] = await db
    .select()
    .from(clips)
    .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId), isNull(clips.deletedAt)))
    .limit(1);
  if (!c) throw new Error("Clip not found.");
  return c;
}

/** cpm/earnings/payout columns for a clip's current state; nulls when not (yet) earning. */
function economicsColumns(
  clip: Pick<Clip, "views" | "manualViews" | "qualifyingAudiencePct" | "videoProofUrl" | "analyticsScreenshotPathname">,
  campaign: Campaign,
) {
  const e = computeEconomics({
    views: effectiveViews(clip),
    qualifyingAudiencePct: clip.qualifyingAudiencePct === null ? null : Number(clip.qualifyingAudiencePct),
    videoProofUrl: clip.videoProofUrl,
    analyticsScreenshotPathname: clip.analyticsScreenshotPathname,
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
        isNull(clips.deletedAt),
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
    .where(and(eq(clips.campaignId, campaignId), eq(clips.platform, parsed.platform), like(clips.url, likePattern), isNull(clips.deletedAt)));
  const flag = duplicateFlag(actorId, matches);
  if (flag.sameCreator) throw new Error(OWN_DUPLICATE_MESSAGE);
  if (matches.some((m) => m.url === parsed.url)) throw new Error(OTHER_DUPLICATE_MESSAGE);

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
        isVideo: meta.ok ? meta.data.isVideo : null,
        // null when the lookup failed: the UI shows "stats pending" and the cron fills it in later
        lastRefreshedAt: meta.ok && !meta.stale ? meta.fetchedAt : null,
        flaggedDuplicate: flag.reason !== null,
        flaggedReason: flag.reason,
        // Task 5 Part 3: every new clip starts gated, regardless of how old the post already is —
        // only attachVideoProof (once the 7-day gate actually clears) moves it into "pending".
        status: "awaiting_analytics",
        postedAt: meta.ok ? meta.data.postedAt : null,
      })
      .returning();
    return { clip: row, statsAvailable: meta.ok };
  } catch (e) {
    if (String((e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code) === "23505") {
      // Lost a race with another insert of the same URL (or it's blocked by a paid-then-deleted
      // clip — the partial index still catches those): work out whose it was, deleted or not, so
      // the wording is accurate.
      const [existing] = await db
        .select({ creatorUserId: clips.creatorUserId })
        .from(clips)
        .where(and(eq(clips.campaignId, campaignId), eq(clips.url, parsed.url)))
        .limit(1);
      throw new Error(existing?.creatorUserId === actorId ? OWN_DUPLICATE_MESSAGE : OTHER_DUPLICATE_MESSAGE);
    }
    throw e;
  }
}

const proofSchema = z.string().trim().refine(isValidProofUrl, "Analytics proof must be a YouTube (unlisted) or Google Drive link.");

function analyticsGateError(gate: Extract<ReturnType<typeof analyticsGateState>, { locked: true }>): Error {
  return new Error(
    gate.reason === "unknown_posted_at"
      ? "This clip's post date isn't available yet, so we can't confirm the 7-day analytics window — ask a Mod/Admin/Owner to confirm it before submitting proof."
      : `Analytics proof can't be submitted until 7 days after the post went live (unlocks ${gate.unlocksAt.toISOString().slice(0, 10)}).`,
  );
}

/**
 * Creator-only, own clips. A clip has one proof at a time, so this also replaces (and deletes) an
 * earlier screenshot. Task 5 Part 3: while the clip is still "awaiting_analytics" (i.e. this would be
 * its FIRST proof), the 7-day-since-the-post's-own-publish-date gate applies — see analyticsGateState.
 * Once proof clears the gate, the clip moves to "pending" right here. After that, replacing proof on
 * an already-"pending"/approved/rejected clip is unrestricted (existing behavior, unaffected).
 */
export async function attachVideoProof(
  actorId: string,
  campaignId: string,
  clipId: string,
  rawUrl: string,
  store: ProofImageStore = vercelBlobStore,
) {
  const url = proofSchema.parse(rawUrl);
  const [clip] = await db
    .select()
    .from(clips)
    .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId), eq(clips.creatorUserId, actorId), isNull(clips.deletedAt)))
    .limit(1);
  if (!clip) throw new Error("Clip not found.");
  if (clip.paidStatus === "paid") throw new Error("This clip has already been paid.");

  const wasAwaitingAnalytics = clip.status === "awaiting_analytics";
  if (wasAwaitingAnalytics) {
    const gate = analyticsGateState(clip);
    if (gate.locked) throw analyticsGateError(gate);
  }

  const campaign = await loadCampaign(campaignId);
  const next = { ...clip, videoProofUrl: url, analyticsScreenshotPathname: null };
  const [row] = await db
    .update(clips)
    .set({
      videoProofUrl: url,
      videoProofSubmittedAt: new Date(),
      analyticsScreenshotPathname: null,
      analyticsScreenshotSubmittedAt: null,
      analyticsScreenshotViewsAtSubmit: null,
      ...(wasAwaitingAnalytics ? { status: "pending" as const } : {}),
      ...economicsColumns(next, campaign),
    })
    .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId)))
    .returning();
  if (clip.analyticsScreenshotPathname) await store.del(clip.analyticsScreenshotPathname).catch(() => {});
  return row;
}

/**
 * Stream a clip's screenshot to someone allowed to see it: the creator who owns the clip, or a Mod/Admin/
 * Owner of THIS campaign. Anyone else gets "not found" (indistinguishable from a clip with no screenshot).
 *
 * Task 5 Part 2: NEW screenshot submission has been removed — a video link is now the only proof method
 * going forward. This read path (and the underlying Blob storage) stays, so an already-accepted
 * screenshot on an existing clip keeps working and displaying exactly as before; nothing invalidates it.
 */
export async function getProofImage(
  actorId: string,
  campaignId: string,
  clipId: string,
  store: ProofImageStore = vercelBlobStore,
) {
  const role = await getRoleForCampaign(actorId, campaignId);
  if (!role) throw new Error("Clip not found.");
  const clip = await loadClip(campaignId, clipId);
  if (role === "creator" && clip.creatorUserId !== actorId) throw new Error("Clip not found.");
  if (!clip.analyticsScreenshotPathname) throw new Error("Clip not found.");
  const blob = await store.get(clip.analyticsScreenshotPathname);
  if (!blob) throw new Error("Clip not found.");
  return blob;
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
      // Keeps canSetManualViews current. Never touches manualViews itself — a refresh can update
      // what ScrapeCreators says, but only setManualViews (reviewer-only) can change the override.
      isVideo: meta.data.isVideo,
      // Fills in a still-missing posted_at (e.g. the submission-time fetch failed); never overwrites
      // an already-known value — a post's publish date doesn't change, and a reviewer may have
      // manually confirmed it via setPostedAt.
      postedAt: clip.postedAt ?? meta.data.postedAt,
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

/**
 * Manual "Refresh all views now" on the campaign dashboard: Mod/Admin/Owner only. Refreshes every
 * pending or approved-unpaid clip in THIS campaign (never touches other campaigns — see CLAUDE.md's
 * non-negotiable rule). Sequential, one ScrapeCreators call per clip, so it's capped per click to
 * bound how long the request runs; anything past the cap still gets picked up by the daily cron.
 */
export async function refreshCampaignClips(actorId: string, campaignId: string, opts: FetchOptions = {}, limit = 40) {
  await requireRole(actorId, campaignId, "mod");
  const campaign = await loadCampaign(campaignId);
  const due = await db
    .select()
    .from(clips)
    .where(and(eq(clips.campaignId, campaignId), ne(clips.status, "rejected"), eq(clips.paidStatus, "unpaid"), isNull(clips.deletedAt)))
    .orderBy(sql`${clips.lastRefreshedAt} asc nulls first`)
    .limit(limit);

  let updated = 0;
  let failed = 0;
  for (const clip of due) {
    const r = await refreshClipRow(clip, campaign, opts);
    if (r.updated) updated++;
    else failed++;
  }
  return { attempted: due.length, updated, failed };
}

/** Cron entry point: oldest-refreshed first, capped per run to bound ScrapeCreators credit spend. */
export async function refreshAllClips(opts: FetchOptions = {}, limit = 200) {
  const due = await db
    .select({ clip: clips, campaign: campaigns })
    .from(clips)
    .innerJoin(campaigns, eq(campaigns.id, clips.campaignId))
    .where(and(eq(campaigns.status, "active"), ne(clips.status, "rejected"), eq(clips.paidStatus, "unpaid"), isNull(clips.deletedAt)))
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

/**
 * Task 5 Part 3 cron helper — one daily pass, two jobs, both keyed off the SAME cutoff
 * (posted_at + 7 days <= now, and posted_at itself known — never guessed for a null one):
 *   1. Already has proof (the retroactive case, or a race between cron runs) -> flip straight to
 *      "pending", silently. No notification: the creator already did their part before this
 *      feature (or before the gate cleared) existed to ask them to wait.
 *   2. No proof yet and never notified -> tell the creator they can submit it now, and mark it sent
 *      (analyticsUnlockNotifiedAt) so it never fires twice for the same clip.
 * Deleted clips and paused/closed/archived campaigns are excluded from both, same as sendProofReminders.
 */
export async function runAnalyticsGateSweep(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - ANALYTICS_GATE_DAYS * 24 * 60 * 60 * 1000);
  const dueBase = and(
    eq(clips.status, "awaiting_analytics"),
    isNull(clips.deletedAt),
    sql`${clips.postedAt} is not null`,
    lte(clips.postedAt, cutoff),
  );

  const readyWithProof = await db
    .select({ id: clips.id, campaignId: clips.campaignId })
    .from(clips)
    .where(and(dueBase, sql`(${clips.videoProofUrl} is not null or ${clips.analyticsScreenshotPathname} is not null)`));
  for (const c of readyWithProof) {
    await db.update(clips).set({ status: "pending" }).where(and(eq(clips.id, c.id), eq(clips.campaignId, c.campaignId)));
  }

  const dueToNotify = await db
    .select({ id: clips.id, campaignId: clips.campaignId, creatorUserId: clips.creatorUserId, url: clips.url })
    .from(clips)
    .innerJoin(campaigns, eq(campaigns.id, clips.campaignId))
    .where(
      and(
        dueBase,
        isNull(clips.videoProofUrl),
        isNull(clips.analyticsScreenshotPathname),
        isNull(clips.analyticsUnlockNotifiedAt),
        eq(campaigns.status, "active"),
      ),
    );
  for (const c of dueToNotify) {
    await db.transaction(async (tx) => {
      await notify(tx, {
        userId: c.creatorUserId,
        campaignId: c.campaignId,
        clipId: c.id,
        type: "analytics_unlocked",
        message: `Your post (${c.url}) has been live for ${ANALYTICS_GATE_DAYS} days — you can now submit your Analytics proof.`,
      });
      await tx.update(clips).set({ analyticsUnlockNotifiedAt: now }).where(and(eq(clips.id, c.id), eq(clips.campaignId, c.campaignId)));
    });
  }

  return { transitioned: readyWithProof.length, notified: dueToNotify.length };
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
  if (!hasAnalyticsProof(clip)) throw new Error("Analytics proof is missing — the creator must attach it before a Qualifying Audience % can be entered.");
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

// A blank submission clears the override (reverts to the automatic number); otherwise a whole,
// non-negative view count. Kept generous on the upper end (clips.views is a 32-bit int column).
const manualViewsSchema = z.union([
  z.literal("").transform(() => null),
  z.coerce
    .number()
    .int("Enter a whole number of views.")
    .min(0, "Must be 0 or greater.")
    .max(2_000_000_000, "That number is too large."),
]);

/**
 * Mod/Admin/Owner only: manually record a view count for a clip ScrapeCreators has confirmed is an
 * Instagram photo/carousel — that post type has no automatic view data at all (canSetManualViews).
 * Real videos always use the auto-fetched number; this is refused for them. Feeds the payout formula
 * exactly like an auto-fetched count would (effectiveViews). A blank value clears the override.
 */
export async function setManualViews(actorId: string, campaignId: string, clipId: string, rawViews: unknown) {
  const role = await requireRole(actorId, campaignId, "mod");
  const manualViews = manualViewsSchema.parse(rawViews);
  const clip = await loadClip(campaignId, clipId);
  if (clip.paidStatus === "paid") throw new Error("This clip has already been paid.");
  if (!canSetManualViews(clip)) {
    throw new Error(
      "Manual view entry is only for an Instagram post ScrapeCreators has confirmed is a photo/carousel — a real video's automatic view count is used as-is.",
    );
  }
  if (!roleCanOverride(role, actorId, clip.manualViewsSetBy)) {
    throw new Error("Access denied: only an Admin or Owner can edit a manual view count another reviewer entered.");
  }

  const campaign = await loadCampaign(campaignId);
  const next = { ...clip, manualViews };
  const [row] = await db
    .update(clips)
    .set({
      manualViews,
      manualViewsSetBy: manualViews === null ? null : actorId,
      manualViewsSetAt: manualViews === null ? null : new Date(),
      ...economicsColumns(next, campaign),
    })
    .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId)))
    .returning();
  return row;
}

const postedAtSchema = z.coerce.date().refine((d) => d.getTime() <= Date.now(), "The post date can't be in the future.");

/**
 * Mod/Admin/Owner only, one-time: manually confirm a clip's post date when ScrapeCreators never
 * captured one (analyticsGateState — a null posted_at is never guessed or defaulted). Refuses if a
 * date is already known, auto-captured or previously confirmed, to avoid silently overriding real
 * data. If the clip already has proof and this newly-set date already clears the 7-day gate, unlocks
 * it into "pending" immediately — no need to wait for the creator to resubmit or the next cron pass.
 */
export async function setPostedAt(actorId: string, campaignId: string, clipId: string, rawDate: unknown) {
  await requireRole(actorId, campaignId, "mod");
  const postedAt = postedAtSchema.parse(rawDate);
  const clip = await loadClip(campaignId, clipId);
  if (clip.postedAt !== null) throw new Error("This clip's post date is already known.");

  const shouldUnlock = clip.status === "awaiting_analytics" && hasAnalyticsProof(clip) && !analyticsGateState({ ...clip, postedAt }).locked;

  const [row] = await db.transaction(async (tx) => {
    await tx.insert(clipReviewEvents).values({ clipId, actorUserId: actorId, action: "set_posted_at" });
    return tx
      .update(clips)
      .set({ postedAt, postedAtSetBy: actorId, ...(shouldUnlock ? { status: "pending" as const } : {}) })
      .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId)))
      .returning();
  });
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
// Admin
// ---------------------------------------------------------------------------------------------

/**
 * Soft delete — Owner/Admin only (platform-wide roles; "owner" here also covers a campaign's own
 * owner, and ROLE_RANK treats admin as rank-equal — mod and creator are refused). Works on ANY
 * status, including paid. Never a hard DELETE: sets deleted_at/deleted_by so the row drops out of
 * every list/query app-wide (loadClip and every read function above all exclude it), while its
 * payout math and clip_review_events audit trail stay intact for anything that was ever paid — same
 * treatment the rest of this app gives clip_review_events elsewhere. Frees the clip's URL up for
 * resubmission (the unique index is partial: WHERE deleted_at IS NULL).
 */
export async function deleteClip(actorId: string, campaignId: string, clipId: string) {
  await requireRole(actorId, campaignId, "owner");
  const clip = await loadClip(campaignId, clipId);

  await db.transaction(async (tx) => {
    await tx.insert(clipReviewEvents).values({
      clipId,
      actorUserId: actorId,
      action: "delete",
      reason: `Prior status: ${clip.status}${clip.paidStatus === "paid" ? " (paid)" : ""}.`,
    });
    await tx
      .update(clips)
      .set({ deletedAt: new Date(), deletedBy: actorId })
      .where(and(eq(clips.id, clipId), eq(clips.campaignId, campaignId)));
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
    .where(and(eq(clips.campaignId, campaignId), eq(clips.creatorUserId, actorId), isNull(clips.deletedAt)))
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
          ? and(eq(clips.campaignId, campaignId), eq(clips.status, "pending"), isNull(clips.deletedAt))
          : and(eq(clips.campaignId, campaignId), eq(clips.status, "approved"), eq(clips.paidStatus, "unpaid"), isNull(clips.deletedAt)),
      )
      .orderBy(asc(clips.submittedAt));
  return { pending: await rows("pending"), awaitingPayment: await rows("approved") };
}

const HISTORY_LIMIT = 50;

/**
 * Paid and Rejected history plus the money totals, for Mods/Admins/Owner of THIS campaign.
 * Totals are exact (summed in SQL over numeric columns): paid = payout of paid clips,
 * owed = payout of approved-but-unpaid clips. Lists are newest first, capped at 50 each.
 */
export async function getClipHistory(actorId: string, campaignId: string) {
  await requireRole(actorId, campaignId, "mod");

  const payer = alias(users, "payer");
  const paid = await db
    .select({ clip: clips, creatorUsername: users.username, paidByUsername: payer.username })
    .from(clips)
    .innerJoin(users, eq(users.id, clips.creatorUserId))
    .leftJoin(payer, eq(payer.id, clips.paidBy))
    .where(and(eq(clips.campaignId, campaignId), eq(clips.paidStatus, "paid"), isNull(clips.deletedAt)))
    .orderBy(desc(clips.paidAt))
    .limit(HISTORY_LIMIT);

  const rejectedRows = await db
    .select({ clip: clips, creatorUsername: users.username })
    .from(clips)
    .innerJoin(users, eq(users.id, clips.creatorUserId))
    .where(and(eq(clips.campaignId, campaignId), eq(clips.status, "rejected"), isNull(clips.deletedAt)))
    .orderBy(desc(clips.submittedAt))
    .limit(HISTORY_LIMIT);

  // Who made the latest reject call on each clip (from the audit log).
  const rejecters = new Map<string, string>();
  if (rejectedRows.length) {
    const events = await db
      .select({ clipId: clipReviewEvents.clipId, username: users.username })
      .from(clipReviewEvents)
      .innerJoin(users, eq(users.id, clipReviewEvents.actorUserId))
      .where(
        and(
          inArray(clipReviewEvents.clipId, rejectedRows.map((r) => r.clip.id)),
          eq(clipReviewEvents.action, "reject"),
        ),
      )
      .orderBy(desc(clipReviewEvents.createdAt));
    for (const e of events) if (!rejecters.has(e.clipId)) rejecters.set(e.clipId, e.username);
  }

  const [totals] = await db
    .select({
      paid: sql<string>`coalesce(sum(${clips.payout}) filter (where ${clips.paidStatus} = 'paid'), 0)`,
      owed: sql<string>`coalesce(sum(${clips.payout}) filter (where ${clips.status} = 'approved' and ${clips.paidStatus} = 'unpaid'), 0)`,
    })
    .from(clips)
    .where(and(eq(clips.campaignId, campaignId), isNull(clips.deletedAt)));

  return {
    paid,
    rejected: rejectedRows.map((r) => ({ ...r, rejectedBy: rejecters.get(r.clip.id) ?? null })),
    totals: { paid: Number(totals.paid).toFixed(2), owed: Number(totals.owed).toFixed(2) },
  };
}

// ---------------------------------------------------------------------------------------------
// Filterable clip history (Mod/Admin/Owner and creator's own) — a broader, filtered view over the
// same clips rows getReviewQueue/getClipHistory already read, not a separate data model.
// ---------------------------------------------------------------------------------------------

export type ClipHistoryStatusFilter = "all" | "awaiting_analytics" | "pending" | "approved" | "rejected" | "paid";
export interface ClipHistoryFilters {
  status?: ClipHistoryStatusFilter;
  from?: Date;
  to?: Date;
}
const CLIP_HISTORY_LIMIT = 500;

function clipHistoryStatusCondition(status: ClipHistoryStatusFilter | undefined) {
  switch (status) {
    // "Waiting for Analytics" (Task 5 Part 3): covers a clip whether still locked (posted_at unknown,
    // or the 7 days haven't passed) or already unlocked but the creator hasn't submitted proof yet —
    // both are the same status value, so this one condition covers the whole bucket.
    case "awaiting_analytics":
      return eq(clips.status, "awaiting_analytics");
    case "pending":
      return eq(clips.status, "pending");
    case "approved":
      return eq(clips.status, "approved");
    case "rejected":
      return eq(clips.status, "rejected");
    case "paid":
      // Only an approved clip can be paid, but this filters on paid_status directly (not status)
      // so it reads naturally as its own tab, same as the others.
      return eq(clips.paidStatus, "paid");
    default:
      return undefined;
  }
}

/**
 * Shared core: `scope` is the caller's already-checked tenant/creator condition. The summary counts
 * are for the DATE RANGE alone (every status at once), so switching the status tab narrows the list
 * below without the summary bar itself jumping around; the list applies both the range and the tab.
 */
async function filteredClipHistory(scope: SQL, filters: ClipHistoryFilters) {
  const rangeParts = [scope];
  if (filters.from) rangeParts.push(gte(clips.submittedAt, filters.from));
  if (filters.to) rangeParts.push(lte(clips.submittedAt, filters.to));
  const dateScope = rangeParts.length > 1 ? and(...rangeParts) : scope;

  const [summaryRow] = await db
    .select({
      total: count(),
      awaitingAnalytics: sql<number>`count(*) filter (where ${clips.status} = 'awaiting_analytics')`,
      pending: sql<number>`count(*) filter (where ${clips.status} = 'pending')`,
      approved: sql<number>`count(*) filter (where ${clips.status} = 'approved')`,
      rejected: sql<number>`count(*) filter (where ${clips.status} = 'rejected')`,
      paid: sql<number>`count(*) filter (where ${clips.paidStatus} = 'paid')`,
      // Effective views (manual override wins, same as effectiveViews()) summed in SQL rather than
      // over `rows`, which is capped at CLIP_HISTORY_LIMIT — this must total every matching clip.
      totalViews: sql<string>`coalesce(sum(coalesce(${clips.manualViews}, ${clips.views})), 0)`,
      approvedViews: sql<string>`coalesce(sum(coalesce(${clips.manualViews}, ${clips.views})) filter (where ${clips.status} = 'approved'), 0)`,
    })
    .from(clips)
    .where(dateScope);

  const statusCondition = clipHistoryStatusCondition(filters.status);
  const rows = await db
    .select({ clip: clips, creatorUsername: users.username })
    .from(clips)
    .innerJoin(users, eq(users.id, clips.creatorUserId))
    .where(statusCondition ? and(dateScope, statusCondition) : dateScope)
    .orderBy(desc(clips.submittedAt))
    .limit(CLIP_HISTORY_LIMIT);

  return {
    summary: {
      total: Number(summaryRow.total),
      awaitingAnalytics: Number(summaryRow.awaitingAnalytics),
      pending: Number(summaryRow.pending),
      approved: Number(summaryRow.approved),
      rejected: Number(summaryRow.rejected),
      paid: Number(summaryRow.paid),
      totalViews: Number(summaryRow.totalViews),
      approvedViews: Number(summaryRow.approvedViews),
    },
    rows,
  };
}

/** Every clip ever submitted to THIS campaign, filtered — Mod/Admin/Owner only. */
export async function getReviewerClipHistory(actorId: string, campaignId: string, filters: ClipHistoryFilters = {}) {
  await requireRole(actorId, campaignId, "mod");
  return filteredClipHistory(and(eq(clips.campaignId, campaignId), isNull(clips.deletedAt))!, filters);
}

/** A creator's own submissions to THIS campaign, filtered — never anyone else's (same scoping as getCreatorClips). */
export async function getMyClipHistory(actorId: string, campaignId: string, filters: ClipHistoryFilters = {}) {
  return filteredClipHistory(and(eq(clips.campaignId, campaignId), eq(clips.creatorUserId, actorId), isNull(clips.deletedAt))!, filters);
}

const ROSTER_LIMIT = 500;

/**
 * Creators on THIS campaign with per-creator clip aggregates, for Mods/Admins/Owner.
 *   clips  = every clip they submitted (any status)      views = total views across those clips
 *   earned = payout on APPROVED clips (paid + unpaid)     owed  = approved-but-unpaid payout
 * Creators who have joined but not submitted anything still appear (zeros). The clips join carries
 * the campaign_id, so nothing from another campaign can leak into a row. Sorted by earned, then name.
 */
export async function getCreatorRoster(actorId: string, campaignId: string) {
  await requireRole(actorId, campaignId, "mod");

  const rows = await db
    .select({
      userId: campaignCreators.userId,
      username: users.username,
      suspended: campaignCreators.suspended,
      joinedAt: campaignCreators.joinedAt,
      clips: sql<number>`count(${clips.id})::int`,
      views: sql<string>`coalesce(sum(coalesce(${clips.manualViews}, ${clips.views})), 0)`,
      earned: sql<string>`coalesce(sum(${clips.payout}) filter (where ${clips.status} = 'approved'), 0)`,
      owed: sql<string>`coalesce(sum(${clips.payout}) filter (where ${clips.status} = 'approved' and ${clips.paidStatus} = 'unpaid'), 0)`,
    })
    .from(campaignCreators)
    .innerJoin(users, eq(users.id, campaignCreators.userId))
    .leftJoin(
      clips,
      and(eq(clips.campaignId, campaignCreators.campaignId), eq(clips.creatorUserId, campaignCreators.userId), isNull(clips.deletedAt)),
    )
    .where(eq(campaignCreators.campaignId, campaignId))
    .groupBy(campaignCreators.id, users.username)
    .orderBy(sql`coalesce(sum(${clips.payout}) filter (where ${clips.status} = 'approved'), 0) desc`, asc(users.username))
    .limit(ROSTER_LIMIT);

  return rows.map((r) => ({
    userId: r.userId,
    username: r.username,
    suspended: r.suspended,
    joinedAt: r.joinedAt,
    clips: r.clips,
    views: Number(r.views),
    earned: Number(r.earned).toFixed(2),
    owed: Number(r.owed).toFixed(2),
  }));
}

export const CREATOR_ROSTER_LIMIT = ROSTER_LIMIT;
