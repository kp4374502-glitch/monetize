import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export default function Page() {
  return (
    <AuthShell title="Welcome" accent="back" subtitle="Sign in to your Monetize account.">
      {/* Hide Clerk's "Don't have an account? Sign up" link: real sign-up happens only through an invite
          link or the access-code-gated Brand sign-up. (This is cosmetic, not a security boundary.) */}
      <SignIn appearance={{ elements: { footerAction: "!hidden" } }} />
    </AuthShell>
  );
}
