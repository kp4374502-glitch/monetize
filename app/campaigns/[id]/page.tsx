import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { getCampaignForUser, getRoleForCampaign } from "@/lib/auth/roles";
import { listBrands, listInviteLinks } from "@/lib/campaigns/service";
import { CREATOR_ROSTER_LIMIT, getBrandClipFeed, getClipHistory, getCreatorClips, getCreatorRoster, getReviewQueue } from "@/lib/clips/service";
import { CreatorRoster } from "@/components/clips/creator-roster";
import { CreatorClips } from "@/components/clips/creator-clips";
import { ReviewQueue } from "@/components/clips/review-queue";
import { ClipHistory } from "@/components/clips/clip-history";
import { BrandFeed } from "@/components/clips/brand-feed";
import { money } from "@/components/clips/clip-parts";
import { effectiveViews } from "@/lib/clips/rules";
import {
  addBrandAction,
  deleteCampaignAction,
  generateInviteLinkAction,
  removeBrandAction,
  revokeInviteLinkAction,
  setLifecycleAction,
} from "../actions";
import { refreshCampaignViewsAction } from "../clip-actions";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, SectionHeader, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Campaign dashboard: creators see their own clips; Brand sees a read-only feed; Mods/Admins/Owner see the review queue. */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const campaign = await getCampaignForUser(userId, id);
  if (!campaign) notFound(); // "not found" and "not yours" look identical
  const role = (await getRoleForCampaign(userId, id))!;

  const canInvite = role === "owner" || role === "admin" || role === "mod";
  const links = canInvite ? await listInviteLinks(userId, id) : [];
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const isAdmin = role === "owner" || role === "admin";
  const myClips = role === "creator" ? await getCreatorClips(userId, id) : [];
  const brandFeed = role === "brand" ? await getBrandClipFeed(userId, id) : null;
  const queue = canInvite ? await getReviewQueue(userId, id) : null;
  const history = canInvite ? await getClipHistory(userId, id) : null;
  const roster = canInvite ? await getCreatorRoster(userId, id) : null;
  const brands = isAdmin ? await listBrands(userId, id) : [];

  // Creator stat cards come from their own clip list (no extra query).
  const myViews = myClips.reduce((n, c) => n + effectiveViews(c), 0);
  const myEarned = myClips.filter((c) => c.status === "approved").reduce((n, c) => n + Number(c.payout ?? 0), 0);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gold-light">{campaign.brandName}</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl" data-testid="campaign-name">{campaign.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            Your role: <Badge status={role} data-testid="role" />
            <span className="text-subtle">·</span>
            Status: <Badge status={campaign.status} />
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/campaigns/${id}/history`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            History
          </Link>
          {isAdmin && (
            <>
              {(["pause", "close", "archive", "reopen"] as const).map((a) => {
                // Each action's resulting status, so the button for the campaign's CURRENT status
                // is the one visibly disabled/highlighted — otherwise all four look equally
                // clickable and nothing here hints that e.g. "pause" already happened.
                const resultStatus = { pause: "paused", close: "closed", archive: "archived", reopen: "active" }[a];
                const isCurrent = campaign.status === resultStatus;
                return (
                  <form key={a} action={setLifecycleAction.bind(null, id, a)}>
                    <Button
                      variant={isCurrent ? "primary" : "outline"}
                      size="sm"
                      type="submit"
                      className="capitalize"
                      disabled={isCurrent}
                    >
                      {a}
                    </Button>
                  </form>
                );
              })}
              {role === "owner" && (
                <form action={deleteCampaignAction.bind(null, id)}>
                  <Button variant="danger" size="sm" type="submit">Delete</Button>
                </form>
              )}
            </>
          )}
        </div>
      </header>

      {role === "creator" && (
        <div className="grid grid-cols-3 gap-3" data-testid="totals">
          <StatCard label="Clips" value={myClips.length.toLocaleString()} />
          <StatCard label="Total views" value={myViews.toLocaleString()} />
          <StatCard label="Earned" value={money(myEarned)} emphasis />
        </div>
      )}
      {history && queue && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="totals">
          <StatCard label="Paid so far" value={money(history.totals.paid)} valueTestId="total-paid" emphasis />
          <StatCard label="Owed" value={money(history.totals.owed)} valueTestId="total-owed" hint="approved, unpaid" />
          <StatCard label="Waiting on you" value={queue.pending.length} hint="clips to review" />
          <StatCard label="Awaiting payment" value={queue.awaitingPayment.length} hint="approved clips" />
        </div>
      )}

      {role === "creator" && <CreatorClips campaignId={id} clips={myClips} viewMinimum={campaign.viewMinimum} />}
      {brandFeed && <BrandFeed rows={brandFeed.rows} stats={brandFeed.stats} />}
      {roster && <CreatorRoster roster={roster} limit={CREATOR_ROSTER_LIMIT} />}
      {queue && (
        <>
          <ActionForm action={refreshCampaignViewsAction.bind(null, id)} className="flex justify-end">
            <Button type="submit" variant="outline" size="sm" data-testid="refresh-campaign-views">
              Refresh all views now
            </Button>
          </ActionForm>
          <ReviewQueue campaignId={id} pending={queue.pending} awaitingPayment={queue.awaitingPayment} canDelete={isAdmin} />
        </>
      )}
      {history && <ClipHistory history={history} campaignId={id} canDelete={isAdmin} />}

      {canInvite && (
        <section>
          <SectionHeader
            title="Invite links"
            description="Anyone with an active link can join this campaign as a creator."
            action={
              <form action={generateInviteLinkAction.bind(null, id)}>
                <Button type="submit" size="sm">Generate invite link</Button>
              </form>
            }
          />
          <Card>
            {links.length === 0 && <p className="text-sm text-text-secondary">No invite links yet.</p>}
            <ul className="grid grid-cols-1 gap-2.5">
              {links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="invite-row">
                  <code
                    className={`min-w-0 max-w-full truncate rounded-lg bg-white/5 px-2.5 py-1 ${l.revoked ? "text-text-secondary line-through" : "text-gold-light"}`}
                  >{`${origin}/invite/${l.code}`}</code>
                  {l.revoked ? (
                    <Badge status="archived">revoked</Badge>
                  ) : (
                    <form action={revokeInviteLinkAction.bind(null, id, l.id)}>
                      <Button variant="outline" size="sm" type="submit">Revoke</Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {isAdmin && (
        <section>
          <SectionHeader
            title="Brand viewers"
            description="Read-only access for this campaign's brand — sees every clip and aggregate stats, never who submitted it."
            action={
              <form action={addBrandAction.bind(null, id)} className="flex items-center gap-2">
                <Input name="username" placeholder="Username" required className="w-40" />
                <Button type="submit" size="sm">Add</Button>
              </form>
            }
          />
          <Card>
            {brands.length === 0 && <p className="text-sm text-text-secondary">No brand viewers yet.</p>}
            <ul className="grid grid-cols-1 gap-2.5">
              {brands.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="brand-row">
                  <span className="font-bold">{b.username}</span>
                  <form action={removeBrandAction.bind(null, id, b.id)}>
                    <Button variant="outline" size="sm" type="submit">Remove</Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </main>
  );
}
