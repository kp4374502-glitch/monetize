import { TriangleAlert } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Callout, Card, SectionHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clipApproveAction, markPaidAction, reviewAction } from "@/app/campaigns/clip-actions";
import { canRejectInline, canSetManualViews } from "@/lib/clips/rules";
import { DeleteClipButton } from "./delete-clip-button";
import { AnalyticsProof, ClipApprovedBadge, CreatorPostNumber, InlineRejectForm, ManualViewsForm, PctForm, PostNumber, Stats, StatusBadge, Thumb, money, type ClipRow } from "./clip-parts";

function ClipApproveButton({ campaignId, clip }: { campaignId: string; clip: ClipRow }) {
  if (clip.clipApproved) return null;
  return (
    <ActionForm action={clipApproveAction.bind(null, campaignId, clip.id)}>
      <Button type="submit" variant="outline" size="sm" data-testid="clip-approve">
        Post Approve
      </Button>
    </ActionForm>
  );
}

type Row = { clip: ClipRow; creatorUsername: string; postNumber: number; creatorPostNumber: number };

/** Adds the "proof missing" nudge on top of the shared AnalyticsProof display — only the active review queue needs it. */
function ProofLine({ clip, campaignId, missingId }: { clip: ClipRow; campaignId: string; missingId?: string }) {
  const proof = AnalyticsProof({ clip, campaignId });
  if (proof) return proof;
  return (
    <Callout tone="warning" data-testid={missingId}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Analytics proof missing — earns $0 until the creator attaches it.</span>
    </Callout>
  );
}

export function ReviewQueue({
  campaignId,
  pending,
  awaitingPayment,
  canDelete = false,
  canClipApprove = false,
  canMarkPaid = false,
  requireAnalyticsProof = true,
}: {
  campaignId: string;
  pending: Row[];
  awaitingPayment: Row[];
  /** false = this campaign pays on views alone: no proof line, no audience % box, plain "Approve". */
  requireAnalyticsProof?: boolean;
  /** Owner/Admin only — the server re-checks this regardless of what's rendered. */
  canDelete?: boolean;
  /** Admin/Owner only — gates the Post Approve button. Mod keeps Analytics Approve and Reject, unchanged. */
  canClipApprove?: boolean;
  /** Owner/Admin only. Server re-checks regardless. */
  canMarkPaid?: boolean;
}) {
  // A campaign without analytics has a single approval step: the plain "Approve" button. The separate
  // Post Approve content check isn't offered there (it never gated payment, so nothing depends on it).
  const showPostApprove = canClipApprove && requireAnalyticsProof;
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
          {pending.map(({ clip: c, creatorUsername, postNumber, creatorPostNumber }) => (
            <li key={c.id} data-testid="queue-row">
              <Card innerClassName="p-4">
                <div className="flex gap-4">
                  <Thumb clip={c} />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PostNumber n={postNumber} />
                      <StatusBadge clip={c} analytics={requireAnalyticsProof} />
                      <ClipApprovedBadge clip={c} />
                      <span className="text-sm font-bold" data-testid="queue-creator">{creatorUsername}</span>
                      <CreatorPostNumber n={creatorPostNumber} />
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
                    {requireAnalyticsProof ? (
                      <>
                        <ProofLine clip={c} campaignId={campaignId} missingId="proof-missing" />
                        <PctForm campaignId={campaignId} clip={c} />
                      </>
                    ) : (
                      <p className="text-sm text-text-secondary" data-testid="queue-payout">
                        Payout: <span className="font-bold text-gold-light">{money(c.payout)}</span>
                      </p>
                    )}
                    {canSetManualViews(c) && <ManualViewsForm campaignId={campaignId} clip={c} />}
                    <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
                      {showPostApprove && <ClipApproveButton campaignId={campaignId} clip={c} />}
                      <ActionForm action={reviewAction.bind(null, campaignId, c.id)} className="flex flex-1 flex-wrap items-center gap-2">
                        <Input name="reason" placeholder="Reason (required to reject)" className="min-w-56 flex-1" />
                        <Button type="submit" name="intent" value="approve" formNoValidate size="sm">
                          {requireAnalyticsProof ? "Analytics Approve" : "Approve"}
                        </Button>
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
        <SectionHeader title={requireAnalyticsProof ? "Analytics Approved — awaiting payment" : "Approved — awaiting payment"} count={awaitingPayment.length} />
        {awaitingPayment.length === 0 && (
          <Card innerClassName="py-8 text-center text-sm text-text-secondary">No approved posts waiting to be paid.</Card>
        )}
        <ul className="grid grid-cols-1 gap-3">
          {awaitingPayment.map(({ clip: c, creatorUsername, postNumber, creatorPostNumber }) => (
            <li key={c.id} data-testid="payment-row">
              <Card innerClassName="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <PostNumber n={postNumber} />
                    <StatusBadge clip={c} analytics={requireAnalyticsProof} />
                    <ClipApprovedBadge clip={c} />
                    <span className="font-bold">{creatorUsername}</span>
                    <CreatorPostNumber n={creatorPostNumber} />
                    <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                      {c.url}
                    </a>
                    <Stats clip={c} />
                    <span className="text-base font-medium tracking-[-0.03em] text-gold-light" data-testid="payment-amount">{money(c.payout)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {showPostApprove && <ClipApproveButton campaignId={campaignId} clip={c} />}
                    {canMarkPaid && (
                      <ActionForm action={markPaidAction.bind(null, campaignId, c.id)}>
                        <Button type="submit" size="sm" disabled={c.payout === null}>Mark paid</Button>
                      </ActionForm>
                    )}
                    {canRejectInline(c) && <InlineRejectForm campaignId={campaignId} clipId={c.id} />}
                    {canDelete && <DeleteClipButton campaignId={campaignId} clipId={c.id} />}
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  {requireAnalyticsProof && <ProofLine clip={c} campaignId={campaignId} />}
                  {requireAnalyticsProof && <PctForm campaignId={campaignId} clip={c} />}
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
