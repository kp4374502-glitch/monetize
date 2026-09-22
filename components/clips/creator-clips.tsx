import { CheckCircle2, TriangleAlert } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Callout, Card, SectionHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { attachProofAction, refreshViewsAction, submitClipAction } from "@/app/campaigns/clip-actions";
import { hasAnalyticsProof } from "@/lib/clips/rules";
import { StatusBadge, Stats, Thumb, money, type ClipRow } from "./clip-parts";

/** Creator view: add a clip, and see ONLY their own clips. No payout formula or budget shown. */
export function CreatorClips({ campaignId, clips, viewMinimum }: { campaignId: string; clips: ClipRow[]; viewMinimum: number }) {
  return (
    <>
      <Card>
        <SectionHeader
          title="Add a clip"
          description={`Clips earn once they pass ${viewMinimum.toLocaleString()} views and are approved with analytics proof.`}
        />
        <ActionForm action={submitClipAction.bind(null, campaignId)} className="flex flex-wrap items-start gap-2">
          <Input name="url" placeholder="Paste a TikTok, Instagram or YouTube link" required className="min-w-72 flex-1" />
          <Button type="submit">Submit</Button>
        </ActionForm>
      </Card>

      <section>
        <SectionHeader title="Your clips" count={clips.length} />
        {clips.length === 0 && (
          <Card innerClassName="py-10 text-center text-sm text-text-secondary">
            No clips yet — paste a link above to submit your first one.
          </Card>
        )}
        {/* grid-cols-1 = minmax(0,1fr): without it a long unbreakable URL widens the whole column on phones */}
        <ul className="grid grid-cols-1 gap-3">
          {clips.map((c) => (
            <li key={c.id} data-testid="my-clip">
              <Card innerClassName="p-4">
                <div className="flex gap-4">
                  <Thumb clip={c} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge clip={c} />
                      <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-sm text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                        {c.url}
                      </a>
                    </div>
                    <Stats clip={c} />
                    <p className="text-sm text-text-secondary">
                      Earnings:{" "}
                      <span className="font-bold text-gold-light" data-testid="my-earnings">
                        {c.status === "approved" ? money(c.payout) : "—"}
                      </span>
                    </p>

                    {c.status === "rejected" && c.rejectionReason && (
                      <Callout tone="danger" data-testid="rejection-reason">
                        <span>
                          <span className="font-semibold">Rejected:</span> {c.rejectionReason}
                        </span>
                      </Callout>
                    )}

                    {hasAnalyticsProof(c) ? (
                      <div className="space-y-1.5">
                        <p className="flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Proof submitted{c.analyticsScreenshotPathname && " (screenshot)"}
                        </p>
                        {c.analyticsScreenshotPathname && (
                          <a href={`/api/proof/${campaignId}/${c.id}`} target="_blank" rel="noreferrer" className="inline-block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/proof/${campaignId}/${c.id}`}
                              alt="Your analytics screenshot"
                              loading="lazy"
                              className="h-24 w-auto rounded-lg border border-subtle bg-black object-contain"
                            />
                          </a>
                        )}
                      </div>
                    ) : (
                      c.status !== "rejected" && (
                        <Callout tone="warning">
                          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          <div className="min-w-0 space-y-2">
                            <p>Analytics proof needed — this clip earns $0 until you attach it.</p>
                            <div data-testid="proof-instructions" className="space-y-1.5 text-sm text-amber-100/90">
                              <p className="font-semibold">To fix this:</p>
                              <ol className="list-decimal space-y-1 pl-5">
                                <li>Start recording your screen from the home screen of your phone or computer.</li>
                                <li>Play this post for 2–3 seconds, then open its analytics.</li>
                                <li>Show your full audience breakdown before you stop recording.</li>
                                <li>Upload the video to YouTube (unlisted) or Google Drive, then paste the link below.</li>
                              </ol>
                              <p className="break-all pt-1 text-xs text-text-secondary">
                                Example of a valid proof link:{" "}
                                {/* Clickable but deliberately low-key: inherits the muted colour, underlines only on hover. */}
                                <a
                                  href="https://youtube.com/shorts/jxGG6URvhZQ?si=KbmrzYhnU9LV-Nh8"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline-offset-2 hover:underline"
                                >
                                  https://youtube.com/shorts/jxGG6URvhZQ?si=KbmrzYhnU9LV-Nh8
                                </a>
                              </p>
                            </div>
                          </div>
                        </Callout>
                      )
                    )}

                    <div className="flex flex-wrap items-start gap-2 pt-1">
                      {c.paidStatus === "unpaid" && (
                        <ActionForm action={attachProofAction.bind(null, campaignId, c.id)} className="flex min-w-64 flex-1 flex-wrap items-center gap-2">
                          <Input
                            name="proofUrl"
                            placeholder={hasAnalyticsProof(c) ? "Replace analytics proof link" : "Analytics proof link (YouTube unlisted / Drive)"}
                            required
                            className="min-w-56 flex-1"
                          />
                          <Button type="submit" variant="outline" size="sm">{hasAnalyticsProof(c) ? "Replace proof" : "Submit proof"}</Button>
                        </ActionForm>
                      )}
                      <ActionForm action={refreshViewsAction.bind(null, campaignId, c.id)}>
                        <Button type="submit" variant="ghost" size="sm">Refresh views now</Button>
                      </ActionForm>
                    </div>
                    {/* Task 5 Part 2: screenshot upload removed — a video link is the only new-proof method now.
                       An existing screenshot (rendered above via hasAnalyticsProof) still counts and stays valid. */}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
