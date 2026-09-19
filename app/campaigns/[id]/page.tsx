import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { getCampaignForUser, getRoleForCampaign } from "@/lib/auth/roles";
import { listInviteLinks } from "@/lib/campaigns/service";
import { getClipHistory, getCreatorClips, getReviewQueue } from "@/lib/clips/service";
import { CreatorClips } from "@/components/clips/creator-clips";
import { ReviewQueue } from "@/components/clips/review-queue";
import { ClipHistory } from "@/components/clips/clip-history";
import {
  deleteCampaignAction,
  generateInviteLinkAction,
  revokeInviteLinkAction,
  setLifecycleAction,
} from "../actions";
import { Button } from "@/components/ui/button";

/** Campaign dashboard: creators see their own clips; Mods/Admins/Owner see the review queue. */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const campaign = await getCampaignForUser(userId, id);
  if (!campaign) notFound(); // "not found" and "not yours" look identical
  const role = (await getRoleForCampaign(userId, id))!;

  const canInvite = role !== "creator";
  const links = canInvite ? await listInviteLinks(userId, id) : [];
  const origin = `${(await headers()).get("x-forwarded-proto") ?? "http"}://${(await headers()).get("host")}`;
  const isAdmin = role === "owner" || role === "admin";
  const myClips = role === "creator" ? await getCreatorClips(userId, id) : [];
  const queue = canInvite ? await getReviewQueue(userId, id) : null;
  const history = canInvite ? await getClipHistory(userId, id) : null;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="text-sm text-text-secondary">{campaign.brandName}</p>
      <h1 className="text-3xl font-bold" data-testid="campaign-name">{campaign.name}</h1>
      <p className="mt-1 text-text-secondary">
        Your role: <span data-testid="role">{role}</span> · Status: {campaign.status}
      </p>

      {role === "creator" && <CreatorClips campaignId={id} clips={myClips} viewMinimum={campaign.viewMinimum} />}
      {queue && <ReviewQueue campaignId={id} pending={queue.pending} awaitingPayment={queue.awaitingPayment} />}

      {history && <ClipHistory history={history} />}

      {isAdmin && (
        <section className="mt-8 flex flex-wrap gap-2">
          {(["pause", "close", "archive", "reopen"] as const).map((a) => (
            <form key={a} action={setLifecycleAction.bind(null, id, a)}>
              <Button variant="outline" type="submit" className="capitalize">{a}</Button>
            </form>
          ))}
          {role === "owner" && (
            <form action={deleteCampaignAction.bind(null, id)}>
              <Button variant="danger" type="submit">Delete</Button>
            </form>
          )}
        </section>
      )}

      {canInvite && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Invite links</h2>
          <form action={generateInviteLinkAction.bind(null, id)}>
            <Button type="submit">Generate invite link</Button>
          </form>
          <ul className="mt-4 grid gap-2 text-sm">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4" data-testid="invite-row">
                <code className={l.revoked ? "line-through text-text-secondary" : ""}>{`${origin}/invite/${l.code}`}</code>
                {l.revoked ? (
                  <span className="text-text-secondary">revoked</span>
                ) : (
                  <form action={revokeInviteLinkAction.bind(null, id, l.id)}>
                    <Button variant="outline" type="submit">Revoke</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
