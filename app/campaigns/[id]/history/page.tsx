import { notFound, redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { getCampaignForUser, getRoleForCampaign } from "@/lib/auth/roles";
import { getCampaignCreator, getMyClipHistory, getReviewerClipHistory, type ClipHistoryStatusFilter } from "@/lib/clips/service";
import { ClipHistoryBrowser } from "@/components/clips/clip-history-browser";
import { Badge } from "@/components/ui/badge";

const STATUS_VALUES: readonly ClipHistoryStatusFilter[] = [
  "all",
  "waiting_post_approved",
  "waiting_analytics_approved",
  "waiting_audience_pct",
  "waiting_payment",
  "paid",
  "rejected",
];

function parseDate(v: string | undefined, endOfDay: boolean): Date | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Filterable clip history — Mod/Admin/Owner see every clip on the campaign; a creator sees only
 * their own (same scoping rule as everywhere else). One page, branching by role, per the pattern
 * already used on the main campaign dashboard.
 */
export default async function ClipHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; from?: string; to?: string; creator?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const userId = await requireUserId();
  const campaign = await getCampaignForUser(userId, id);
  if (!campaign) notFound(); // "not found" and "not yours" look identical
  const role = (await getRoleForCampaign(userId, id))!;
  // Brand has its own read-only, creator-identity-free feed on the dashboard (getBrandClipFeed) --
  // this page's reviewer branch is Mod-minimum and would otherwise throw for a Brand actor.
  if (role === "brand") redirect(`/campaigns/${id}`);

  const status: ClipHistoryStatusFilter = (STATUS_VALUES as string[]).includes(sp.status ?? "")
    ? (sp.status as ClipHistoryStatusFilter)
    : "all";
  const from = parseDate(sp.from, false);
  const to = parseDate(sp.to, true);

  const isCreator = role === "creator";
  // Reviewers only. The URL's creator id is never trusted: it must resolve to a real creator on THIS
  // campaign (username looked up server-side), otherwise it's silently ignored. A creator's own
  // view is already scoped to themselves, so the param means nothing there.
  const scopedCreator =
    !isCreator && typeof sp.creator === "string" && sp.creator ? await getCampaignCreator(userId, id, sp.creator) : null;
  const { summary, rows } = isCreator
    ? await getMyClipHistory(userId, id, { status, from, to })
    : await getReviewerClipHistory(userId, id, { status, from, to, creatorId: scopedCreator?.userId });

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-sm font-semibold text-gold-light">{campaign.brandName}</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{campaign.name}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          Your role: <Badge status={role} />
        </p>
      </div>
      <ClipHistoryBrowser
        campaignId={id}
        basePath={`/campaigns/${id}/history`}
        status={status}
        from={sp.from ?? ""}
        to={sp.to ?? ""}
        summary={summary}
        rows={rows}
        showCreator={!isCreator}
        creator={scopedCreator ? { id: scopedCreator.userId, username: scopedCreator.username } : undefined}
        canDelete={role === "owner" || role === "admin"}
        canReview={!isCreator}
        canClipApprove={role === "owner" || role === "admin"}
        canReverseRejection={role === "owner" || role === "admin"}
      />
    </main>
  );
}
