/**
 * Clerk unsafeMetadata flag set by the self-serve creator sign-up form
 * (components/onboarding/creator-sign-up.tsx). Client-safe: no server imports here.
 */
export const SIGNUP_FLOW_KEY = "signupFlow";
export const CREATOR_SIGNUP_FLOW = "creator";

/**
 * True for an account made through the self-serve creator sign-up that hasn't finished onboarding
 * (profile + Discord step). Accounts made any other way (invite-only era, brand sign-up, Owner/Admin)
 * never carry the flag, so they are never sent to /onboarding.
 */
export function isOnboardingPending(
  metadata: Record<string, unknown> | undefined,
  profile: { onboardingCompletedAt: Date | null } | null,
): boolean {
  return metadata?.[SIGNUP_FLOW_KEY] === CREATOR_SIGNUP_FLOW && !profile?.onboardingCompletedAt;
}

/** Monetize community invite used by the mandatory "Join Community" onboarding step. */
export const DISCORD_INVITE_URL = "https://discord.gg/z6vqNTn9jq";
