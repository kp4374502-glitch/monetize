"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { CREATOR_SIGNUP_FLOW, SIGNUP_FLOW_KEY } from "@/lib/creators/flow";

function clerkMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) return err.errors[0]?.longMessage ?? err.errors[0]?.message ?? "Something went wrong.";
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

/**
 * Step 1 of self-serve creator sign-up: email + username + password, then the 6-digit code Clerk emails.
 * Clerk requires all three on this instance (email for the code, username because campaign teams add
 * people by username, password so the existing username+password sign-in keeps working). The
 * signupFlow flag routes the new account into /onboarding until the profile + Discord steps are done.
 */
export function CreatorSignUp({ next }: { next?: string }) {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const [stage, setStage] = React.useState<"details" | "code">("details");
  const [email, setEmail] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [resent, setResent] = React.useState(false);

  const onboardingUrl = next ? `/onboarding?redirect_url=${encodeURIComponent(next)}` : "/onboarding";

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setBusy(true);
    setError("");
    try {
      await signUp.create({
        emailAddress: email.trim(),
        username: username.trim(),
        password,
        unsafeMetadata: { [SIGNUP_FLOW_KEY]: CREATOR_SIGNUP_FLOW },
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStage("code");
    } catch (err) {
      setError(clerkMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setBusy(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(onboardingUrl);
        return;
      }
      setError("We couldn't finish creating your account. Please check your details and try again.");
    } catch (err) {
      setError(clerkMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!isLoaded) return;
    setError("");
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setResent(true);
    } catch (err) {
      setError(clerkMessage(err));
    }
  }

  return (
    <Card className="w-full" innerClassName="p-6 sm:p-7">
      {stage === "details" ? (
        <form onSubmit={submitDetails} className="grid gap-4" data-testid="creator-signup-details">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Continue as a Creator</h2>
            <p className="mt-1 text-sm text-text-secondary">Enter your email and we&apos;ll send you a code.</p>
          </div>
          <Field label="Email">
            <Input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Username" hint="Campaign teams see this. It can't be changed later.">
            <Input autoComplete="username" placeholder="yourname" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Password" hint="You can sign in with this or with an email code.">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {/* Clerk's bot protection renders its challenge here when it needs one */}
          <div id="clerk-captcha" />
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <Button type="submit" size="lg" disabled={!isLoaded || busy}>
            {busy ? "Sending code…" : "Continue"}
          </Button>
          <p className="text-center text-sm text-text-secondary">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-semibold text-gold-light hover:underline">Sign in</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={submitCode} className="grid gap-4" data-testid="creator-signup-code">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Enter the code we sent you</h2>
            <p className="mt-1 text-sm text-text-secondary">We sent a 6-digit code to {email.trim()}.</p>
          </div>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            aria-label="Verification code"
            className="text-center text-2xl tracking-[0.6em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Submit"}
          </Button>
          <p className="text-center text-sm text-text-secondary">
            {resent ? "A new code is on its way." : "Didn't get a code?"}{" "}
            <button type="button" onClick={resend} className="font-semibold text-gold-light hover:underline">Resend code</button>
            {" · "}
            <button
              type="button"
              onClick={() => { setStage("details"); setCode(""); setError(""); }}
              className="font-semibold text-gold-light hover:underline"
            >
              Change email
            </button>
          </p>
        </form>
      )}
    </Card>
  );
}
