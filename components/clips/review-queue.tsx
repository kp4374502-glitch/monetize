import { CheckCircle2, TriangleAlert } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Callout, Card, SectionHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { markPaidAction, reviewAction, setManualViewsAction, setPctAction } from "@/app/campaigns/clip-actions";
import { canSetManualViews, hasAnalyticsProof } from "@/lib/clips/rules";
import { DeleteClipButton } from "./delete-clip-button";
import { Stats, StatusBadge, Thumb, money, type ClipRow } from "./clip-parts";

type Row = { clip: ClipRow; creatorUsername: string };

function ProofLine({ clip, campaignId, missingId }: { clip: ClipRow; campaignId: string; missingId?: string }) {
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
  return clip.videoProofUrl ? (
    <p className="flex items-center gap-1.5 text-sm">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
      <span className="text-text-secondary">Proof:</span>
      <a href={clip.videoProofUrl} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:text-gold-light hover:underline">
        {clip.videoProofUrl}
      </a>
    </p>
  ) : (
    <Callout tone="warning" data-testid={missingId}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Analytics proof missing — earns $0 until the creator attaches it.</span>
    </Callout>
  );
}

function PctForm({ campaignId, clip }: { campaignId: string; clip: ClipRow }) {
  return (
    <ActionForm action={setPctAction.bind(null, campaignId, clip.id)} className="flex flex-wrap items-center gap-2">
      <Input
        name="pct"
        type="number"
        step="0.01"
        min="0"
        max="100"
        placeholder="Qualifying audience %"
        defaultValue={clip.qualifyingAudiencePct ?? ""}
        disabled={!hasAnalyticsProof(clip)}
        className="w-52"
        required
      />
      <Button type="submit" variant="outline" size="sm" disabled={!hasAnalyticsProof(clip)}>Save %</Button>
      <span className="text-sm text-text-secondary" data-testid="queue-payout">
        Payout: <span className="font-bold text-gold-light">{money(clip.payout)}</span>
      </span>
    </ActionForm>
  );
}

/**
 * Only shown for a clip ScrapeCreators has confirmed is an Instagram photo/carousel — that post
 * type has no automatic view number at all, so a Mod/Admin/Owner enters one after checking the
 * creator's analytics proof video themselves. Never offered for a real video (the auto-fetched
 * number is trusted there); the service re-checks this regardless of what the UI shows.
 */
function ManualViewsForm({ campaignId, clip }: { campaignId: string; clip: ClipRow }) {
  return (
    <div className="space-y-1 border-t border-subtle pt-2.5" data-testid="manual-views">
      <p className="text-xs text-text-secondary">
        ScrapeCreators has no view data for this post — it's a photo/carousel, not a video. After checking the
        creator's proof video, you can enter the view count shown on their private analytics screen.
      </p>
      <ActionForm action={setManualViewsAction.bind(null, campaignId, clip.id)} className="flex flex-wrap items-center gap-2">
        <Input
          name="manualViews"
          type="number"
          step="1"
          min="0"
          placeholder="Manual view count"
          defaultValue={clip.manualViews ?? ""}
          className="w-44"
          data-testid="manual-views-input"
        />
        <Button type="submit" variant="outline" size="sm">
          {clip.manualViews !== null ? "Update views" : "Set views"}
        </Button>
        {clip.manualViews !== null && <span className="text-xs text-text-secondary">Leave blank and submit to clear it.</span>}
      </ActionForm>
    </div>
  );
}

export function ReviewQueue({
  campaignId,
  pending,
  awaitingPayment,
  canDelete = false,
}: {
  campaignId: string;
  pending: Row[];
  awaitingPayment: Row[];
  /** Owner/Admin only — the server re-checks this regardless of what's rendered. */
  canDelete?: boolean;
}) {
  return (
    <>
      <section>
        <SectionHeader
          title="Review queue"
          count={pending.length}
          description={pending.length ? `${pending.length} waiting on you` : undefined}
        />
        {pending.length === 0 && (
          <Card innerClassName="py-10 text-center text-sm text-text-secondary">Nothing waiting on you. 🎉</Card>
        )}
        <ul className="grid grid-cols-1 gap-3">
          {pending.map(({ clip: c, creatorUsername }) => (
            <li key={c.id} data-testid="queue-row">
              <Card innerClassName="p-4">
                <div className="flex gap-4">
                  <Thumb clip={c} />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge clip={c} />
                      <span className="text-sm font-bold" data-testid="queue-creator">{creatorUsername}</span>
                      <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-sm text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                        {c.url}
                      </a>
                    </div>
                    <Stats clip={c} />
                    {c.flaggedDuplicate && (
                      <Callout tone="warning" data-testid="dup-flag">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{c.flaggedReason}</span>
                      </Callout>
                    )}
                    <ProofLine clip={c} campaignId={campaignId} missingId="proof-missing" />
                    <PctForm campaignId={campaignId} clip={c} />
                    {canSetManualViews(c) && <ManualViewsForm campaignId={campaignId} clip={c} />}
                    <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
                      <ActionForm action={reviewAction.bind(null, campaignId, c.id)} className="flex flex-1 flex-wrap items-center gap-2">
                        <Input name="reason" placeholder="Reason (required to reject)" className="min-w-56 flex-1" />
                        <Button type="submit" name="intent" value="approve" formNoValidate size="sm">Approve</Button>
                        <Button type="submit" name="intent" value="reject" variant="danger" formNoValidate size="sm">Reject</Button>
                      </ActionForm>
                      {canDelete && <DeleteClipButton campaignId={campaignId} clipId={c.id} />}
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionHeader title="Approved — awaiting payment" count={awaitingPayment.length} />
        {awaitingPayment.length === 0 && (
          <Card innerClassName="py-8 text-center text-sm text-text-secondary">No approved clips waiting to be paid.</Card>
        )}
        <ul className="grid grid-cols-1 gap-3">
          {awaitingPayment.map(({ clip: c, creatorUsername }) => (
            <li key={c.id} data-testid="payment-row">
              <Card innerClassName="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <StatusBadge clip={c} />
                    <span className="font-bold">{creatorUsername}</span>
                    <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                      {c.url}
                    </a>
                    <Stats clip={c} />
                    <span className="text-base font-extrabold text-gold-light" data-testid="payment-amount">{money(c.payout)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionForm action={markPaidAction.bind(null, campaignId, c.id)}>
                      <Button type="submit" size="sm" disabled={c.payout === null}>Mark paid</Button>
                    </ActionForm>
                    {canDelete && <DeleteClipButton campaignId={campaignId} clipId={c.id} />}
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  <ProofLine clip={c} campaignId={campaignId} />
                  <PctForm campaignId={campaignId} clip={c} />
                  {canSetManualViews(c) && <ManualViewsForm campaignId={campaignId} clip={c} />}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
