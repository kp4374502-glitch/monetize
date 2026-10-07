import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

/**
 * One Clerk sign-in for everyone; the app resolves each person's role after login. ?as=admin (the header's
 * "Owner / Admin Sign In") only changes the wording and hides the creator sign-up link. Clerk offers
 * email + code and username + password, as enabled on the Clerk instance.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const admin = as === "admin";

  return admin ? (
    <AuthShell title="Owner / Admin" accent="sign in" subtitle="Enter your admin email and the code we send you.">
      {/* No sign-up link here: Owner/Admin accounts are never self-serve. */}
      <SignIn appearance={{ elements: { footerAction: "!hidden" } }} />
    </AuthShell>
  ) : (
    <AuthShell title="Welcome" accent="back" subtitle="Sign in to your Monetize creator account.">
      <SignIn signUpUrl="/sign-up" />
    </AuthShell>
  );
}
