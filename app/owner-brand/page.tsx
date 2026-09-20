import Link from "next/link";
import { ArrowLeft, Building2, LogIn } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

/**
 * Landing-page entry point for the platform side of the product. It only routes people to pages that
 * already exist: /sign-in (Owner, Admins, Mods) or /brand-signup (the access-code-gated brand request).
 * There is no separate auth flow here, and creators keep using the main "Sign in" button.
 */
export default function OwnerBrandPage() {
  return (
    <AuthShell title="Owner / Brand" accent="access" subtitle="Choose how you'd like to continue.">
      <div className="grid w-full gap-4">
        <Card innerClassName="p-6">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gold-gradient text-black">
            <LogIn className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="text-lg font-bold">I already have an account</h2>
          <p className="mt-1 text-sm text-text-secondary">Owners, Admins and Mods: sign in to open your campaigns.</p>
          <Link href="/sign-in" className={buttonVariants({ variant: "primary", size: "lg", className: "mt-5 w-full" })}>
            Sign in
          </Link>
        </Card>

        <Card innerClassName="p-6">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-gold-border/60 text-gold-light">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="text-lg font-bold">I&apos;m a new brand</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Request access to run a campaign. You&apos;ll need the access code you were given, and the platform team reviews
            every request before anything goes live.
          </p>
          <Link href="/brand-signup" className={buttonVariants({ variant: "outline", size: "lg", className: "mt-5 w-full" })}>
            Brand sign-up
          </Link>
        </Card>
      </div>

      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-gold-light">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>
    </AuthShell>
  );
}
