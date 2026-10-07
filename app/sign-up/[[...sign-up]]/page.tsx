import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AuthShell } from "@/components/auth-shell";
import { CreatorSignUp } from "@/components/onboarding/creator-sign-up";

/**
 * Self-serve creator sign-up (homepage "Sign Up as a New Creator", and an invite link's "Sign up to join").
 * Creates the account with email + code, then hands off to /onboarding. redirect_url (set by invite links)
 * is carried through onboarding so the creator still lands on the invite afterwards.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const { userId } = await auth();
  if (userId) redirect("/");
  const { redirect_url } = await searchParams;
  const next = redirect_url?.startsWith("/") && !redirect_url.startsWith("//") ? redirect_url : undefined;

  return (
    <AuthShell title="Start" accent="earning" subtitle="Create your creator account in a few steps.">
      <CreatorSignUp next={next} />
    </AuthShell>
  );
}
