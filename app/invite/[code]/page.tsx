import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { LinkIcon, ShieldAlert } from "lucide-react";
import { lookupInvite } from "@/lib/campaigns/service";
import { redeemInviteAction } from "@/app/campaigns/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const messages = {
  not_found: "This invite link doesn't exist. Check that you copied the full link.",
  revoked: "This invite link has been revoked. Ask the campaign team for a new one.",
} as const;

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const found = await lookupInvite(code);

  if (!found.ok) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-12">
        <Card className="w-full" innerClassName="text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">Invite link unavailable</h1>
          <p data-testid="invite-error" className="mt-2 text-text-secondary">{messages[found.reason]}</p>
        </Card>
      </main>
    );
  }

  const { userId } = await auth();
  const back = encodeURIComponent(`/invite/${code}`);

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,rgba(240,197,114,0.14),transparent_70%)]"
      />
      <Card className="w-full" innerClassName="text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold-gradient text-black">
          <LinkIcon className="h-6 w-6" />
        </span>
        <p className="text-sm text-text-secondary">You&apos;ve been invited to</p>
        <p className="text-sm font-semibold text-gold-light">{found.campaign.brandName}</p>
        <h1 className="mb-6 mt-1 text-3xl font-extrabold tracking-tight">Join {found.campaign.name}</h1>
        {userId ? (
          <form action={redeemInviteAction.bind(null, code)}>
            <Button type="submit" size="lg" className="w-full">Join campaign</Button>
          </form>
        ) : (
          <div className="grid gap-3">
            <Link href={`/sign-up?redirect_url=${back}`} className={buttonVariants({ variant: "primary", size: "lg" })}>
              Sign up to join
            </Link>
            <Link href={`/sign-in?redirect_url=${back}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Sign in
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
