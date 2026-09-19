import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markPaidAction, reviewAction, setPctAction } from "@/app/campaigns/clip-actions";
import { Stats, StatusBadge, Thumb, money, type ClipRow } from "./clip-parts";

type Row = { clip: ClipRow; creatorUsername: string };

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
    <section className="mt-8">
      <h2 className="mb-2 font-semibold">Review queue ({pending.length} waiting)</h2>
      {pending.length === 0 && <p className="text-sm text-text-secondary">Nothing waiting on you.</p>}
      <ul className="grid gap-3">
        {pending.map(({ clip: c, creatorUsername }) => (
          <li key={c.id} className="rounded-md border border-subtle p-3" data-testid="queue-row">
            <div className="flex gap-3">
              <Thumb clip={c} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge clip={c} />
                  <span className="text-sm font-medium" data-testid="queue-creator">{creatorUsername}</span>
                  <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-sm underline">{c.url}</a>
                </div>
                <Stats clip={c} />
                {c.flaggedDuplicate && (
                  <p className="mt-1 text-sm text-gold-light" data-testid="dup-flag">⚠ {c.flaggedReason}</p>
                )}
                {c.videoProofUrl ? (
                  <p className="mt-1 text-sm">Proof: <a href={c.videoProofUrl} target="_blank" rel="noreferrer" className="underline">{c.videoProofUrl}</a></p>
                ) : (
                  <p className="mt-1 text-sm text-gold-light" data-testid="proof-missing">⚠ Video proof missing — earns $0 until attached.</p>
                )}

                <ActionForm action={setPctAction.bind(null, campaignId, c.id)} className="mt-2 flex flex-wrap items-center gap-2">
                  <Input name="pct" type="number" step="0.01" min="0" max="100" placeholder="Qualifying audience %" defaultValue={c.qualifyingAudiencePct ?? ""} disabled={!c.videoProofUrl} className="w-56" required />
                  <Button type="submit" variant="outline" disabled={!c.videoProofUrl}>Save %</Button>
                  <span className="text-sm" data-testid="queue-payout">Payout: {money(c.payout)}</span>
                </ActionForm>

                <ActionForm action={reviewAction.bind(null, campaignId, c.id)} className="mt-2 flex flex-wrap items-center gap-2">
                  <Input name="reason" placeholder="Reason (required to reject)" className="min-w-56 flex-1" />
                  <Button type="submit" name="intent" value="approve" formNoValidate>Approve</Button>
                  <Button type="submit" name="intent" value="reject" variant="danger" formNoValidate>Reject</Button>
                </ActionForm>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 mt-8 font-semibold">Approved — awaiting payment ({awaitingPayment.length})</h2>
      <ul className="grid gap-3">
        {awaitingPayment.map(({ clip: c, creatorUsername }) => (
          <li key={c.id} className="rounded-md border border-subtle p-3" data-testid="payment-row">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium">{creatorUsername}</span> · {c.views.toLocaleString()} views · <span data-testid="payment-amount">{money(c.payout)}</span>
              </div>
              <ActionForm action={markPaidAction.bind(null, campaignId, c.id)}>
                <Button type="submit" disabled={c.payout === null}>Mark paid</Button>
              </ActionForm>
            </div>
            {c.videoProofUrl ? (
              <p className="mt-1 text-sm">Proof: <a href={c.videoProofUrl} target="_blank" rel="noreferrer" className="underline">{c.videoProofUrl}</a></p>
            ) : (
              <p className="mt-1 text-sm text-gold-light">⚠ Video proof missing — waiting on the creator. Earns $0 until it's attached.</p>
            )}
            <ActionForm action={setPctAction.bind(null, campaignId, c.id)} className="mt-2 flex flex-wrap items-center gap-2">
              <Input name="pct" type="number" step="0.01" min="0" max="100" placeholder="Qualifying audience %" defaultValue={c.qualifyingAudiencePct ?? ""} disabled={!c.videoProofUrl} className="w-56" required />
              <Button type="submit" variant="outline" disabled={!c.videoProofUrl}>Save %</Button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </section>
  );
}
