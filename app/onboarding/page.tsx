import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { getCreatorProfile } from "@/lib/creators/service";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

/**
 * Creator onboarding after /sign-up: profile steps, then the mandatory Discord step, then /explore (or the
 * invite link they came from). A finished creator who comes back here is sent straight on.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const userId = await requireUserId();
  const { redirect_url } = await searchParams;
  const next = redirect_url?.startsWith("/") && !redirect_url.startsWith("//") ? redirect_url : undefined;

  const profile = await getCreatorProfile(userId);
  if (profile?.onboardingCompletedAt) redirect(next ?? "/explore");

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl items-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,rgba(240,197,114,0.14),transparent_70%)]"
      />
      <OnboardingWizard
        next={next}
        initial={{
          firstName: profile?.firstName ?? "",
          lastName: profile?.lastName ?? "",
          birthday: profile?.birthday ?? "",
          gender: profile?.gender ?? "",
          country: profile?.country ?? "",
          phoneCountryCode: profile?.phoneCountryCode ?? "",
          phoneNumber: profile?.phoneNumber ?? "",
          discordUsername: profile?.discordUsername ?? "",
          creatorType: profile?.creatorType ?? "",
          socials: profile?.socials ?? [],
          showcaseUrls: profile?.showcaseUrls ?? [],
          profileSaved: Boolean(profile),
          discordJoinClicked: Boolean(profile?.discordJoinClickedAt),
        }}
      />
    </main>
  );
}
