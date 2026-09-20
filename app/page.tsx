import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, BadgeCheck, Film, Wallet } from "lucide-react";
import { requireUserId } from "@/lib/auth/ensure-user";
import { getCampaignsForUser, isPlatformOwner } from "@/lib/auth/roles";
import { getBrandRequestForUser } from "@/lib/brand/service";
import { BrandRequestStatus } from "@/components/brand-request-status";
import { LogoMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";

const features = [
  { icon: Film, title: "Creators submit clips", body: "Paste a TikTok, Instagram or YouTube link — views and likes are pulled in automatically." },
  { icon: BadgeCheck, title: "Reviewers verify", body: "Approve or reject with a reason, check the video proof, and set the qualifying audience." },
  { icon: Wallet, title: "Payouts calculate themselves", body: "Each campaign's formula, budget cap and mark-paid limits are enforced for you." },
];

function Landing() {
  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgba(240,197,114,0.16),transparent_70%)]"
      />
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:pt-28">
        <LogoMark size={96} priority className="mx-auto mb-6 drop-shadow-[0_0_28px_rgba(240,197,114,0.3)]" />
        <p className="mx-auto mb-6 w-fit rounded-full border border-gold-border/40 bg-gold-light/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-gold-light">
          Paid clipping campaigns
        </p>
        <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl">
          Get every clip <span className="font-serif font-medium italic text-gold-light">reviewed</span>,<br className="hidden sm:block" /> every payout{" "}
          <span className="font-serif font-medium italic text-gold-light">tracked</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Monetize is where brands run clipping campaigns: creators submit, reviewers verify, and what everyone is owed
          is always one page away.
        </p>
        {/* "Sign in" is for anyone with an existing account (creators, Owners, Admins, Mods: the app resolves
            the right view from each person's role after login). The outlined button leads to the
            access-code-gated brand request flow at /brand-signup, NOT to the sign-in page. */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/sign-in" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Sign in <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/brand-signup" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Owner / Agency sign in
          </Link>
        </div>
        <p className="mt-4 text-sm text-text-secondary">New creator? Use the invite link your campaign team sent you.</p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-24 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gold-gradient text-black">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="font-bold">{title}</h3>
            <p className="mt-1.5 text-sm text-text-secondary">{body}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}

export default async function Home() {
  const { userId } = await auth();
  if (!userId) return <Landing />;

  await requireUserId(); // mirror the Clerk user into `users` on first visit
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
              : "Ask a campaign team for an invite link — opening it will add the campaign here."}
          </p>
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
