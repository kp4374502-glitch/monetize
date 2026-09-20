import { CheckCircle2, TriangleAlert } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Callout, Card, SectionHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { markPaidAction, reviewAction, setPctAction } from "@/app/campaigns/clip-actions";
import { Stats, StatusBadge, Thumb, money, type ClipRow } from "./clip-parts";

type Row = { clip: ClipRow; creatorUsername: string };

function ProofLine({ clip, missingId }: { clip: ClipRow; missingId?: string }) {
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
      <span>Video proof missing — earns $0 until the creator attaches it.</span>
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
        disabled={!clip.videoProofUrl}
        className="w-52"
        required
      />
      <Button type="submit" variant="outline" size="sm" disabled={!clip.videoProofUrl}>Save %</Button>
      <span className="text-sm text-text-secondary" data-testid="queue-payout">
        Payout: <span className="font-bold text-gold-light">{money(clip.payout)}</span>
      </span>
    </ActionForm>
  );
}

export function ReviewQueue({
  campaignId,
  pending,
  awaitingPayment,
}: {
  campaignId: string;
  pending: Row[];
  awaitingPayment: Row[];
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
        <ul className="grid gap-3">
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
                    <ProofLine clip={c} missingId="proof-missing" />
                    <PctForm campaignId={campaignId} clip={c} />
                    <ActionForm action={reviewAction.bind(null, campaignId, c.id)} className="flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
                      <Input name="reason" placeholder="Reason (required to reject)" className="min-w-56 flex-1" />
                      <Button type="submit" name="intent" value="approve" formNoValidate size="sm">Approve</Button>
                      <Button type="submit" name="intent" value="reject" variant="danger" formNoValidate size="sm">Reject</Button>
                    </ActionForm>
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
        <ul className="grid gap-3">
          {awaitingPayment.map(({ clip: c, creatorUsername }) => (
            <li key={c.id} data-testid="payment-row">
              <Card innerClassName="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm">
                    <StatusBadge clip={c} />
                    <span className="font-bold">{creatorUsername}</span>
                    <span className="text-text-secondary">{c.views.toLocaleString()} views</span>
                    <span className="text-base font-extrabold text-gold-light" data-testid="payment-amount">{money(c.payout)}</span>
                  </div>
                  <ActionForm action={markPaidAction.bind(null, campaignId, c.id)}>
                    <Button type="submit" size="sm" disabled={c.payout === null}>Mark paid</Button>
                  </ActionForm>
                </div>
                <div className="mt-3 space-y-2.5">
                  <ProofLine clip={c} />
                  <PctForm campaignId={campaignId} clip={c} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
