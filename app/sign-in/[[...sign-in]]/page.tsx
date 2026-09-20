import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export default function Page() {
  return (
    <AuthShell title="Welcome" accent="back" subtitle="Sign in to your Monetize account.">
      <SignIn />
    </AuthShell>
  );
}
