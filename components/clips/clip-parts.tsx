import { CheckCircle2 } from "lucide-react";
import { clips } from "@/drizzle/schema";
import { Badge } from "@/components/ui/badge";
import { effectiveViews } from "@/lib/clips/rules";

export type ClipRow = typeof clips.$inferSelect;

const STALE_AFTER_MS = 36 * 60 * 60 * 1000; // cron runs daily; anything older missed a refresh

export const money = (v: string | number | null) =>
  v === null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StatusBadge({ clip }: { clip: ClipRow }) {
  const label = clip.paidStatus === "paid" ? "paid" : clip.status;
  // "capitalize" only affects the first letter of the whole string, so the raw enum value would
  // render as "Awaiting_analytics" — spell it out instead.
  return (
    <Badge status={label} data-testid="clip-status">
      {label === "awaiting_analytics" ? "Awaiting analytics" : undefined}
    </Badge>
  );
}

/**
 * Two-step approval: a pure content/eligibility check, independent of `status` and never a payout
 * signal — see clips.clip_approved. Shown additively alongside StatusBadge, never instead of it.
 */
export function ClipApprovedBadge({ clip }: { clip: ClipRow }) {
  if (!clip.clipApproved) return null;
  return (
    <Badge status="approved" data-testid="clip-approved-badge">
      Clip Approved
    </Badge>
  );
}

/**
 * The clip's analytics-proof link, if any has been submitted — a video link (current method), or a
 * legacy accepted screenshot (Task 5 Part 2 removed new screenshot uploads, but an existing one on
 * file stays valid and still displays exactly as before). Returns null when neither exists; callers
 * that need a "proof missing" nudge (the active review queue) wrap this themselves.
 */
export function AnalyticsProof({ clip, campaignId }: { clip: ClipRow; campaignId: string }) {
  if (clip.analyticsScreenshotPathname) {
    // Private image, served through the access-checked /api/proof route (never a direct storage URL).
    const src = `/api/proof/${campaignId}/${clip.id}`;
    return (
      <div className="space-y-1.5" data-testid="proof-screenshot">
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
          <span className="text-text-secondary">Proof:</span>
          <span>Analytics screenshot</span>
          {clip.analyticsScreenshotViewsAtSubmit !== null && (
            <span className="text-xs text-text-secondary">
              (accepted at {clip.analyticsScreenshotViewsAtSubmit.toLocaleString("en-US")} views)
            </span>
          )}
        </p>
        <a href={src} target="_blank" rel="noreferrer" className="block" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Analytics screenshot submitted by the creator"
            loading="lazy"
            className="max-h-[28rem] w-full max-w-lg rounded-xl border border-subtle bg-black object-contain"
          />
        </a>
      </div>
    );
  }
  if (clip.videoProofUrl) {
    return (
      <p className="flex items-center gap-1.5 text-sm" data-testid="proof-video-link">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
        <span className="text-text-secondary">Proof:</span>
        <a
          href={clip.videoProofUrl}
          target="_blank"
          rel="noreferrer"
          className="truncate underline-offset-2 hover:text-gold-light hover:underline"
        >
          {clip.videoProofUrl}
        </a>
      </p>
    );
  }
  return null;
}

export function Thumb({ clip }: { clip: ClipRow }) {
  return clip.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={clip.thumbnailUrl} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover ring-1 ring-subtle" referrerPolicy="no-referrer" />
  ) : (
    <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-semibold uppercase text-text-secondary ring-1 ring-subtle">
      {clip.platform.slice(0, 2)}
    </div>
  );
}

export function Stats({ clip }: { clip: ClipRow }) {
  // A manual view count is authoritative and doesn't go stale via the ScrapeCreators refresh cadence.
  const stale =
    clip.manualViews !== null
      ? null
      : !clip.lastRefreshedAt
        ? "stats pending"
        : Date.now() - clip.lastRefreshedAt.getTime() > STALE_AFTER_MS
          ? "stats may be outdated"
          : null;
  return (
    <span className="text-sm text-text-secondary">
      <span className="font-semibold text-text-primary">{effectiveViews(clip).toLocaleString()}</span> views
      {clip.manualViews !== null && <span className="ml-1 text-xs text-gold-light">(manual)</span>} ·{" "}
      <span className="font-semibold text-text-primary">{clip.likes.toLocaleString()}</span> likes
      {stale && <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">{stale}</span>}
    </span>
  );
}
