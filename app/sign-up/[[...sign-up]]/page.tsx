import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export default function Page() {
  return (
    <AuthShell title="Join the" accent="campaign" subtitle="Create your account to start submitting clips.">
      <SignUp />
    </AuthShell>
  );
}
