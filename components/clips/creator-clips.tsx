import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attachProofAction, refreshViewsAction, submitClipAction } from "@/app/campaigns/clip-actions";
import { StatusBadge, Stats, Thumb, money, type ClipRow } from "./clip-parts";

/** Creator view: add a clip, and see ONLY their own clips. No payout formula or budget shown. */
export function CreatorClips({ campaignId, clips, viewMinimum }: { campaignId: string; clips: ClipRow[]; viewMinimum: number }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 font-semibold">Add a clip</h2>
      <ActionForm action={submitClipAction.bind(null, campaignId)} className="flex flex-wrap items-start gap-2">
        <Input name="url" placeholder="Paste a TikTok, Instagram or YouTube link" required className="min-w-72 flex-1" />
        <Button type="submit">Submit</Button>
      </ActionForm>
      <p className="mt-1 text-xs text-text-secondary">Clips earn once they pass {viewMinimum.toLocaleString()} views and are approved with video proof.</p>

      <h2 className="mb-2 mt-8 font-semibold">Your clips</h2>
      {clips.length === 0 && <p className="text-sm text-text-secondary">No clips yet.</p>}
      <ul className="grid gap-3">
        {clips.map((c) => (
          <li key={c.id} className="rounded-md border border-subtle p-3" data-testid="my-clip">
            <div className="flex gap-3">
              <Thumb clip={c} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge clip={c} />
                  <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-sm underline">{c.url}</a>
                </div>
                <Stats clip={c} />
                <p className="text-sm">Earnings: <span data-testid="my-earnings">{c.status === "approved" ? money(c.payout) : "—"}</span></p>
                {c.status === "rejected" && c.rejectionReason && (
                  <p className="mt-1 text-sm text-red-400" data-testid="rejection-reason">Rejected: {c.rejectionReason}</p>
                )}
                {c.paidStatus === "unpaid" && (
                  <ActionForm action={attachProofAction.bind(null, campaignId, c.id)} className="mt-2 flex flex-wrap items-center gap-2">
                    <Input name="proofUrl" placeholder={c.videoProofUrl ? "Replace video proof link" : "Video proof link (YouTube unlisted / Drive)"} required className="min-w-64 flex-1" />
                    <Button type="submit" variant="outline">{c.videoProofUrl ? "Replace proof" : "Submit proof"}</Button>
                  </ActionForm>
                )}
                {c.videoProofUrl && <p className="mt-1 text-xs text-text-secondary">Proof submitted ✓</p>}
                <ActionForm action={refreshViewsAction.bind(null, campaignId, c.id)} className="mt-2">
                  <Button type="submit" variant="outline">Refresh views now</Button>
                </ActionForm>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
