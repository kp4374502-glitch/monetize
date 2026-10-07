import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireUserId } from "@/lib/auth/ensure-user";
import { listActiveCampaigns } from "@/lib/campaigns/service";
import { needsOnboarding } from "@/lib/creators/gate";
import { joinCampaignAction } from "@/app/campaigns/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PLATFORM_LABELS: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

/** Every active campaign a creator can join with one click — where new creators land after onboarding. */
export default async function ExplorePage() {
  const userId = await requireUserId();
  if (await needsOnboarding(userId)) redirect("/onboarding");
  const list = await listActiveCampaigns(userId);

  return (
    <main className="relative mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,rgba(240,197,114,0.12),transparent_70%)]"
      />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Active <span className="font-serif font-medium italic text-gold-light">campaigns</span>
        </h1>
        <p className="mt-2 text-text-secondary">Pick a campaign to join, then start submitting your posts.</p>
      </div>

      {list.length === 0 ? (
        <Card innerClassName="py-12 text-center">
          <p className="text-lg font-bold">No campaigns are open right now</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
            New campaigns are announced in our Discord first. Check back soon.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="explore-list">
          {list.map((c) => (
            <li key={c.id}>
              <Card className="h-full" innerClassName="flex h-full flex-col gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gold-light">{c.brandName}</p>
                  <p className="truncate text-lg font-bold">{c.name}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.eligiblePlatforms.map((p) => (
                    <Badge key={p} status="platform">{PLATFORM_LABELS[p] ?? p}</Badge>
                  ))}
                </div>
                <div className="mt-auto">
                  {c.joined ? (
                    <Link href={`/campaigns/${c.id}`} className={buttonVariants({ variant: "outline", className: "w-full" })}>
                      Joined · Open <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <form action={joinCampaignAction.bind(null, c.id)}>
                      <Button type="submit" className="w-full">Join campaign</Button>
                    </form>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
