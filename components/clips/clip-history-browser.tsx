import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Callout, Card, SectionHeader, StatCard } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { clipApproveAction, setPostedAtAction } from "@/app/campaigns/clip-actions";
import { analyticsGateState } from "@/lib/clips/rules";
import type { ClipHistoryStatusFilter } from "@/lib/clips/service";
import { AutoSubmitSelect } from "./auto-submit-select";
import { DeleteClipButton } from "./delete-clip-button";
import { ClipApprovedBadge, Stats, StatusBadge, Thumb, money, type ClipRow } from "./clip-parts";

type Row = { clip: ClipRow; creatorUsername: string };

const STATUS_OPTIONS: { value: ClipHistoryStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "awaiting_analytics", label: "Waiting for Analytics" },
  { value: "pending", label: "Pending / awaiting review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "paid", label: "Paid" },
  { value: "clip_approved", label: "Clip Approved" },
];

const onDate = (d: Date) => d.toISOString().slice(0, 10);
const submittedOn = onDate;

/**
 * Mod/Admin/Owner only, and only for a clip whose post date was never captured — the sole way out
 * of an otherwise indefinitely-locked "awaiting_analytics" clip (analyticsGateState never guesses).
 */
function SetPostedAtForm({ campaignId, clipId }: { campaignId: string; clipId: string }) {
  return (
    <div className="mt-1.5 space-y-1" data-testid="set-posted-at">
      <p className="text-xs text-text-secondary">
        ScrapeCreators never returned a post date for this clip, so the 7-day window hasn't started. Confirm the real
        publish date to unlock it.
      </p>
      <ActionForm action={setPostedAtAction.bind(null, campaignId, clipId)} className="flex flex-wrap items-center gap-2">
        <Input type="date" name="postedAt" max={onDate(new Date())} required className="w-40" />
        <Button type="submit" variant="outline" size="sm">
          Confirm post date
        </Button>
      </ActionForm>
    </div>
  );
}

/**
 * A filterable view over the SAME clips already used elsewhere (getReviewQueue, getClipHistory) —
 * every clip ever submitted, or (on the creator's page) just their own. GET-based filter form so the
 * whole page stays server-rendered and shareable/bookmarkable as a URL, no client state needed.
 */
export function ClipHistoryBrowser({
  campaignId,
  basePath,
  status,
  from,
  to,
  summary,
  rows,
  showCreator,
  canDelete = false,
  canReview = false,
  canClipApprove = false,
}: {
  campaignId: string;
  basePath: string;
  status: ClipHistoryStatusFilter;
  from: string;
  to: string;
  summary: {
    total: number;
    awaitingAnalytics: number;
    pending: number;
    approved: number;
    rejected: number;
    paid: number;
    totalViews: number;
    approvedViews: number;
    clipApprovedAwaitingAnalytics: number;
    clipApprovedAnalyticsApproved: number;
  };
  rows: Row[];
  showCreator: boolean;
  /** Owner/Admin only — the server re-checks this regardless of what's rendered. */
  canDelete?: boolean;
  /** Mod/Admin/Owner — gates the manual post-date-confirmation form. Server re-checks regardless. */
  canReview?: boolean;
  /** Admin/Owner only — gates the Clip Approve button. Server re-checks regardless. */
  canClipApprove?: boolean;
}) {
  const filtered = status !== "all" || !!from || !!to;
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Clip history"
        description={showCreator ? "Every clip ever submitted to this campaign." : "Your submissions to this campaign."}
      />

      <Card innerClassName="p-4">
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
          <Field label="Status" className="w-full sm:w-56">
            <AutoSubmitSelect name="status" defaultValue={status}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </AutoSubmitSelect>
          </Field>
          <Field label="From">
            <Input type="date" name="from" defaultValue={from} className="w-40" />
          </Field>
          <Field label="To">
            <Input type="date" name="to" defaultValue={to} className="w-40" />
          </Field>
          <Button type="submit" size="sm">
            Filter
          </Button>
          {filtered && (
            <a href={basePath} className="text-sm text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
              Clear filters
            </a>
          )}
        </form>
      </Card>

      {/* The date range narrows this too, but the status tab never does — so it stays a stable overview while the list below is filtered by both. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="history-summary">
        <StatCard label="Submitted" value={summary.total.toLocaleString()} valueTestId="history-total" emphasis />
        <StatCard label="Waiting" value={summary.awaitingAnalytics.toLocaleString()} hint="for analytics" />
        <StatCard label="Pending" value={summary.pending.toLocaleString()} />
        <StatCard label="Approved" value={summary.approved.toLocaleString()} />
        <StatCard label="Rejected" value={summary.rejected.toLocaleString()} />
        <StatCard label="Paid" value={summary.paid.toLocaleString()} />
        <StatCard label="Total Views" value={summary.totalViews.toLocaleString()} valueTestId="history-total-views" hint="Every submitted clip, any status" />
        <StatCard
          label="Approved Views"
          value={summary.approvedViews.toLocaleString()}
          valueTestId="history-approved-views"
          hint="Clips that passed review (approved or paid)"
        />
      </div>

      {status === "clip_approved" && (
        <div className="grid grid-cols-2 gap-3" data-testid="clip-approved-breakdown">
          <StatCard
            label="Still awaiting analytics"
            value={summary.clipApprovedAwaitingAnalytics.toLocaleString()}
            valueTestId="clip-approved-awaiting"
            hint="Clip Approved, not yet through analytics review"
          />
          <StatCard
            label="Analytics Approved"
            value={summary.clipApprovedAnalyticsApproved.toLocaleString()}
            valueTestId="clip-approved-full"
            emphasis
            hint="Made it all the way through"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <Card innerClassName="py-10 text-center text-sm text-text-secondary">No clips match this filter.</Card>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5" data-testid="history-list">
          {rows.map(({ clip: c, creatorUsername }) => {
            const gate = analyticsGateState(c);
            return (
            <li key={c.id} data-testid="history-row">
              <Card innerClassName="flex flex-wrap items-center gap-4 p-4">
                <Thumb clip={c} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge clip={c} />
                    <ClipApprovedBadge clip={c} />
                    {showCreator && <span className="font-bold" data-testid="history-creator">{creatorUsername}</span>}
                    <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                      {c.url}
                    </a>
                  </div>
                  <div className="mt-1">
                    <Stats clip={c} />
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">Submitted {submittedOn(c.submittedAt)}</p>
                  {c.status === "rejected" && c.rejectionReason && (
                    <p className="mt-1 text-xs text-red-300">Rejected: {c.rejectionReason}</p>
                  )}
                  {gate.locked && (
                    <p className="mt-1 text-xs text-sky-300">
                      {gate.reason === "unknown_posted_at" ? "Post date unknown — needs manual confirmation." : `Unlocks ${onDate(gate.unlocksAt)}.`}
                    </p>
                  )}
                  {canReview && gate.locked && gate.reason === "unknown_posted_at" && (
                    <SetPostedAtForm campaignId={campaignId} clipId={c.id} />
                  )}
                  {canClipApprove && !c.clipApproved && (
                    <ActionForm action={clipApproveAction.bind(null, campaignId, c.id)} className="mt-1.5">
                      <Button type="submit" variant="outline" size="sm" data-testid="clip-approve">
                        Clip Approve
                      </Button>
                    </ActionForm>
                  )}
                </div>
                <span className="text-base font-extrabold text-gold-light" data-testid="history-payout">
                  {money(c.payout)}
                </span>
                {canDelete && <DeleteClipButton campaignId={campaignId} clipId={c.id} />}
              </Card>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
