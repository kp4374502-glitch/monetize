import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, BadgeCheck, Film, Wallet } from "lucide-react";
import { requireUserId } from "@/lib/auth/ensure-user";
import { getCampaignsForUser, isPlatformOwner } from "@/lib/auth/roles";
import { getBrandRequestForUser } from "@/lib/brand/service";
import { needsOnboarding } from "@/lib/creators/gate";
import { BrandRequestStatus } from "@/components/brand-request-status";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";

const features = [
  { icon: Film, title: "Creators submit posts", body: "Paste a TikTok, Instagram or YouTube link — views and likes are pulled in automatically." },
  { icon: BadgeCheck, title: "Reviewers verify", body: "Approve or reject with a reason, check the analytics proof, and set the qualifying audience." },
  { icon: Wallet, title: "Payouts calculate themselves", body: "Each campaign's formula, budget cap and mark-paid limits are enforced for you." },
];

function Landing() {
  return (
    <main className="relative overflow-hidden">
      <section className="mx-auto max-w-4xl px-4 pb-10 pt-3 text-center sm:pb-16 sm:pt-28">
        {/* Compact on phones so the whole hero (buttons included) fits one screen; 96px from sm up. */}
        <Image
          src="/logo.png"
          alt=""
          width={96}
          height={96}
          priority
          className="mx-auto mb-3 h-14 w-14 object-contain sm:mb-6 sm:h-24 sm:w-24"
        />
        <p className="mx-auto mb-3 w-fit rounded-full sm:mb-6 border border-gold-border/40 bg-gold-light/10 px-4 py-1 text-xs font-medium tracking-[-0.01em] text-gold-light">
          Paid clipping campaigns
        </p>
        <h1 className="text-4xl font-medium leading-[1.06] tracking-[-0.05em] text-[#c2c2c2] sm:text-7xl sm:leading-[1.02]">
          Get every post{" "}
          <span className="inline-block rounded-full border border-gold-border/70 px-[0.3em] pb-[0.06em] text-white">reviewed</span>,<br className="hidden sm:block" /> every payout{" "}
          <span className="inline-block rounded-full border border-gold-border/70 px-[0.3em] pb-[0.06em] text-white">tracked</span>.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-base text-text-secondary sm:mt-6 sm:text-lg">
          Monetize is where brands run clipping campaigns: creators submit, reviewers verify, and what everyone is owed
          is always one page away.
        </p>
        {/* Creators: sign in, or start the self-serve sign-up + onboarding (/sign-up -> /onboarding).
            Owners/Admins use the header's "Owner / Admin Sign In". Brands still request access at the
            access-code-gated /brand-signup via the small link underneath. */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:mt-10 sm:gap-3">
          <Link href="/sign-in" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Sign In as Existing Creator
          </Link>
          <Link href="/sign-up" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Sign Up as a New Creator <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-3 text-sm text-text-secondary sm:mt-4">
          Running a brand?{" "}
          <Link href="/brand-signup" className="font-medium text-gold-light hover:underline">Request access</Link>
        </p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-24 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gold-gradient text-black">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="font-medium tracking-[-0.02em]">{title}</h3>
            <p className="mt-1.5 text-sm text-text-secondary">{body}</p>
          </Card>
        ))}
      </section>

      {/* Closing CTA: same block as the marketing site's footer ("Ready to launch your campaign?") */}
      <section className="border-t border-white/[0.08] px-4 py-14 text-center sm:py-20">
        <h2 className="mx-auto max-w-3xl text-[clamp(2rem,6.5vw,4.5rem)] font-medium leading-[1.02] tracking-[-0.05em]">
          <span className="block">Ready to launch</span>
          <span className="block">your campaign?</span>
        </h2>
        <div className="mx-auto mt-10 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/brand-signup" className={buttonVariants({ variant: "primary", size: "lg", className: "min-h-14 flex-1" })}>
            Launch a campaign
          </Link>
          <a href="https://usemonetize.co/#case-studies" className={buttonVariants({ variant: "outline", size: "lg", className: "min-h-14 flex-1" })}>
            See a Demo
          </a>
        </div>
      </section>
    </main>
  );
}

export default async function Home() {
  const { userId } = await auth();
  if (!userId) return <Landing />;

  await requireUserId(); // mirror the Clerk user into `users` on first visit
  // A self-serve creator who hasn't finished onboarding (profile + Discord) goes back to it first.
  if (await needsOnboarding(userId)) redirect("/onboarding");
  const [list, owner, brandRequest] = await Promise.all([
    getCampaignsForUser(userId),
    isPlatformOwner(userId),
    getBrandRequestForUser(userId),
  ]);

  // One campaign: go straight there. Otherwise show a simple list so nobody has to hunt.
  if (list.length === 1) redirect(`/campaigns/${list[0].id}`);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      {brandRequest && <BrandRequestStatus request={brandRequest} />}
      <SectionHeader
        title="Your campaigns"
        count={list.length}
        action={
          owner && (
            <Link href="/campaigns/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
              New campaign
            </Link>
          )
        }
      />
      {list.length === 0 ? (
        <Card innerClassName="py-12 text-center">
          <p className="text-lg font-bold">No campaigns yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
            {owner
              ? "Create your first campaign to get started."
              : "Browse the active campaigns and join one, or open an invite link from a campaign team."}
          </p>
          {!owner && (
            <Link href="/explore" className={buttonVariants({ variant: "primary", className: "mt-6" })}>
              Browse active campaigns
            </Link>
          )}
          {owner && (
            <Link href="/campaigns/new" className={buttonVariants({ variant: "primary", className: "mt-6" })}>
              Create a campaign
            </Link>
          )}
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`} className="block transition hover:-translate-y-0.5">
                <Card innerClassName="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{c.name}</span>
                    <span className="block truncate text-sm text-text-secondary">{c.brandName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {c.status !== "active" && <Badge status={c.status} />}
                    <Badge status={c.role ?? "creator"} />
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
