import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { AuthShell } from "@/components/auth-shell";
import { BrandCodeForm } from "@/components/brand-code-form";
import { BrandGateBanner } from "@/components/brand-gate-banner";
import { Card } from "@/components/ui/card";
import { GATE_COOKIE, verifyGateToken } from "@/lib/brand/gate";

const alreadyHaveAccount = (
  <p className="text-sm text-text-secondary">
    Already have an account?{" "}
    <Link href="/sign-in" className="font-semibold text-gold-light hover:underline">Sign in</Link>
  </p>
);

/**
 * Brand sign-up, distinct from creator sign-up. Step 1: the shared access code (BRAND_SIGNUP_CODE).
 * Step 2 (code accepted): Clerk sign-up, then /brand-request where they describe the brand. This only
 * files a REQUEST — nothing here grants Owner status; the platform Owner reviews each one by hand.
 */
export default async function BrandSignupPage() {
  const secret = process.env.BRAND_SIGNUP_CODE;

  if (!secret) {
    return (
      <AuthShell title="Brand" accent="sign-up" subtitle="This isn't open right now.">
        <Card className="w-full" innerClassName="text-center text-sm text-text-secondary">
          Brand sign-up is closed. If you were expecting access, contact the platform team.
        </Card>
        {alreadyHaveAccount}
      </AuthShell>
    );
  }

  const passed = verifyGateToken(secret, (await cookies()).get(GATE_COOKIE)?.value);
  if (!passed) {
    return (
      <AuthShell title="Brand" accent="sign-up" subtitle="Enter the access code you were given to continue.">
        <BrandCodeForm />
        {alreadyHaveAccount}
      </AuthShell>
    );
  }

  const { userId } = await auth();
  if (userId) redirect("/brand-request"); // already has an account: skip straight to the request form

  return (
    <AuthShell title="Create your" accent="brand account" subtitle="Next, tell us about your brand. The platform team reviews every request.">
      <BrandGateBanner />
      <SignUp routing="path" path="/brand-signup" forceRedirectUrl="/brand-request" signInUrl="/sign-in" />
      {alreadyHaveAccount}
    </AuthShell>
  );
}
