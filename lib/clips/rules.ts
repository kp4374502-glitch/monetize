import { calculatePayout } from "../payout";

/** Pure business rules — no DB, so they are unit-tested directly. Money math is in integer cents. */

export const toCents = (v: number | string): number => Math.round(Number(v) * 100);
export const fromCents = (c: number): string => (c / 100).toFixed(2);

export interface EconomicsInput {
  views: number;
  qualifyingAudiencePct: number | null;
  videoProofUrl: string | null;
  /** Private-blob pathname of an uploaded analytics screenshot; counts as proof just like a video link. */
  analyticsScreenshotPathname?: string | null;
  campaign: { baseRate: number; divisor: number; maxPayPerPost: number; viewMinimum: number };
}

export type Economics =
  | { eligible: false; reason: "no_proof" | "no_pct" | "below_view_minimum" }
  | { eligible: true; cpm: string; earnings: string; payout: string };

/**
 * Gating per docs/PRODUCT_SPEC.md ("Tier 1 audience verification" + "Payout formula"): no payout
 * until analytics proof is attached, a Qualifying Audience % is entered, and views clear the campaign's
 * View Minimum. (Approval is checked separately — it gates owing/paying, not the calculation.)
 * cpm keeps 4 decimals; earnings and payout are rounded to cents.
 */
export function computeEconomics(i: EconomicsInput): Economics {
  if (!i.videoProofUrl && !i.analyticsScreenshotPathname) return { eligible: false, reason: "no_proof" };
  if (i.qualifyingAudiencePct === null) return { eligible: false, reason: "no_pct" };
  if (i.views < i.campaign.viewMinimum) return { eligible: false, reason: "below_view_minimum" };

  const r = calculatePayout({
    qualifyingAudiencePct: i.qualifyingAudiencePct,
    divisor: i.campaign.divisor,
    baseRate: i.campaign.baseRate,
    views: i.views,
    maxPayPerPost: i.campaign.maxPayPerPost,
  });
  const earningsCents = toCents(r.earnings);
  const payoutCents = Math.min(earningsCents, toCents(i.campaign.maxPayPerPost));
  return { eligible: true, cpm: r.cpm.toFixed(4), earnings: fromCents(earningsCents), payout: fromCents(payoutCents) };
}

/** budget_spent + payout <= total_budget, compared in cents. */
export function wouldExceedBudget(budgetSpent: number | string, payout: number | string, totalBudget: number | string) {
  return toCents(budgetSpent) + toCents(payout) > toCents(totalBudget);
}

/** A Mod may mark paid only up to the threshold; Admin/Owner are unlimited. */
export function roleCanMarkPaid(role: "owner" | "admin" | "mod" | "creator", payout: number | string, threshold: number | string) {
  if (role === "owner" || role === "admin") return true;
  if (role === "mod") return toCents(payout) <= toCents(threshold);
  return false;
}

/**
 * A Mod may act on a clip's review/audience-% only if nobody else has (or they did it themselves).
 * Admin/Owner may always override anyone.
 */
export function roleCanOverride(
  role: "owner" | "admin" | "mod" | "creator",
  actorId: string,
  lastDecisionBy: string | null,
): boolean {
  if (role === "owner" || role === "admin") return true;
  if (role === "mod") return lastDecisionBy === null || lastDecisionBy === actorId;
  return false;
}

/**
 * Soft duplicate/stolen-link flag: the same underlying post already submitted by a DIFFERENT
 * creator in the same campaign. Returns a reason string (never names the other creator) or null.
 */
export function duplicateFlag(
  creatorId: string,
  matches: Array<{ creatorUserId: string }>,
): { sameCreator: boolean; reason: string | null } {
  const sameCreator = matches.some((m) => m.creatorUserId === creatorId);
  const other = matches.some((m) => m.creatorUserId !== creatorId);
  return {
    sameCreator,
    reason: other ? "This post was already submitted by another creator in this campaign." : null,
  };
}

/** Rolling-window start for the daily submission limit: midnight UTC (spec: UTC uniformly). */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Analytics-proof screenshots are only ACCEPTED for clips with FEWER than this many views (docs/PRODUCT_SPEC.md
 * -> "Tier 1 audience verification"). At or above it, only a video link may be submitted. This governs new
 * submissions only: a screenshot accepted while the clip was under the limit stays valid forever, even after
 * the clip's views grow past it. Deliberately a platform-wide constant, not a per-campaign setting.
 */
export const SCREENSHOT_VIEWS_LIMIT = 10_000;

/** May the creator submit a screenshot for a clip that currently has this many views? Strictly fewer than 10,000. */
export const canSubmitScreenshot = (views: number): boolean => views < SCREENSHOT_VIEWS_LIMIT;

/** A clip has analytics proof if it carries a video link OR an accepted screenshot. */
export const hasAnalyticsProof = (c: {
  videoProofUrl: string | null;
  analyticsScreenshotPathname?: string | null;
}): boolean => !!(c.videoProofUrl || c.analyticsScreenshotPathname);

/**
 * The view count actually used everywhere views matter — payout, the view-minimum gate, and every
 * display of "views". A Mod/Admin/Owner's manual entry (see canSetManualViews) always wins over the
 * auto-fetched number when present; a refresh never clears or overrides it.
 */
export const effectiveViews = (c: { views: number; manualViews: number | null }): number =>
  c.manualViews ?? c.views;

/**
 * Manual view entry exists only for a clip ScrapeCreators has CONFIRMED is an Instagram photo/
 * carousel post (is_video: false) — that post type has no automatic view data at all. It is never
 * offered for a real video: there, the auto-fetched number is trusted as-is. `isVideo` is null until
 * a fetch has actually succeeded at least once, so an unrefreshed clip can't be hand-edited either.
 */
export const canSetManualViews = (c: { platform: string; isVideo: boolean | null }): boolean =>
  c.platform === "instagram" && c.isVideo === false;
