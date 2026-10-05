import type { getClipHistory } from "@/lib/clips/service";
import { reviewAction } from "@/app/campaigns/clip-actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteClipButton } from "./delete-clip-button";
import { CreatorPostNumber, EditReasonForm, PostNumber, Thumb, money } from "./clip-parts";

type History = Awaited<ReturnType<typeof getClipHistory>>;

const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");

/** Paid and Rejected lists (newest first, up to 50 each). The money totals live in the stat cards. */
export function ClipHistory({
  history,
  campaignId,
  canDelete = false,
  canReverseRejection = false,
  canEditReason = false,
}: {
  history: History;
  campaignId: string;
  /** Owner/Admin only — the server re-checks this regardless of what's rendered. */
  canDelete?: boolean;
  /** Admin/Owner only — gates reversing a Rejected clip back to Approved. Server re-checks regardless. */
  canReverseRejection?: boolean;
  /** Mod/Admin/Owner -- gates the Edit reason control. Server re-checks (a Mod only for a reason they wrote). */
  canEditReason?: boolean;
}) {
  return (
    <>
      <section>
        <SectionHeader title="Paid" count={history.paid.length} />
        {history.paid.length === 0 && (
          <Card innerClassName="py-8 text-center text-sm text-text-secondary">Nothing paid yet.</Card>
        )}
        <ul className="grid grid-cols-1 gap-2.5">
          {history.paid.map(({ clip: c, creatorUsername, paidByUsername, postNumber, creatorPostNumber }) => (
            <li key={c.id} data-testid="paid-row">
              <Card innerClassName="flex items-center gap-4 p-4">
                <Thumb clip={c} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <PostNumber n={postNumber} />
                    <Badge status="paid" />
                    <span className="font-bold">{creatorUsername}</span>
                    <CreatorPostNumber n={creatorPostNumber} />
                    <span className="text-text-secondary">{c.views.toLocaleString()} views</span>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    Marked paid by {paidByUsername ?? "unknown"} · {when(c.paidAt)}
                  </p>
                </div>
                <span className="text-xl font-extrabold text-gold-light" data-testid="paid-amount">{money(c.payout)}</span>
                {canDelete && <DeleteClipButton campaignId={campaignId} clipId={c.id} />}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionHeader title="Rejected" count={history.rejected.length} />
        {history.rejected.length === 0 && (
          <Card innerClassName="py-8 text-center text-sm text-text-secondary">No rejected posts.</Card>
        )}
        <ul className="grid grid-cols-1 gap-2.5">
          {history.rejected.map(({ clip: c, creatorUsername, rejectedBy, postNumber, creatorPostNumber }) => (
            <li key={c.id} data-testid="rejected-row">
              <Card innerClassName="flex items-center gap-4 p-4">
                <Thumb clip={c} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <PostNumber n={postNumber} />
                    <Badge status="rejected" />
                    <span className="font-bold">{creatorUsername}</span>
                    <CreatorPostNumber n={creatorPostNumber} />
                    <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                      {c.url}
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-red-300">
                    Rejected{rejectedBy ? ` by ${rejectedBy}` : ""}: {c.rejectionReason ?? "no reason recorded"}
                  </p>
                  {canEditReason && <EditReasonForm campaignId={campaignId} clipId={c.id} reason={c.rejectionReason} />}
                  {canReverseRejection && (
                    <ActionForm action={reviewAction.bind(null, campaignId, c.id)} className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="intent" value="approve" />
                      <Button type="submit" variant="outline" size="sm" data-testid="reverse-rejection">
                        Analytics Approve
                      </Button>
                      <span className="text-xs text-text-secondary">Reverses this rejection — Admin/Owner only.</span>
                    </ActionForm>
                  )}
                </div>
                {canDelete && <DeleteClipButton campaignId={campaignId} clipId={c.id} />}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
