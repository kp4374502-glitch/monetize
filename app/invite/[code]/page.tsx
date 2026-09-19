import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { lookupInvite } from "@/lib/campaigns/service";
import { redeemInviteAction } from "@/app/campaigns/actions";
import { Button } from "@/components/ui/button";

const messages = {
  not_found: "This invite link doesn't exist. Check that you copied the full link.",
  revoked: "This invite link has been revoked. Ask the campaign team for a new one.",
} as const;

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const found = await lookupInvite(code);

  if (!found.ok) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="mb-2 text-2xl font-bold">Invite link unavailable</h1>
        <p data-testid="invite-error" className="text-text-secondary">{messages[found.reason]}</p>
      </main>
    );
  }

  const { userId } = await auth();
  const back = encodeURIComponent(`/invite/${code}`);

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <p className="text-sm text-text-secondary">{found.campaign.brandName}</p>
      <h1 className="mb-4 text-2xl font-bold">Join {found.campaign.name}</h1>
      {userId ? (
        <form action={redeemInviteAction.bind(null, code)}>
          <Button type="submit">Join campaign</Button>
        </form>
      ) : (
        <div className="flex justify-center gap-3">
          <Link href={`/sign-up?redirect_url=${back}`}><Button>Sign up to join</Button></Link>
          <Link href={`/sign-in?redirect_url=${back}`}><Button variant="outline">Sign in</Button></Link>
        </div>
      )}
    </main>
  );
}
